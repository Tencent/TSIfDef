import { analyzeConditionals, type MacroDiagnostic } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";
import type { SourceRange } from "../core/scanner.js";

/** Zero-based editor position. `character` counts UTF-16 code units, like VSCode. */
export interface DocumentPosition {
  readonly line: number;
  readonly character: number;
}

export interface DocumentRange {
  readonly start: DocumentPosition;
  readonly end: DocumentPosition;
}

/** Severity levels mirroring `vscode.DiagnosticSeverity` ordinals. */
export const DiagnosticSeverity = {
  error: 0,
  warning: 1,
} as const;

export type DiagnosticSeverityValue =
  (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

export interface DocumentDiagnostic {
  readonly code: MacroDiagnostic["code"];
  readonly message: string;
  readonly range: DocumentRange;
  readonly severity: DiagnosticSeverityValue;
}

export interface DocumentAnalysis {
  readonly diagnostics: readonly DocumentDiagnostic[];
  readonly inactiveRanges: readonly DocumentRange[];
}

// Every current macro diagnostic is a hard structural or semantic error.
const warningCodes: ReadonlySet<string> = new Set<string>();

/**
 * Map UTF-16 source offsets onto zero-based editor positions.
 *
 * `\r\n`, lone `\r`, and lone `\n` each advance one line, matching how VSCode
 * counts lines. `character` is a UTF-16 code-unit count, so surrogate pairs are
 * preserved exactly as TypeScript and VSCode positions expect.
 */
export class PositionMapper {
  private readonly lineStarts: number[] = [0];

  public constructor(private readonly source: string) {
    for (let offset = 0; offset < source.length; offset += 1) {
      const code = source.charCodeAt(offset);
      if (code === 0x0d /* \r */) {
        if (source.charCodeAt(offset + 1) === 0x0a /* \n */) {
          offset += 1;
        }
        this.lineStarts.push(offset + 1);
      } else if (code === 0x0a /* \n */) {
        this.lineStarts.push(offset + 1);
      }
    }
  }

  public positionAt(offset: number): DocumentPosition {
    const clamped = Math.max(0, Math.min(offset, this.source.length));
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.lineStarts[mid]! <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low, character: clamped - this.lineStarts[low]! };
  }

  public rangeOf(range: SourceRange): DocumentRange {
    return { start: this.positionAt(range.start), end: this.positionAt(range.end) };
  }
}

/**
 * Analyze one document's source for the selected Profile, reusing the shared
 * core. Returns editor-ready diagnostics and inactive ranges without scanning,
 * evaluating, or projecting macros independently.
 */
export function analyzeDocument(
  source: string,
  definitions: MacroDefinitions,
): DocumentAnalysis {
  const analysis = analyzeConditionals(source, definitions);
  const mapper = new PositionMapper(source);
  return {
    diagnostics: analysis.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      range: mapper.rangeOf(diagnostic.range),
      severity: warningCodes.has(diagnostic.code)
        ? DiagnosticSeverity.warning
        : DiagnosticSeverity.error,
    })),
    inactiveRanges: analysis.inactiveRanges.map((range) => mapper.rangeOf(range)),
  };
}
