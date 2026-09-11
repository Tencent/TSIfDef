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

import { resolve } from "node:path";

import type { SourceRange } from "../core/index.js";
import { VERSION } from "../version.js";
import { projectSourceForEslint } from "./projection.js";

// TSIfDef ESLint processor
//
// This mirrors the tsserver plugin: tsserver intercepts getScriptSnapshot so
// the language service sees only projected source, while this processor uses
// preprocess so the ESLint parser also sees only projected source. Equal-length
// masking preserves line and column coordinates, so postprocess can return
// diagnostics without remapping their positions.
//
// Profile resolution matches the CLI and tsserver: search upward from the
// checked file for a package.json with a "tsifdef" pointer to a JSON array of
// enabled macro names. If none is found, fall back to the original text so lint
// is not blocked.

interface LintFix {
  readonly range: readonly [number, number];
  readonly text: string;
}

interface LintSuggestion {
  readonly fix?: LintFix;
  [key: string]: unknown;
}

interface LintMessage {
  readonly ruleId?: string | null;
  readonly fatal?: boolean;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly fix?: LintFix;
  readonly suggestions?: readonly LintSuggestion[];
  [key: string]: unknown;
}

interface ProjectionContext {
  readonly source: string;
  readonly lineStarts: readonly number[];
  readonly maskedRanges: readonly SourceRange[];
}

const projectionContexts = new Map<string, ProjectionContext>();

function rememberProjection(
  filename: string,
  source: string,
  maskedRanges: readonly SourceRange[],
): void {
  projectionContexts.set(resolve(filename), {
    source,
    lineStarts: collectLineStarts(source),
    maskedRanges,
  });
}

function takeProjection(filename: string): ProjectionContext | undefined {
  const key = resolve(filename);
  const context = projectionContexts.get(key);
  projectionContexts.delete(key);
  return context;
}

function collectLineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function locationToOffset(
  context: ProjectionContext,
  line: number,
  column: number,
): number | undefined {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) {
    return undefined;
  }
  const lineStart = context.lineStarts[line - 1];
  if (lineStart === undefined) {
    return undefined;
  }
  const nextLineStart = context.lineStarts[line] ?? context.source.length;
  let lineEnd = nextLineStart;
  if (lineEnd > lineStart && context.source[lineEnd - 1] === "\n") {
    lineEnd -= 1;
  }
  if (lineEnd > lineStart && context.source[lineEnd - 1] === "\r") {
    lineEnd -= 1;
  }
  const offset = lineStart + column - 1;
  return offset <= lineEnd ? offset : undefined;
}

/**
 * Diagnostics caused solely by projected text do not describe the user's source.
 * Keep diagnostics that touch any unmasked, non-newline source character so
 * active code or real whitespace is never hidden merely because a range crosses a macro.
 */
function isSyntheticDiagnostic(
  message: LintMessage,
  context: ProjectionContext,
): boolean {
  if (
    message.fatal === true
    || message.ruleId == null
    || message.line === undefined
    || message.column === undefined
  ) {
    return false;
  }

  const start = locationToOffset(context, message.line, message.column);
  if (start === undefined) {
    return false;
  }
  const hasEndLine = message.endLine !== undefined;
  const hasEndColumn = message.endColumn !== undefined;
  if (hasEndLine !== hasEndColumn) {
    return false;
  }
  const explicitEnd =
    hasEndLine && hasEndColumn
      ? locationToOffset(context, message.endLine!, message.endColumn!)
      : undefined;
  if (hasEndLine && (explicitEnd === undefined || explicitEnd < start)) {
    return false;
  }
  const end = explicitEnd ?? Math.min(start + 1, context.source.length);
  if (end === start) {
    return context.maskedRanges.some((range) => start >= range.start && start < range.end);
  }

  let cursor = start;
  let overlapsMaskedRange = false;
  for (const range of context.maskedRanges) {
    if (range.end <= start) {
      continue;
    }
    if (range.start >= end) {
      break;
    }

    const maskedStart = Math.max(start, range.start);
    const maskedEnd = Math.min(end, range.end);
    if (/[^\r\n]/u.test(context.source.slice(cursor, maskedStart))) {
      return false;
    }
    overlapsMaskedRange = true;
    cursor = Math.max(cursor, maskedEnd);
  }

  if (!overlapsMaskedRange) {
    return false;
  }
  return !/[^\r\n]/u.test(context.source.slice(cursor, end));
}

/**
 * A fix is safe only when its replacement range touches no masked character.
 *
 * Equal-length masking keeps projected offsets identical to source offsets, so a
 * fix range that avoids every masked range rewrites exactly the active text the
 * rule saw. A fix that overlaps masking would splice the user's `#if` directives
 * or inactive branches into the replacement text and silently destroy them, so
 * it is dropped. Zero-length insertions are treated as a single point: they are
 * unsafe only when the insertion point falls strictly inside a masked range.
 */
function isSafeFix(fix: LintFix, context: ProjectionContext): boolean {
  const range = fix.range;
  if (!Array.isArray(range) || range.length !== 2) {
    return false;
  }
  const [start, end] = range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    return false;
  }
  return !context.maskedRanges.some((masked) =>
    start === end
      ? start > masked.start && start < masked.end
      : start < masked.end && end > masked.start,
  );
}

/**
 * Strip only the unsafe fixes, keeping the diagnostic itself so the problem is
 * still reported even when TSIfDef cannot offer a safe automatic repair.
 */
function withSafeFixes(message: LintMessage, context: ProjectionContext): LintMessage {
  const fixIsUnsafe = message.fix !== undefined && !isSafeFix(message.fix, context);
  const suggestions = message.suggestions;
  const safeSuggestions =
    suggestions === undefined
      ? undefined
      : suggestions.filter(
        (suggestion) => suggestion.fix === undefined || isSafeFix(suggestion.fix, context),
      );
  const suggestionsChanged =
    suggestions !== undefined && safeSuggestions!.length !== suggestions.length;

  if (!fixIsUnsafe && !suggestionsChanged) {
    return message;
  }

  const next: Record<string, unknown> = { ...message };
  if (fixIsUnsafe) {
    delete next.fix;
  }
  if (suggestionsChanged) {
    next.suggestions = safeSuggestions;
  }
  return next as LintMessage;
}

export const processors = {
  macros: {
    meta: { name: "tsifdef/macros", version: VERSION },
    // Autofix stays enabled so unrelated rules keep their quick fixes; ESLint
    // disables fixes for every rule in the file when this is false. Fixes that
    // would overwrite masked directives or inactive branches are removed
    // individually in postprocess instead.
    supportsAutofix: true,
    preprocess(text: string, filename: string): string[] {
      // Equal-length masking replaces inactive branches and directive lines
      // with spaces while preserving CR/LF characters and total length.
      const projection = projectSourceForEslint(text, filename);
      rememberProjection(filename, text, projection.maskedRanges);
      return [projection.projectedText];
    },
    postprocess(messages: LintMessage[][], filename: string): LintMessage[] {
      // The equal-length projection preserves diagnostic line and column positions.
      // Discard only diagnostics whose reported range contains no visible source
      // outside TSIfDef's synthetic masking; all active-source diagnostics survive.
      // Surviving diagnostics keep only the fixes that stay clear of masked text.
      const flattened = messages.flat();
      const context = takeProjection(filename);
      return context === undefined
        ? flattened
        : flattened
          .filter((message) => !isSyntheticDiagnostic(message, context))
          .map((message) => withSafeFixes(message, context));
    },
  },
};

interface FlatConfig {
  readonly files: readonly string[];
  readonly plugins: { readonly tsifdef: EslintPlugin };
  readonly processor: string;
  readonly settings: {
    readonly "import/parsers": {
      readonly "tsifdef/parser": readonly string[];
    };
  };
}

interface EslintPlugin {
  readonly meta: { readonly name: string; readonly version: string };
  readonly processors: typeof processors;
  readonly configs: Record<string, FlatConfig>;
}

export const meta = { name: "tsifdef", version: VERSION };
export const configs: Record<string, FlatConfig> = {};

const plugin: EslintPlugin = { meta, processors, configs };
const recommended: FlatConfig = {
  files: ["**/*.{ts,tsx,mts,cts}"],
  plugins: { tsifdef: plugin },
  processor: "tsifdef/macros",
  settings: {
    "import/parsers": {
      "tsifdef/parser": [".ts", ".tsx", ".mts", ".cts"],
    },
  },
};

configs.recommended = recommended;
configs["flat/recommended"] = recommended;

export default plugin;
