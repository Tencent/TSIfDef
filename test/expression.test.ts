import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMacroExpression,
  parseMacroExpression,
} from "../src/core/index.js";

test("applies not, and, and or precedence", () => {
  assert.equal(
    evaluateMacroExpression("A || B && C", { A: true, B: true, C: false }).value,
    true,
  );
  assert.equal(
    evaluateMacroExpression("(A || B) && C", { A: true, B: false, C: false }).value,
    false,
  );
  assert.equal(
    evaluateMacroExpression("!A && B", { A: false, B: true }).value,
    true,
  );
});

test("parses left-associative logical expressions into an AST", () => {
  const result = parseMacroExpression("A || B || C");

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.expression?.kind, "logical");
  if (result.expression?.kind === "logical") {
    assert.equal(result.expression.operator, "||");
    assert.equal(result.expression.left.kind, "logical");
    assert.deepEqual(result.expression.range, { start: 0, end: 11 });
  }
});

test("defined checks presence independently of macro value", () => {
  const definitions = { PRESENT_FALSE: false };

  const present = evaluateMacroExpression("defined(PRESENT_FALSE)", definitions);
  const missing = evaluateMacroExpression("defined(MISSING)", definitions);

  assert.equal(present.value, true);
  assert.deepEqual(present.diagnostics, []);
  assert.equal(missing.value, false);
  assert.deepEqual(missing.diagnostics, []);
});

test("reports every unknown bare macro including short-circuited operands", () => {
  const result = evaluateMacroExpression("KNOWN || FIRST && SECOND", { KNOWN: true }, 20);

  assert.equal(result.value, true);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      textStart: diagnostic.range.start,
    })),
    [
      { code: "unknown-macro", textStart: 29 },
      { code: "unknown-macro", textStart: 38 },
    ],
  );
});

test("maps syntax diagnostics with the supplied base offset", () => {
  const missingCallParenthesis = parseMacroExpression("defined NAME", 100);
  const missingClosingParenthesis = parseMacroExpression("(A || B", 200);
  const invalidOperator = parseMacroExpression("A & B", 300);

  assert.deepEqual(missingCallParenthesis.diagnostics.map((item) => item.code), [
    "expected-defined-parenthesis",
  ]);
  assert.deepEqual(missingCallParenthesis.diagnostics[0]?.range, {
    start: 108,
    end: 112,
  });
  assert.deepEqual(missingClosingParenthesis.diagnostics.map((item) => item.code), [
    "expected-closing-parenthesis",
  ]);
  assert.deepEqual(invalidOperator.diagnostics.map((item) => item.code), [
    "unexpected-token",
  ]);
  assert.deepEqual(invalidOperator.diagnostics[0]?.range, { start: 302, end: 303 });
});

test("reports empty and incomplete expressions", () => {
  assert.deepEqual(parseMacroExpression("").diagnostics.map((item) => item.code), [
    "expected-expression",
  ]);
  assert.deepEqual(parseMacroExpression("A &&").diagnostics.map((item) => item.code), [
    "expected-expression",
  ]);
  assert.deepEqual(parseMacroExpression("defined()").diagnostics.map((item) => item.code), [
    "expected-defined-name",
  ]);
});
