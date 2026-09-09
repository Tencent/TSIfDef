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
import { projectSourceForEslint } from "./projection.js";

// TSIfDef ESLint processor
//
// This mirrors the tsserver plugin: tsserver intercepts getScriptSnapshot so
// the language service sees only projected source, while this processor uses
// preprocess so the ESLint parser also sees only projected source. Equal-length
// masking preserves line and column coordinates, so postprocess can return
// diagnostics without remapping their positions.
//
// Usage (in the project's .eslintrc):
//   { "plugins": ["tsifdef"],
//     "overrides": [{ "files": ["*.ts","*.mts"], "processor": "tsifdef/macros" }] }
//
// Profile resolution matches the CLI and tsserver: search upward from the
// checked file for a package.json with a "tsifdef" pointer to a JSON array of
// enabled macro names. If none is found, fall back to the original text so lint
// is not blocked.

interface LintMessage {
  readonly ruleId?: string | null;
  readonly fatal?: boolean;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
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

export const processors = {
  macros: {
    supportsAutofix: false,
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
      const flattened = messages.flat();
      const context = takeProjection(filename);
      return context === undefined
        ? flattened
        : flattened.filter((message) => !isSyntheticDiagnostic(message, context));
    },
  },
};

export default { processors };
