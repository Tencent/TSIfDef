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
  /** Whether TypeScript 7 / TSGo owns semantic language features in this workspace. */
  isTypeScriptGoEnabled(): boolean;
  /** Send live configuration to the contributed TypeScript server plugin. */
  configureTypeScriptPlugin(name: string, configuration: Readonly<Record<string, unknown>>): Promise<void>;
  /**
   * Restart the TypeScript server after the effective Profile changes.
   * Reloading projects is not sufficient to clear stale language-service
   * diagnostics in every workspace.
   */
  restartTypeScriptServer(): Promise<void>;
  /** Reload projects after the restarted server has received plugin config. */
  reloadTypeScriptProjects(): Promise<void>;
  /** Watch package.json and Profile JSON files that determine editor semantics. */
  watchProjectConfiguration(onChange: () => void): Disposable;
}
