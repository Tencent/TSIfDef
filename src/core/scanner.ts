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

export interface SourceRange {
  /** Inclusive UTF-16 offset. */
  readonly start: number;
  /** Exclusive UTF-16 offset. */
  readonly end: number;
}

export type DirectiveKind = "if" | "elif" | "else" | "endif" | "error";

export interface Directive {
  readonly kind: DirectiveKind;
  /** Zero-based physical line number. */
  readonly line: number;
  /** Entire line excluding its line ending. */
  readonly range: SourceRange;
  /** The `#` and directive name. */
  readonly keywordRange: SourceRange;
  readonly argument: string;
  readonly argumentRange: SourceRange | null;
}

export type ScannerDiagnosticCode =
  | "unknown-directive"
  | "unmatched-elif"
  | "unmatched-else"
  | "unmatched-endif"
  | "elif-after-else"
  | "duplicate-else"
  | "unterminated-if";

export interface ScannerDiagnostic {
  readonly code: ScannerDiagnosticCode;
  readonly message: string;
  readonly range: SourceRange;
}

export interface ScanResult {
  readonly directives: readonly Directive[];
  /** Every directive-looking line, including unknown directives. */
  readonly directiveRanges: readonly SourceRange[];
  readonly diagnostics: readonly ScannerDiagnostic[];
}

interface ParsedDirectiveLine {
  readonly directive: Directive | null;
  readonly range: SourceRange;
}

type LexicalMode =
  | "code"
  | "single-quote"
  | "double-quote"
  | "template"
  | "block-comment";

interface TemplateContext {
  expressionBraceDepth: number | null;
}

interface LexicalState {
  mode: LexicalMode;
  readonly templates: TemplateContext[];
}

interface ConditionalFrame {
  readonly opening: Directive;
  sawElse: boolean;
}

const directivePattern = /^[\t \v\f\uFEFF]*#(.*)$/;
const directiveKinds = new Set<DirectiveKind>([
  "if",
  "elif",
  "else",
  "endif",
  "error",
]);
const regexPrefixKeywords = new Set([
  "await",
  "case",
  "delete",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

/** Scan C/C++-style macro directives without evaluating their expressions. */
export function scanDirectives(source: string): ScanResult {
  const directives: Directive[] = [];
  const directiveRanges: SourceRange[] = [];
  const diagnostics: ScannerDiagnostic[] = [];
  const conditionalStack: ConditionalFrame[] = [];
  const lexicalState: LexicalState = { mode: "code", templates: [] };

  let offset = 0;
  let line = 0;
  while (offset < source.length) {
    const lineEnd = findLineEnd(source, offset);
    const lineText = source.slice(offset, lineEnd);
    const parsedLine =
      lexicalState.mode === "code"
        ? parseDirectiveLine(lineText, offset, line, diagnostics)
        : null;

    if (parsedLine !== null) {
      directiveRanges.push(parsedLine.range);
      if (parsedLine.directive !== null) {
        directives.push(parsedLine.directive);
        checkStructure(parsedLine.directive, conditionalStack, diagnostics);
      }
      // Directive arguments are not TypeScript and cannot change lexical state.
    } else {
      scanTypeScriptLine(lineText, lexicalState);
    }

    offset = skipLineEnding(source, lineEnd);
    line += 1;
  }

  for (const frame of conditionalStack) {
    diagnostics.push({
      code: "unterminated-if",
      message: "#if directive has no matching #endif.",
      range: frame.opening.keywordRange,
    });
  }

  diagnostics.sort((left, right) => left.range.start - right.range.start);
  return { directives, directiveRanges, diagnostics };
}

function parseDirectiveLine(
  lineText: string,
  lineOffset: number,
  line: number,
  diagnostics: ScannerDiagnostic[],
): ParsedDirectiveLine | null {
  const match = directivePattern.exec(lineText);
  if (match === null) {
    return null;
  }

  const hashIndex = lineText.indexOf("#");
  const lineRange = { start: lineOffset, end: lineOffset + lineText.length };
  const remainder = match[1] ?? "";
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*)(.*)$/.exec(remainder);
  const name = nameMatch?.[1];
  if (name === undefined) {
    diagnostics.push({
      code: "unknown-directive",
      message: "Expected a directive name after '#'.",
      range: { start: lineOffset + hashIndex, end: lineOffset + hashIndex + 1 },
    });
    return { directive: null, range: lineRange };
  }

  const keywordRange = {
    start: lineOffset + hashIndex,
    end: lineOffset + hashIndex + name.length + 1,
  };

  if (!directiveKinds.has(name as DirectiveKind)) {
    diagnostics.push({
      code: "unknown-directive",
      message: `Unknown directive #${name}.`,
      range: keywordRange,
    });
    return { directive: null, range: lineRange };
  }

  const rawArgument = nameMatch?.[2] ?? "";
  const leadingWhitespace = rawArgument.length - rawArgument.trimStart().length;
  const argument = rawArgument.trim();
  const argumentStart = keywordRange.end + leadingWhitespace;

  return {
    directive: {
      kind: name as DirectiveKind,
      line,
      range: lineRange,
      keywordRange,
      argument,
      argumentRange:
        argument.length === 0
          ? null
          : { start: argumentStart, end: argumentStart + argument.length },
    },
    range: lineRange,
  };
}

function checkStructure(
  directive: Directive,
  stack: ConditionalFrame[],
  diagnostics: ScannerDiagnostic[],
): void {
  const current = stack.at(-1);
  switch (directive.kind) {
    case "if":
      stack.push({ opening: directive, sawElse: false });
      break;
    case "elif":
      if (current === undefined) {
        addStructureDiagnostic(
          diagnostics,
          directive,
          "unmatched-elif",
          "#elif directive has no matching #if.",
        );
      } else if (current.sawElse) {
        addStructureDiagnostic(
          diagnostics,
          directive,
          "elif-after-else",
          "#elif directive cannot appear after #else.",
        );
      }
      break;
    case "else":
      if (current === undefined) {
        addStructureDiagnostic(
          diagnostics,
          directive,
          "unmatched-else",
          "#else directive has no matching #if.",
        );
      } else if (current.sawElse) {
        addStructureDiagnostic(
          diagnostics,
          directive,
          "duplicate-else",
          "Conditional block cannot contain more than one #else.",
        );
      } else {
        current.sawElse = true;
      }
      break;
    case "endif":
      if (current === undefined) {
        addStructureDiagnostic(
          diagnostics,
          directive,
          "unmatched-endif",
          "#endif directive has no matching #if.",
        );
      } else {
        stack.pop();
      }
      break;
    case "error":
      break;
  }
}

function addStructureDiagnostic(
  diagnostics: ScannerDiagnostic[],
  directive: Directive,
  code: ScannerDiagnosticCode,
  message: string,
): void {
  diagnostics.push({ code, message, range: directive.keywordRange });
}

function findLineEnd(source: string, start: number): number {
  let offset = start;
  while (offset < source.length) {
    const character = source.charCodeAt(offset);
    if (character === 0x0a || character === 0x0d) {
      break;
    }
    offset += 1;
  }
  return offset;
}

function skipLineEnding(source: string, lineEnd: number): number {
  if (source.charCodeAt(lineEnd) === 0x0d && source.charCodeAt(lineEnd + 1) === 0x0a) {
    return lineEnd + 2;
  }
  return lineEnd < source.length ? lineEnd + 1 : lineEnd;
}

function scanTypeScriptLine(line: string, state: LexicalState): void {
  let offset = 0;
  let quoteContinues = false;

  while (offset < line.length) {
    const character = line[offset];
    const next = line[offset + 1];

    if (state.mode === "block-comment") {
      if (character === "*" && next === "/") {
        state.mode = "code";
        offset += 2;
      } else {
        offset += 1;
      }
      continue;
    }

    if (state.mode === "single-quote" || state.mode === "double-quote") {
      const closingQuote = state.mode === "single-quote" ? "'" : '"';
      if (character === "\\") {
        quoteContinues = offset === line.length - 1;
        offset += 2;
      } else if (character === closingQuote) {
        state.mode = "code";
        offset += 1;
      } else {
        offset += 1;
      }
      continue;
    }

    if (state.mode === "template") {
      if (character === "\\") {
        offset += 2;
      } else if (character === "`") {
        state.templates.pop();
        state.mode = "code";
        offset += 1;
      } else if (character === "$" && next === "{") {
        const template = state.templates.at(-1);
        if (template !== undefined) {
          template.expressionBraceDepth = 0;
        }
        state.mode = "code";
        offset += 2;
      } else {
        offset += 1;
      }
      continue;
    }

    if (character === "/" && next === "/") {
      break;
    }
    if (character === "/" && next === "*") {
      state.mode = "block-comment";
      offset += 2;
      continue;
    }
    if (character === "/" && isLikelyRegexStart(line, offset)) {
      offset = skipRegexLiteral(line, offset);
      continue;
    }
    if (character === "'") {
      state.mode = "single-quote";
      offset += 1;
      continue;
    }
    if (character === '"') {
      state.mode = "double-quote";
      offset += 1;
      continue;
    }
    if (character === "`") {
      state.templates.push({ expressionBraceDepth: null });
      state.mode = "template";
      offset += 1;
      continue;
    }

    const template = state.templates.at(-1);
    if (template !== undefined && template.expressionBraceDepth !== null) {
      if (character === "{") {
        template.expressionBraceDepth += 1;
      } else if (character === "}") {
        if (template.expressionBraceDepth === 0) {
          template.expressionBraceDepth = null;
          state.mode = "template";
        } else {
          template.expressionBraceDepth -= 1;
        }
      }
    }
    offset += 1;
  }

  if (
    (state.mode === "single-quote" || state.mode === "double-quote") &&
    !quoteContinues
  ) {
    // Recover after an invalid unterminated string instead of poisoning later lines.
    state.mode = "code";
  }
}

function isLikelyRegexStart(line: string, slashOffset: number): boolean {
  const prefix = line.slice(0, slashOffset).trimEnd();
  if (prefix.length === 0) {
    return true;
  }

  const previous = prefix.at(-1);
  if (previous !== undefined && "([{,:;=!?&|+-*%^~<>".includes(previous)) {
    return true;
  }

  const word = /([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(prefix)?.[1];
  return word !== undefined && regexPrefixKeywords.has(word);
}

function skipRegexLiteral(line: string, slashOffset: number): number {
  let offset = slashOffset + 1;
  let inCharacterClass = false;

  while (offset < line.length) {
    const character = line[offset];
    if (character === "\\") {
      offset += 2;
    } else if (character === "[") {
      inCharacterClass = true;
      offset += 1;
    } else if (character === "]") {
      inCharacterClass = false;
      offset += 1;
    } else if (character === "/" && !inCharacterClass) {
      offset += 1;
      while (offset < line.length && /[A-Za-z]/.test(line[offset] ?? "")) {
        offset += 1;
      }
      return offset;
    } else {
      offset += 1;
    }
  }

  return offset;
}
