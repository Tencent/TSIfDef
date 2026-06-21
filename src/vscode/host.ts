/**
 * Minimal, injectable surface of the VSCode API used by the extension shell.
 *
 * The shell depends only on this interface so its logic runs under the standard
 * Node test runner without the VSCode extension host. `src/vscode/extension.ts`
 * binds the real `vscode` module to this surface at activation time.
 */

export interface Disposable {
  dispose(): void;
}

/** Subset of `vscode.StatusBarItem`. */
export interface StatusBarItem extends Disposable {
  text: string;
  tooltip: string | undefined;
  command: string | undefined;
  show(): void;
  hide(): void;
}

/** Subset of `vscode.WorkspaceConfiguration` for one configuration section. */
export interface WorkspaceConfiguration {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}

/** A quick-pick choice offered when switching Profiles. */
export interface QuickPickItem {
  readonly label: string;
  readonly description?: string;
}

export interface QuickPickOptions {
  readonly placeHolder?: string;
}

/**
 * The capabilities the extension shell needs from its host. Every method maps
 * directly onto a real `vscode` API call in the activation adapter.
 */
export interface ExtensionHost {
  /** Read the `tsifdef` configuration section for the active workspace. */
  getConfiguration(section: string): WorkspaceConfiguration;
  /** Create a left-aligned status-bar item. */
  createStatusBarItem(): StatusBarItem;
  /** Register a command handler, returning its disposable. */
  registerCommand(command: string, handler: () => void | Promise<void>): Disposable;
  /** Present a single-selection quick pick, resolving to the chosen item or undefined. */
  showQuickPick(
    items: readonly QuickPickItem[],
    options?: QuickPickOptions,
  ): Promise<QuickPickItem | undefined>;
  /** Surface a non-blocking informational message. */
  showInformationMessage(message: string): void;
  /** The first workspace folder's filesystem path, if any. */
  workspaceRoot(): string | undefined;
}
