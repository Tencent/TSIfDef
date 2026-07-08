/**
 * Minimal, injectable surface of the VSCode API used by the extension shell.
 *
 * The shell depends only on this interface so its logic runs under the standard
 * Node test runner without the VSCode extension host. `src/vscode/extension.ts`
 * binds the real `vscode` module to this surface at activation time.
 */

import type {
  DocumentDiagnostic,
  DocumentRange,
  FoldingRange,
} from "./document-analysis.js";

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

/** An open macro document the presentation layer must keep in sync. */
export interface DocumentSnapshot {
  /** Stable document identity (its URI string in the real host). */
  readonly uri: string;
  /** Whether this document holds macro-bearing TypeScript-family source. */
  readonly isMacroDocument: boolean;
  /** The current in-memory text, including unsaved edits. */
  getText(): string;
}

/** Subset of `vscode.DiagnosticCollection`. */
export interface DiagnosticCollection extends Disposable {
  set(uri: string, diagnostics: readonly DocumentDiagnostic[]): void;
  delete(uri: string): void;
  clear(): void;
}

/** Opaque handle for a decoration style; maps to `vscode.TextEditorDecorationType`. */
export interface DecorationType extends Disposable {
  readonly key: string;
}

/** Provides folding ranges for one macro document, given its current text. */
export type FoldingRangeProvider = (document: DocumentSnapshot) => readonly FoldingRange[];

/**
 * The capabilities the extension shell needs from its host. Every method maps
 * directly onto a real `vscode` API call in the activation adapter.
 */
export interface ExtensionHost {
  /** Create a left-aligned status-bar item. */
  createStatusBarItem(): StatusBarItem;
  /** Register a command handler, returning its disposable. */
  registerCommand(command: string, handler: () => unknown | Promise<unknown>): Disposable;
  /** Surface a non-blocking informational message. */
  showInformationMessage(message: string): void;
  /** The first workspace folder's filesystem path, if any. */
  workspaceRoot(): string | undefined;
  /** Create the diagnostic collection that owns published macro diagnostics. */
  createDiagnosticCollection(name: string): DiagnosticCollection;
  /** Create the inactive-code decoration style applied to grayed ranges. */
  createInactiveDecorationType(): DecorationType;
  /** Apply a decoration's ranges to a document; an empty list clears them. */
  setDecorations(uri: string, decoration: DecorationType, ranges: readonly DocumentRange[]): void;
  /** Every currently open macro document. */
  macroDocuments(): readonly DocumentSnapshot[];
  /** Register a folding-range provider for macro documents. */
  registerFoldingRangeProvider(provider: FoldingRangeProvider): Disposable;
  /** Surface a non-blocking error message. */
  showErrorMessage(message: string): void;
  /** Send live configuration to the contributed TypeScript server plugin. */
  configureTypeScriptPlugin(name: string, configuration: Readonly<Record<string, unknown>>): Promise<void>;
  /**
   * Restart the TypeScript server. The heaviest, most reliable refresh; used
   * only as a fallback.
   */
  restartTypeScriptServer(): Promise<void>;
  /**
   * Reload TypeScript projects and re-pull diagnostics without killing the
   * server. Lighter than a restart and enough to make open files re-diagnose
   * after a Profile change.
   */
  reloadTypeScriptProjects(): Promise<void>;
  /** Watch package.json and Profile JSON files that determine editor semantics. */
  watchProjectConfiguration(onChange: () => void): Disposable;
}
