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
  evaluateMacroExpression,
  type ExpressionDiagnostic,
  type MacroDefinitions,
} from "./expression.js";
import {
  scanDirectives,
  type Directive,
  type ScannerDiagnostic,
  type SourceRange,
} from "./scanner.js";

export type ConditionalDiagnosticCode =
  | "active-error"
  | "unexpected-directive-argument";

export interface ConditionalDiagnostic {
  readonly code: ConditionalDiagnosticCode;
  readonly message: string;
  readonly range: SourceRange;
}

export type MacroDiagnostic =
  | ScannerDiagnostic
  | ExpressionDiagnostic
  | ConditionalDiagnostic;

export interface ConditionalAnalysisResult {
  readonly directives: readonly Directive[];
  readonly directiveRanges: readonly SourceRange[];
  readonly inactiveRanges: readonly SourceRange[];
  readonly diagnostics: readonly MacroDiagnostic[];
}

interface EvaluationFrame {
  readonly parentActive: boolean;
  branchTaken: boolean;
  currentActive: boolean;
  sawElse: boolean;
}

/** Analyze conditional groups without modifying the source text. */
export function analyzeConditionals(
  source: string,
  definitions: MacroDefinitions,
): ConditionalAnalysisResult {
  const scanned = scanDirectives(source);
  const diagnostics: MacroDiagnostic[] = [...scanned.diagnostics];
  const inactiveRanges: SourceRange[] = [];
  const stack: EvaluationFrame[] = [];

  let cursor = 0;
  let currentActive = true;
  for (const directive of scanned.directives) {
    if (!currentActive) {
      appendRange(inactiveRanges, { start: cursor, end: directive.range.start });
    }

    switch (directive.kind) {
      case "if": {
        const condition = evaluateDirectiveExpression(directive, definitions, diagnostics);
        stack.push({
          parentActive: currentActive,
          branchTaken: condition,
          currentActive: currentActive && condition,
          sawElse: false,
        });
        currentActive = stack.at(-1)!.currentActive;
        break;
      }
      case "elif": {
        const condition = evaluateDirectiveExpression(directive, definitions, diagnostics);
        const frame = stack.at(-1);
        if (frame !== undefined) {
          frame.currentActive =
            !frame.sawElse && frame.parentActive && !frame.branchTaken && condition;
          if (!frame.sawElse) {
            frame.branchTaken ||= condition;
          }
          currentActive = frame.currentActive;
        }
        break;
      }
      case "else": {
        reportUnexpectedArgument(directive, diagnostics);
        const frame = stack.at(-1);
        if (frame !== undefined) {
          frame.currentActive =
            !frame.sawElse && frame.parentActive && !frame.branchTaken;
          if (!frame.sawElse) {
            frame.sawElse = true;
            frame.branchTaken = true;
          }
          currentActive = frame.currentActive;
        }
        break;
      }
      case "endif":
        reportUnexpectedArgument(directive, diagnostics);
        if (stack.length > 0) {
          stack.pop();
          currentActive = stack.at(-1)?.currentActive ?? true;
        }
        break;
      case "error":
        if (currentActive) {
          diagnostics.push({
            code: "active-error",
            message: directive.argument || "#error directive is active.",
            range: directive.argumentRange ?? directive.keywordRange,
          });
        }
        break;
    }

    cursor = directive.range.end;
  }

  if (!currentActive) {
    appendRange(inactiveRanges, { start: cursor, end: source.length });
  }

  diagnostics.sort((left, right) => left.range.start - right.range.start);
  return {
    directives: scanned.directives,
    directiveRanges: scanned.directiveRanges,
    inactiveRanges,
    diagnostics,
  };
}

function evaluateDirectiveExpression(
  directive: Directive,
  definitions: MacroDefinitions,
  diagnostics: MacroDiagnostic[],
): boolean {
  const result = evaluateMacroExpression(
    directive.argument,
    definitions,
    directive.argumentRange?.start ?? directive.keywordRange.end,
  );
  diagnostics.push(...result.diagnostics);
  return result.value;
}

function reportUnexpectedArgument(
  directive: Directive,
  diagnostics: MacroDiagnostic[],
): void {
  if (directive.argumentRange !== null) {
    diagnostics.push({
      code: "unexpected-directive-argument",
      message: `#${directive.kind} does not accept an argument.`,
      range: directive.argumentRange,
    });
  }
}

function appendRange(ranges: SourceRange[], range: SourceRange): void {
  if (range.start >= range.end) {
    return;
  }

  const previous = ranges.at(-1);
  if (previous !== undefined && previous.end === range.start) {
    ranges[ranges.length - 1] = { start: previous.start, end: range.end };
  } else {
    ranges.push(range);
  }
}
