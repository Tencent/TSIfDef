import { createRequire } from "node:module";

import {
  ProfileStateController,
} from "./profile-state.js";
import type {
  Disposable,
  ExtensionHost,
  QuickPickItem,
  QuickPickOptions,
  StatusBarItem,
  WorkspaceConfiguration,
} from "./host.js";

/**
 * The slice of the real `vscode` module the activation adapter consumes. It is
 * declared locally so the package builds without `@types/vscode`; the module is
 * resolved at runtime inside the extension host, never during CI or tests.
 */
interface VsCodeApi {
  readonly StatusBarAlignment: { readonly Left: number };
  readonly window: {
    createStatusBarItem(alignment: number, priority?: number): StatusBarItem;
    showQuickPick(
      items: readonly QuickPickItem[],
      options?: QuickPickOptions,
    ): PromiseLike<QuickPickItem | undefined>;
    showInformationMessage(message: string): PromiseLike<unknown>;
  };
  readonly workspace: {
    getConfiguration(section: string): {
      get<T>(key: string): T | undefined;
      update(key: string, value: unknown, target?: unknown): PromiseLike<void>;
    };
    readonly workspaceFolders?: ReadonlyArray<{ readonly uri: { readonly fsPath: string } }>;
  };
  readonly commands: {
    registerCommand(command: string, handler: () => unknown): Disposable;
  };
  readonly ConfigurationTarget: { readonly Workspace: number };
}

/** The shape VSCode passes to `activate`; only `subscriptions` is required here. */
interface ExtensionContext {
  readonly subscriptions: Disposable[];
}

let controller: ProfileStateController | undefined;

/** Adapt the real `vscode` API to the host interface the shell depends on. */
export function createHost(vscode: VsCodeApi): ExtensionHost {
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
    registerCommand: (command, handler) =>
      vscode.commands.registerCommand(command, () => void handler()),
    showQuickPick: (items, options) => Promise.resolve(vscode.window.showQuickPick(items, options)),
    showInformationMessage: (message) => void vscode.window.showInformationMessage(message),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/** VSCode entry point. Binds the live API to the host and starts the shell. */
export function activate(context: ExtensionContext): void {
  // Resolve `vscode` lazily so the package builds and tests without it present.
  const vscode = createRequire(__filename)("vscode") as VsCodeApi;
  controller = new ProfileStateController(createHost(vscode));
  controller.activate();
  context.subscriptions.push({ dispose: () => deactivate() });
}

/** VSCode shutdown hook. */
export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
