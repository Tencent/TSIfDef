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

/** Replace non-newline UTF-16 code units in the supplied ranges with spaces. */
export function maskSourceRanges(
  source: string,
  ranges: readonly SourceRange[],
): string {
  const normalized = normalizeRanges(source.length, ranges);
  const chunks: string[] = [];
  let cursor = 0;

  for (const range of normalized) {
    chunks.push(source.slice(cursor, range.start));
    chunks.push(source.slice(range.start, range.end).replace(/[^\r\n]/g, " "));
    cursor = range.end;
  }
  chunks.push(source.slice(cursor));
  return chunks.join("");
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
