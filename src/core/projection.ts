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

import {
  analyzeConditionals,
  type ConditionalAnalysisResult,
} from "./conditional.js";
import type { MacroDefinitions } from "./expression.js";
import type { SourceRange } from "./scanner.js";

export interface ProjectionResult extends ConditionalAnalysisResult {
  readonly projectedText: string;
  readonly maskedRanges: readonly SourceRange[];
}

/** Analyze and project source through the selected macro definitions. */
export function projectSource(
  source: string,
  definitions: MacroDefinitions,
): ProjectionResult {
  const analysis = analyzeConditionals(source, definitions);
  const maskedRanges = normalizeRanges(
    source.length,
    analysis.directiveRanges.concat(analysis.inactiveRanges),
  );
  return {
    ...analysis,
    projectedText: maskSourceRanges(source, maskedRanges),
    maskedRanges,
  };
}

/**
 * Replace non-newline text with whitespace while preserving both UTF-8 byte
 * offsets and UTF-16 editor offsets.
 */
export function maskSourceRanges(
  source: string,
  ranges: readonly SourceRange[],
): string {
  const normalized = normalizeRanges(source.length, ranges);
  const chunks: string[] = [];
  let cursor = 0;

  for (const range of normalized) {
    chunks.push(source.slice(cursor, range.start));
    chunks.push(maskText(source.slice(range.start, range.end)));
    cursor = range.end;
  }
  chunks.push(source.slice(cursor));
  return chunks.join("");
}

function maskText(source: string): string {
  let result = "";
  for (const character of source) {
    if (character === "\r" || character === "\n") {
      result += character;
      continue;
    }

    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f) {
      result += " ";
    } else if (codePoint <= 0x7ff) {
      result += "\u00A0";
    } else if (codePoint <= 0xffff) {
      result += "\u3000";
    } else {
      // Astral code points occupy four UTF-8 bytes and two UTF-16 code units.
      result += "\u00A0\u00A0";
    }
  }
  return result;
}

function normalizeRanges(
  sourceLength: number,
  ranges: readonly SourceRange[],
): SourceRange[] {
  const sorted = ranges.map((range) => {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 0 ||
      range.end < range.start ||
      range.end > sourceLength
    ) {
      throw new RangeError(
        `Invalid source range [${range.start}, ${range.end}) for length ${sourceLength}.`,
      );
    }
    return range;
  });
  sorted.sort((left, right) => left.start - right.start || left.end - right.end);

  const normalized: SourceRange[] = [];
  for (const range of sorted) {
    if (range.start === range.end) {
      continue;
    }
    const previous = normalized.at(-1);
    if (previous !== undefined && range.start <= previous.end) {
      normalized[normalized.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, range.end),
      };
    } else {
      normalized.push({ start: range.start, end: range.end });
    }
  }
  return normalized;
}
