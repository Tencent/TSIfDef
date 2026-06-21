import { createRequire } from "node:module";

import {
  loadTsIfDefConfig,
  profileFromConfig,
  tsIfDefConfigFileName,
} from "../cli/config.js";
import type { MacroDefinitions } from "../core/expression.js";
import { ProfileStateController, configurationSection, profileConfigurationKey } from "./profile-state.js";
import { MacroPresentationController } from "./macro-presentation.js";
import { MacroCommandController } from "./macro-commands.js";
import type {
  DecorationType,
  DiagnosticCollection,
  Disposable,
  DocumentSnapshot,
  ExtensionHost,
  FoldingRangeProvider,
  QuickPickItem,
  QuickPickOptions,
  StatusBarItem,
  WorkspaceConfiguration,
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
  readonly ConfigurationTarget: { readonly Workspace: number };
  readonly Range: VsRange;
  readonly FoldingRange: VsFoldingRange;
  readonly Uri: VsUri;
  Diagnostic: new (range: unknown, message: string, severity?: number) => { code?: unknown };
  readonly window: {
    createStatusBarItem(alignment: number, priority?: number): StatusBarItem;
    createTextEditorDecorationType(options: unknown): { dispose(): void };
    showQuickPick(
      items: readonly QuickPickItem[],
      options?: QuickPickOptions,
    ): PromiseLike<QuickPickItem | undefined>;
    showInformationMessage(message: string): PromiseLike<unknown>;
    showErrorMessage(message: string): PromiseLike<unknown>;
    readonly visibleTextEditors: readonly VsTextEditor[];
    readonly onDidChangeVisibleTextEditors: VsEvent<readonly VsTextEditor[]>;
  };
  readonly workspace: {
    getConfiguration(section: string): {
      get<T>(key: string): T | undefined;
      update(key: string, value: unknown, target?: unknown): PromiseLike<void>;
    };
    readonly workspaceFolders?: ReadonlyArray<{ readonly uri: { readonly fsPath: string } }>;
    readonly textDocuments: readonly VsTextDocument[];
    readonly onDidChangeConfiguration: VsEvent<{ affectsConfiguration(section: string): boolean }>;
    readonly onDidChangeTextDocument: VsEvent<{ readonly document: VsTextDocument }>;
    readonly onDidOpenTextDocument: VsEvent<VsTextDocument>;
    readonly onDidCloseTextDocument: VsEvent<VsTextDocument>;
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

/** Adapt the real `vscode` API to the host interface the shell depends on. */
export function createHost(vscode: VsCodeApi): ExtensionHost {
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
    getConfiguration(section: string): WorkspaceConfiguration {
      const configuration = vscode.workspace.getConfiguration(section);
      return {
        get: <T,>(key: string) => configuration.get<T>(key),
        update: (key, value) =>
          Promise.resolve(configuration.update(key, value, vscode.ConfigurationTarget.Workspace)),
      };
    },
    createStatusBarItem: () => vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100),
    registerCommand: (command, handler) => vscode.commands.registerCommand(command, handler),
    showQuickPick: (items, options) => Promise.resolve(vscode.window.showQuickPick(items, options)),
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
    configureTypeScriptPlugin: async (name, configuration) => {
      const extension = vscode.extensions.getExtension("vscode.typescript-language-features");
      if (extension === undefined) {
        throw new Error("VSCode TypeScript language features extension is unavailable.");
      }
      const exports = (await extension.activate()) as {
        getAPI?(version: number): {
          configurePlugin(pluginName: string, config: Readonly<Record<string, unknown>>): void;
        };
      };
      const api = exports.getAPI?.(0);
      if (api === undefined) {
        throw new Error("VSCode TypeScript extension API 0 is unavailable.");
      }
      api.configurePlugin(name, configuration);
    },
  };
}

interface ActiveExtension {
  readonly profileController: ProfileStateController;
  readonly presentation: MacroPresentationController;
  readonly commands: MacroCommandController;
  dispose(): void;
}

let active: ActiveExtension | undefined;

/** VSCode entry point. Binds the live API to the host and starts the shell. */
export function activate(context: ExtensionContext): void {
  // Resolve `vscode` lazily so the package builds and tests without it present.
  const vscode = createRequire(__filename)("vscode") as VsCodeApi;
  const host = createHost(vscode);

  let definitions: MacroDefinitions | undefined;
  const profileController = new ProfileStateController(host);
  const presentation = new MacroPresentationController(host, () => definitions);

  const configPathFor = (root: string): string => `${root}/${tsIfDefConfigFileName}`;

  const reloadDefinitions = async (): Promise<void> => {
    const root = host.workspaceRoot();
    const { profile } = profileController.effectiveProfile();
    if (root === undefined || profile === undefined) {
      definitions = undefined;
    } else {
      const configPath = configPathFor(root);
      try {
        definitions = profileFromConfig(
          await loadTsIfDefConfig(root),
          profile,
        ).definitions;
        await host.configureTypeScriptPlugin("tsifdef-tsserver", {
          profile,
          configPath,
        });
        profileController.reportProfileLoad(profile);
      } catch (error) {
        definitions = undefined;
        const message = `Failed to load TSIfDef profile '${profile}' from ${configPath}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        profileController.reportProfileLoad(profile, message);
        host.showErrorMessage(message);
      }
    }
    presentation.refresh();
  };

  const commands = new MacroCommandController(host, () => {
    const root = host.workspaceRoot();
    const { profile } = profileController.effectiveProfile();
    return {
      projectRoot: root,
      profileName: profile,
      configPath: root !== undefined && profile !== undefined ? configPathFor(root) : undefined,
      definitions,
    };
  });

  profileController.activate();
  presentation.activate();
  commands.activate();
  void reloadDefinitions();

  const subscriptions: Disposable[] = [
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${configurationSection}.${profileConfigurationKey}`)) {
        profileController.refresh();
        void reloadDefinitions();
      }
    }),
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
    commands,
    dispose: () => {
      for (const subscription of subscriptions) {
        subscription.dispose();
      }
      commands.dispose();
      presentation.dispose();
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
