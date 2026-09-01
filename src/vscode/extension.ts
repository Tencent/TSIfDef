// Copyright (C) 2026 Tencent. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MacroDefinitions } from "../core/expression.js";
import { VERSION } from "../version.js";
import { ProfileStateController } from "./profile-state.js";
import { MacroPresentationController } from "./macro-presentation.js";
import { PackageProfileController } from "./package-profile.js";
import type {
  DecorationType,
  DiagnosticCollection,
  Disposable,
  DocumentSnapshot,
  ExtensionHost,
  FoldingRangeProvider,
  StatusBarItem,
} from "./host.js";
import {
  DiagnosticSeverity,
  type DocumentDiagnostic,
  type DocumentRange,
} from "./document-analysis.js";

/**
 * The slice of the real `vscode` module the activation adapter consumes. It is
 * declared locally so the package builds without `@types/vscode`; the module is
 * resolved at runtime inside the extension host, never during CI or tests.
 */
interface VsRange {
  new (startLine: number, startCharacter: number, endLine: number, endCharacter: number): unknown;
}
interface VsFoldingRange {
  new (start: number, end: number): unknown;
}
interface VsUri {
  parse(value: string): unknown;
}
interface VsTextDocument {
  readonly uri: { toString(): string };
  readonly languageId: string;
  readonly fileName: string;
  getText(): string;
}
interface VsFoldingProvider {
  provideFoldingRanges(document: VsTextDocument): readonly unknown[];
}
interface VsTextEditor {
  readonly document: VsTextDocument;
  setDecorations(decorationType: unknown, ranges: readonly unknown[]): void;
}
interface VsEvent<T> {
  (listener: (event: T) => unknown): Disposable;
}
interface VsCodeApi {
  readonly StatusBarAlignment: { readonly Left: number };
  readonly DiagnosticSeverity: { readonly Error: number; readonly Warning: number };
  readonly Range: VsRange;
  readonly FoldingRange: VsFoldingRange;
  readonly Uri: VsUri;
  Diagnostic: new (range: unknown, message: string, severity?: number) => { code?: unknown };
  readonly window: {
    createStatusBarItem(alignment: number, priority?: number): StatusBarItem;
    createTextEditorDecorationType(options: unknown): { dispose(): void };
    showInformationMessage(message: string): PromiseLike<unknown>;
    showErrorMessage(message: string): PromiseLike<unknown>;
    readonly visibleTextEditors: readonly VsTextEditor[];
    readonly onDidChangeVisibleTextEditors: VsEvent<readonly VsTextEditor[]>;
  };
  readonly workspace: {
    readonly workspaceFolders?: ReadonlyArray<{ readonly uri: { readonly fsPath: string } }>;
    readonly textDocuments: readonly VsTextDocument[];
    readonly onDidChangeConfiguration: VsEvent<{ affectsConfiguration(section: string): boolean }>;
    readonly onDidChangeTextDocument: VsEvent<{ readonly document: VsTextDocument }>;
    readonly onDidOpenTextDocument: VsEvent<VsTextDocument>;
    readonly onDidCloseTextDocument: VsEvent<VsTextDocument>;
    createFileSystemWatcher(glob: string): {
      onDidChange: VsEvent<unknown>;
      onDidCreate: VsEvent<unknown>;
      onDidDelete: VsEvent<unknown>;
      dispose(): void;
    };
  };
  readonly languages: {
    createDiagnosticCollection(name: string): {
      set(uri: unknown, diagnostics: readonly unknown[]): void;
      delete(uri: unknown): void;
      clear(): void;
      dispose(): void;
    };
    registerFoldingRangeProvider(selector: unknown, provider: VsFoldingProvider): Disposable;
  };
  readonly commands: {
    registerCommand(command: string, handler: () => unknown | Promise<unknown>): Disposable;
    executeCommand(command: string, ...args: readonly unknown[]): PromiseLike<unknown>;
  };
  readonly extensions: {
    getExtension(id: string):
      | {
          readonly exports: unknown;
          activate(): PromiseLike<unknown>;
        }
      | undefined;
  };
}

/** The shape VSCode passes to `activate`; only `subscriptions` is required here. */
interface ExtensionContext {
  readonly subscriptions: Disposable[];
}

const macroExtensionPattern = /\.(?:d\.)?(?:ts|tsx|mts|cts)$/i;
const macroLanguageIds = new Set(["typescript", "typescriptreact"]);

function isMacroDocument(document: VsTextDocument): boolean {
  return macroLanguageIds.has(document.languageId) || macroExtensionPattern.test(document.fileName);
}

function toSnapshot(document: VsTextDocument): DocumentSnapshot {
  return {
    uri: document.uri.toString(),
    isMacroDocument: isMacroDocument(document),
    getText: () => document.getText(),
  };
}

/** Optional bridge to VSCode's built-in TypeScript language service. */
export function createTypeScriptIntegration(
  vscode: {
    readonly commands: {
      executeCommand(command: string, ...args: readonly unknown[]): PromiseLike<unknown>;
    };
    readonly extensions: VsCodeApi["extensions"];
  },
): {
  configurePlugin(
    name: string,
    configuration: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  restartServer(): Promise<void>;
  reloadProjects(): Promise<void>;
} {
  return {
    configurePlugin: async (name, configuration) => {
      const extension = vscode.extensions.getExtension("vscode.typescript-language-features");
      if (extension === undefined) {
        return;
      }
      try {
        const exports = (await extension.activate()) as {
          getAPI?(version: number): {
            configurePlugin(
              pluginName: string,
              config: Readonly<Record<string, unknown>>,
            ): void;
          };
        };
        exports.getAPI?.(0)?.configurePlugin(name, configuration);
      } catch {
        // The TypeScript language service is optional. Decorations and folding
        // still work when it is unavailable or supplied by another extension.
      }
    },
    restartServer: async () => {
      if (vscode.extensions.getExtension("vscode.typescript-language-features") === undefined) {
        return;
      }
      try {
        await vscode.commands.executeCommand("typescript.restartTsServer");
      } catch {
        // Keep the extension usable without VSCode's built-in tsserver.
      }
    },
    reloadProjects: async () => {
      if (vscode.extensions.getExtension("vscode.typescript-language-features") === undefined) {
        return;
      }
      try {
        await vscode.commands.executeCommand("typescript.reloadProjects");
      } catch {
        // Keep the extension usable without VSCode's built-in tsserver.
      }
    },
  };
}

/** Adapt the real `vscode` API to the host interface the shell depends on. */
export function createHost(vscode: VsCodeApi): ExtensionHost {
  const typeScript = createTypeScriptIntegration(vscode);
  const decorationTypes = new Map<string, { dispose(): void }>();
  let decorationSequence = 0;
  const toRange = (range: DocumentRange): unknown =>
    new vscode.Range(
      range.start.line,
      range.start.character,
      range.end.line,
      range.end.character,
    );
  const severities: Record<number, number> = {
    [DiagnosticSeverity.error]: vscode.DiagnosticSeverity.Error,
    [DiagnosticSeverity.warning]: vscode.DiagnosticSeverity.Warning,
  };
  const toDiagnostic = (diagnostic: DocumentDiagnostic): unknown => {
    const created = new vscode.Diagnostic(
      toRange(diagnostic.range),
      diagnostic.message,
      severities[diagnostic.severity],
    );
    created.code = diagnostic.code;
    return created;
  };
  return {
    createStatusBarItem: () => vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100),
    registerCommand: (command, handler) => vscode.commands.registerCommand(command, handler),
    showInformationMessage: (message) => void vscode.window.showInformationMessage(message),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    createDiagnosticCollection: (name): DiagnosticCollection => {
      const collection = vscode.languages.createDiagnosticCollection(name);
      return {
        set: (uri, diagnostics) =>
          collection.set(vscode.Uri.parse(uri), diagnostics.map(toDiagnostic)),
        delete: (uri) => collection.delete(vscode.Uri.parse(uri)),
        clear: () => collection.clear(),
        dispose: () => collection.dispose(),
      };
    },
    createInactiveDecorationType: (): DecorationType => {
      const key = `inactive-${(decorationSequence += 1)}`;
      const type = vscode.window.createTextEditorDecorationType({
        opacity: "0.5",
        isWholeLine: false,
      });
      decorationTypes.set(key, type);
      return {
        key,
        dispose: () => {
          type.dispose();
          decorationTypes.delete(key);
        },
      };
    },
    setDecorations: (uri, decoration, ranges) => {
      const type = decorationTypes.get(decoration.key);
      if (type === undefined) {
        return;
      }
      const vsRanges = ranges.map(toRange);
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === uri) {
          editor.setDecorations(type, vsRanges);
        }
      }
    },
    macroDocuments: () => vscode.workspace.textDocuments.map(toSnapshot),
    registerFoldingRangeProvider: (provider: FoldingRangeProvider): Disposable =>
      vscode.languages.registerFoldingRangeProvider(
        [{ language: "typescript" }, { language: "typescriptreact" }],
        {
          provideFoldingRanges: (document) =>
            provider(toSnapshot(document)).map(
              (fold) => new vscode.FoldingRange(fold.start, fold.end),
            ),
        },
      ),
    showErrorMessage: (message) => void vscode.window.showErrorMessage(message),
    configureTypeScriptPlugin: typeScript.configurePlugin,
    restartTypeScriptServer: typeScript.restartServer,
    reloadTypeScriptProjects: typeScript.reloadProjects,
    watchProjectConfiguration: (onChange) => {
      const watcher = vscode.workspace.createFileSystemWatcher("**/{package.json,*.json}");
      const subscriptions = [
        watcher.onDidChange(onChange),
        watcher.onDidCreate(onChange),
        watcher.onDidDelete(onChange),
      ];
      return { dispose: () => { for (const item of subscriptions) item.dispose(); watcher.dispose(); } };
    },
  };
}

interface ActiveExtension {
  readonly profileController: ProfileStateController;
  readonly presentation: MacroPresentationController;
  readonly packageProfile: PackageProfileController;
  dispose(): void;
}

let active: ActiveExtension | undefined;

/**
 * Ensure the tsserver plugin is resolvable as `node_modules/tsifdef-tsserver`.
 *
 * tsserver loads a workspace plugin by resolving the module named in
 * `typescriptServerPlugins` from the extension directory. vsce does not ship a
 * `node_modules/` tree, so the compiled plugin would otherwise be unreachable
 * and every `#if` would reach the parser as a syntax error. Recreate the tiny
 * forwarder on activation so a fresh install (or a `--force` reinstall that
 * wiped a previous shim) self-heals without manual steps.
 */
export function ensureTsserverPluginModule(): void {
  try {
    // Compiled to `<ext>/dist/vscode/extension.js`; the extension root is two up.
    const extensionRoot = dirname(dirname(__dirname));
    const moduleDir = join(extensionRoot, "node_modules", "tsifdef-tsserver");
    const manifest = join(moduleDir, "package.json");
    const index = join(moduleDir, "index.js");
    const expectedManifest = `${JSON.stringify(
      { name: "tsifdef-tsserver", version: VERSION, private: true, main: "../../dist/tsserver/plugin.js" },
      null,
      2,
    )}\n`;
    const expectedIndex = 'module.exports = require("../../dist/tsserver/plugin.js");\n';
    let currentManifest: string | undefined;
    let currentIndex: string | undefined;
    try {
      currentManifest = readFileSync(manifest, "utf8");
      currentIndex = readFileSync(index, "utf8");
    } catch {
      currentManifest = undefined;
      currentIndex = undefined;
    }
    if (currentManifest === expectedManifest && currentIndex === expectedIndex) return;
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(manifest, expectedManifest, "utf8");
    writeFileSync(index, expectedIndex, "utf8");
  } catch {
    // Best-effort: if the directory is read-only, a reinstall applies. Never
    // block activation over it.
  }
}

/** VSCode entry point. Binds the live API to the host and starts the shell. */
export function activate(context: ExtensionContext): void {
  // Resolve `vscode` lazily so the package builds and tests without it present.
  const vscode = createRequire(__filename)("vscode") as VsCodeApi;
  ensureTsserverPluginModule();
  const host = createHost(vscode);

  let definitions: MacroDefinitions | undefined;
  const profileController = new ProfileStateController(host);
  const presentation = new MacroPresentationController(host, () => definitions);

  const packageProfile = new PackageProfileController(host, profileController, (next) => {
    definitions = next;
    presentation.refresh();
  });

  profileController.activate();
  presentation.activate();
  packageProfile.activate();

  const subscriptions: Disposable[] = [
    vscode.workspace.onDidChangeTextDocument((event) =>
      presentation.refreshDocument(toSnapshot(event.document)),
    ),
    vscode.workspace.onDidOpenTextDocument((document) =>
      presentation.refreshDocument(toSnapshot(document)),
    ),
    vscode.workspace.onDidCloseTextDocument((document) =>
      presentation.closeDocument(document.uri.toString()),
    ),
    vscode.window.onDidChangeVisibleTextEditors(() => presentation.refresh()),
  ];

  active = {
    profileController,
    presentation,
    packageProfile,
    dispose: () => {
      for (const subscription of subscriptions) {
        subscription.dispose();
      }
      presentation.dispose();
      packageProfile.dispose();
      profileController.dispose();
    },
  };
  context.subscriptions.push({ dispose: () => deactivate() });
}

/** VSCode shutdown hook. */
export function deactivate(): void {
  active?.dispose();
  active = undefined;
}
