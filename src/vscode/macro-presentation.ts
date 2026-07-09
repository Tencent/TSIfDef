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

import type { MacroDefinitions } from "../core/expression.js";
import { analyzeDocument, computeFoldingRanges } from "./document-analysis.js";
import type {
  DecorationType,
  DiagnosticCollection,
  Disposable,
  DocumentSnapshot,
  ExtensionHost,
} from "./host.js";

/** Name of the diagnostic collection contributed by the extension. */
export const diagnosticCollectionName = "tsifdef" as const;

/**
 * Resolves the macro definitions for the currently effective Profile, or
 * `undefined` when no Profile is selected. Returning a value is synchronous so
 * the controller can refresh without awaiting I/O; the extension caches the
 * loaded Profile and updates it on switch.
 */
export type DefinitionsProvider = () => MacroDefinitions | undefined;

/**
 * Publishes macro diagnostics and grays out inactive ranges for open macro
 * documents.
 *
 * It reuses the shared core through `analyzeDocument` and depends only on the
 * injected host, so it runs without the VSCode extension host.
 */
export class MacroPresentationController {
  private diagnostics: DiagnosticCollection | undefined;
  private inactiveDecoration: DecorationType | undefined;
  private readonly decoratedDocuments = new Set<string>();
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly host: ExtensionHost,
    private readonly definitionsProvider: DefinitionsProvider,
  ) {}

  /** Create the diagnostic collection and decoration style, then render once. */
  public activate(): void {
    this.diagnostics = this.host.createDiagnosticCollection(diagnosticCollectionName);
    this.inactiveDecoration = this.host.createInactiveDecorationType();
    this.disposables.push(this.diagnostics, this.inactiveDecoration);
    this.disposables.push(
      this.host.registerFoldingRangeProvider((document) => this.foldingRanges(document)),
    );
    this.refresh();
  }

  public dispose(): void {
    for (const disposable of this.disposables.splice(0).reverse()) {
      disposable.dispose();
    }
    this.decoratedDocuments.clear();
    this.diagnostics = undefined;
    this.inactiveDecoration = undefined;
  }

  /** Recompute diagnostics and decorations for every open macro document. */
  public refresh(): void {
    if (this.diagnostics === undefined) {
      return;
    }
    const definitions = this.definitionsProvider();
    if (definitions === undefined) {
      this.clear();
      return;
    }
    const live = new Set<string>();
    for (const document of this.host.macroDocuments()) {
      if (!document.isMacroDocument) {
        continue;
      }
      live.add(document.uri);
      this.render(document, definitions);
    }
    // Drop documents that closed or stopped being macro documents since last run.
    for (const uri of [...this.decoratedDocuments]) {
      if (!live.has(uri)) {
        this.clearDocument(uri);
      }
    }
  }

  /** Refresh a single document, e.g. on edit or open. */
  public refreshDocument(document: DocumentSnapshot): void {
    if (this.diagnostics === undefined) {
      return;
    }
    const definitions = this.definitionsProvider();
    if (definitions === undefined || !document.isMacroDocument) {
      this.clearDocument(document.uri);
      return;
    }
    this.render(document, definitions);
  }

  /** Clear diagnostics and decorations for a closed document. */
  public closeDocument(uri: string): void {
    this.clearDocument(uri);
  }

  /** Folding ranges for one macro document under the effective Profile. */
  public foldingRanges(document: DocumentSnapshot) {
    const definitions = this.definitionsProvider();
    if (definitions === undefined || !document.isMacroDocument) {
      return [];
    }
    return computeFoldingRanges(document.getText(), definitions);
  }

  private render(document: DocumentSnapshot, definitions: MacroDefinitions): void {
    const analysis = analyzeDocument(document.getText(), definitions);
    this.diagnostics?.set(document.uri, analysis.diagnostics);
    if (this.inactiveDecoration !== undefined) {
      this.host.setDecorations(document.uri, this.inactiveDecoration, analysis.inactiveRanges);
    }
    this.decoratedDocuments.add(document.uri);
  }

  private clear(): void {
    this.diagnostics?.clear();
    for (const uri of [...this.decoratedDocuments]) {
      this.clearDocumentDecoration(uri);
    }
    this.decoratedDocuments.clear();
  }

  private clearDocument(uri: string): void {
    this.diagnostics?.delete(uri);
    this.clearDocumentDecoration(uri);
    this.decoratedDocuments.delete(uri);
  }

  private clearDocumentDecoration(uri: string): void {
    if (this.inactiveDecoration !== undefined) {
      this.host.setDecorations(uri, this.inactiveDecoration, []);
    }
  }
}
