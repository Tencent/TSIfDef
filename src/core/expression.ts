import type { SourceRange } from "./scanner.js";

export type MacroDefinitions = Readonly<Record<string, boolean>>;

export type MacroExpression =
  | IdentifierExpression
  | DefinedExpression
  | NotExpression
  | LogicalExpression;

export interface IdentifierExpression {
  readonly kind: "identifier";
  readonly name: string;
  readonly range: SourceRange;
}

export interface DefinedExpression {
  readonly kind: "defined";
  readonly name: string;
  readonly range: SourceRange;
  readonly nameRange: SourceRange;
}

export interface NotExpression {
  readonly kind: "not";
  readonly operand: MacroExpression;
  readonly range: SourceRange;
}

export interface LogicalExpression {
  readonly kind: "logical";
  readonly operator: "&&" | "||";
  readonly left: MacroExpression;
  readonly right: MacroExpression;
  readonly range: SourceRange;
}

export type ExpressionDiagnosticCode =
  | "expected-expression"
  | "expected-defined-parenthesis"
  | "expected-defined-name"
  | "expected-closing-parenthesis"
  | "unexpected-token"
  | "unknown-macro";

export interface ExpressionDiagnostic {
  readonly code: ExpressionDiagnosticCode;
  readonly message: string;
  readonly range: SourceRange;
}

export interface ParseExpressionResult {
  readonly expression: MacroExpression | null;
  readonly diagnostics: readonly ExpressionDiagnostic[];
}

export interface EvaluateExpressionResult extends ParseExpressionResult {
  readonly value: boolean;
}

type TokenKind =
  | "identifier"
  | "not"
  | "and"
  | "or"
  | "open-parenthesis"
  | "close-parenthesis"
  | "invalid"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly range: SourceRange;
}

/** Parse one macro expression. Offsets in the result include `baseOffset`. */
export function parseMacroExpression(
  source: string,
  baseOffset = 0,
): ParseExpressionResult {
  const parser = new ExpressionParser(tokenize(source, baseOffset));
  return parser.parse();
}

/** Parse and evaluate one macro expression against a Profile definition map. */
export function evaluateMacroExpression(
  source: string,
  definitions: MacroDefinitions,
  baseOffset = 0,
): EvaluateExpressionResult {
  const parsed = parseMacroExpression(source, baseOffset);
  if (parsed.expression === null || parsed.diagnostics.length > 0) {
    return { ...parsed, value: false };
  }

  const diagnostics: ExpressionDiagnostic[] = [];
  const value = evaluateNode(parsed.expression, definitions, diagnostics);
  return { expression: parsed.expression, diagnostics, value };
}

class ExpressionParser {
  private offset = 0;
  private readonly diagnostics: ExpressionDiagnostic[] = [];

  public constructor(private readonly tokens: readonly Token[]) {}

  public parse(): ParseExpressionResult {
    const expression = this.parseOr();
    if (expression !== null && this.current().kind !== "eof") {
      this.addDiagnostic(
        "unexpected-token",
        `Unexpected token '${this.current().text}'.`,
        this.current().range,
      );
    }
    return {
      expression: this.diagnostics.length === 0 ? expression : null,
      diagnostics: this.diagnostics,
    };
  }

  private parseOr(): MacroExpression | null {
    let left = this.parseAnd();
    while (left !== null && this.current().kind === "or") {
      this.advance();
      const right = this.parseAnd();
      if (right === null) {
        return null;
      }
      left = {
        kind: "logical",
        operator: "||",
        left,
        right,
        range: { start: left.range.start, end: right.range.end },
      };
    }
    return left;
  }

  private parseAnd(): MacroExpression | null {
    let left = this.parseUnary();
    while (left !== null && this.current().kind === "and") {
      this.advance();
      const right = this.parseUnary();
      if (right === null) {
        return null;
      }
      left = {
        kind: "logical",
        operator: "&&",
        left,
        right,
        range: { start: left.range.start, end: right.range.end },
      };
    }
    return left;
  }

  private parseUnary(): MacroExpression | null {
    if (this.current().kind !== "not") {
      return this.parsePrimary();
    }

    const operator = this.advance();
    const operand = this.parseUnary();
    return operand === null
      ? null
      : {
          kind: "not",
          operand,
          range: { start: operator.range.start, end: operand.range.end },
        };
  }

  private parsePrimary(): MacroExpression | null {
    const token = this.current();
    if (token.kind === "identifier") {
      this.advance();
      return token.text === "defined"
        ? this.parseDefined(token)
        : { kind: "identifier", name: token.text, range: token.range };
    }

    if (token.kind === "open-parenthesis") {
      this.advance();
      const expression = this.parseOr();
      if (expression === null) {
        return null;
      }
      if (this.current().kind !== "close-parenthesis") {
        this.addDiagnostic(
          "expected-closing-parenthesis",
          "Expected ')' to close macro expression.",
          this.current().range,
        );
        return null;
      }
      this.advance();
      return expression;
    }

    this.addDiagnostic(
      "expected-expression",
      "Expected a macro name, defined(NAME), '!', or '('.",
      token.range,
    );
    if (token.kind !== "eof") {
      this.advance();
    }
    return null;
  }

  private parseDefined(definedToken: Token): MacroExpression | null {
    if (this.current().kind !== "open-parenthesis") {
      this.addDiagnostic(
        "expected-defined-parenthesis",
        "Expected '(' after defined.",
        this.current().range,
      );
      return null;
    }
    this.advance();

    const name = this.current();
    if (name.kind !== "identifier") {
      this.addDiagnostic(
        "expected-defined-name",
        "Expected a macro name inside defined(...).",
        name.range,
      );
      return null;
    }
    this.advance();

    const closing = this.current();
    if (closing.kind !== "close-parenthesis") {
      this.addDiagnostic(
        "expected-closing-parenthesis",
        "Expected ')' after the macro name in defined(...).",
        closing.range,
      );
      return null;
    }
    this.advance();

    return {
      kind: "defined",
      name: name.text,
      nameRange: name.range,
      range: { start: definedToken.range.start, end: closing.range.end },
    };
  }

  private current(): Token {
    return this.tokens[this.offset] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): Token {
    const token = this.current();
    if (token.kind !== "eof") {
      this.offset += 1;
    }
    return token;
  }

  private addDiagnostic(
    code: ExpressionDiagnosticCode,
    message: string,
    range: SourceRange,
  ): void {
    this.diagnostics.push({ code, message, range });
  }
}

function tokenize(source: string, baseOffset: number): Token[] {
  const tokens: Token[] = [];
  let offset = 0;

  while (offset < source.length) {
    const character = source[offset]!;
    if (/\s/.test(character)) {
      offset += 1;
      continue;
    }

    const start = offset;
    if (/[A-Za-z_]/.test(character)) {
      offset += 1;
      while (offset < source.length && /[A-Za-z0-9_]/.test(source[offset]!)) {
        offset += 1;
      }
      tokens.push(makeToken("identifier", source.slice(start, offset), start, offset, baseOffset));
      continue;
    }

    const pair = source.slice(offset, offset + 2);
    if (pair === "&&" || pair === "||") {
      offset += 2;
      tokens.push(makeToken(pair === "&&" ? "and" : "or", pair, start, offset, baseOffset));
      continue;
    }

    offset += 1;
    const kind: TokenKind =
      character === "!"
        ? "not"
        : character === "("
          ? "open-parenthesis"
          : character === ")"
            ? "close-parenthesis"
            : "invalid";
    tokens.push(makeToken(kind, character, start, offset, baseOffset));
  }

  tokens.push(makeToken("eof", "end of expression", source.length, source.length, baseOffset));
  return tokens;
}

function makeToken(
  kind: TokenKind,
  text: string,
  start: number,
  end: number,
  baseOffset: number,
): Token {
  return {
    kind,
    text,
    range: { start: baseOffset + start, end: baseOffset + end },
  };
}

function evaluateNode(
  expression: MacroExpression,
  definitions: MacroDefinitions,
  diagnostics: ExpressionDiagnostic[],
): boolean {
  switch (expression.kind) {
    case "identifier":
      if (!Object.hasOwn(definitions, expression.name)) {
        diagnostics.push({
          code: "unknown-macro",
          message: `Unknown macro ${expression.name}.`,
          range: expression.range,
        });
        return false;
      }
      return definitions[expression.name] === true;
    case "defined":
      return Object.hasOwn(definitions, expression.name);
    case "not":
      return !evaluateNode(expression.operand, definitions, diagnostics);
    case "logical": {
      // Evaluate both sides so unknown macros are diagnosed even when boolean
      // short-circuiting would otherwise hide one side.
      const left = evaluateNode(expression.left, definitions, diagnostics);
      const right = evaluateNode(expression.right, definitions, diagnostics);
      return expression.operator === "&&" ? left && right : left || right;
    }
  }
}
