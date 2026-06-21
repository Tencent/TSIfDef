import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeConditionals,
  parseMacroExpression,
  projectSource,
  scanDirectives,
  type SourceRange,
} from "../src/core/index.js";

function newlineOffsets(source: string): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === "\r" || source[offset] === "\n") {
      offsets.push(offset);
    }
  }
  return offsets;
}

function assertBoundedRanges(source: string, ranges: readonly SourceRange[]): void {
  for (const range of ranges) {
    assert.equal(Number.isInteger(range.start), true);
    assert.equal(Number.isInteger(range.end), true);
    assert.equal(range.start >= 0, true);
    assert.equal(range.end >= range.start, true);
    assert.equal(range.end <= source.length, true);
  }
}

test("recovers deterministically from malformed nested conditionals", () => {
  const source = [
    "#elif ORPHAN",
    "orphanText();",
    "#if OFF",
    "hiddenBeforeElse();",
    "#else extra",
    "visibleInElse();",
    "#elif LATE && MISSING",
    "hiddenAfterLateElif();",
    "#else",
    "hiddenAfterDuplicateElse();",
    "#endif trailing",
    "visibleAfterGroup();",
    "#endif",
  ].join("\n");

  const result = analyzeConditionals(source, { ORPHAN: true, OFF: false, LATE: true });

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "unmatched-elif",
    "unexpected-directive-argument",
    "elif-after-else",
    "duplicate-else",
    "unexpected-directive-argument",
    "unmatched-endif",
  ]);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.range.start),
    [...result.diagnostics].map((diagnostic) => diagnostic.range.start).sort((a, b) => a - b),
  );
  const projected = projectSource(source, { ORPHAN: true, OFF: false, LATE: true });
  assert.equal(projected.projectedText.includes("visibleInElse();"), true);
  assert.equal(projected.projectedText.includes("visibleAfterGroup();"), true);
  assert.equal(projected.projectedText.includes("hiddenBeforeElse();"), false);
  assert.equal(projected.projectedText.includes("hiddenAfterLateElif();"), false);
  assert.equal(projected.projectedText.includes("hiddenAfterDuplicateElse();"), false);
});

test("bounds diagnostics and continues after malformed expressions", () => {
  const expressions = ["", "!", "A &&", "A && && B", "defined", "defined(", "defined())", "((A)", "A B", "A | B"];
  for (const expression of expressions) {
    const result = parseMacroExpression(expression);
    assert.equal(result.expression, null, expression);
    assert.equal(result.diagnostics.length > 0, true, expression);
    assertBoundedRanges(expression, result.diagnostics.map((diagnostic) => diagnostic.range));
  }

  const source = ["#if A &&", "hidden();", "#elif B", "visible();", "#endif", "#if C", "later();", "#endif"].join("\n");
  const result = analyzeConditionals(source, { A: true, B: true, C: true });
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["expected-expression"]);
  assert.equal(projectSource(source, { A: true, B: true, C: true }).projectedText.includes("later();"), true);
});

test("distinguishes lexical lookalikes from directives at state boundaries", () => {
  const source = [
    "/* #if SAME_LINE",
    "#if BLOCK_COMMENT",
    "*/",
    "const single = '#if STRING';",
    "const regex = /#if REGEX[\\/]?/;",
    "const template = `#if TEMPLATE ${",
    "#if REAL_IN_EXPRESSION",
    "value",
    "#endif",
    "} #else TEMPLATE`;",
    "#if REAL_AFTER_TEMPLATE",
    "#endif",
  ].join("\n");

  const result = scanDirectives(source);
  assert.deepEqual(result.directives.map((directive) => directive.argument), [
    "REAL_IN_EXPRESSION",
    "",
    "REAL_AFTER_TEMPLATE",
    "",
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test("preserves projection invariants for a deterministic generated corpus", () => {
  let state = 0x5eed1234;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const fragments = [
    "const value = 1;",
    "中文😀;",
    "#if ON",
    "#elif MISSING",
    "#else",
    "#endif",
    "#unknown payload",
    "const text = '#if FAKE';",
    "// #endif",
    "/* #if COMMENT */",
    "const template = `#else`;",
  ];
  const endings = ["\n", "\r\n", "\r"];

  for (let sample = 0; sample < 100; sample += 1) {
    const lines: string[] = [];
    let source = "";
    const lineCount = 1 + (next() % 30);
    for (let line = 0; line < lineCount; line += 1) {
      lines.push(fragments[next() % fragments.length]!);
    }
    for (let line = 0; line < lines.length; line += 1) {
      source += lines[line];
      if (line + 1 < lines.length || next() % 2 === 0) {
        source += endings[next() % endings.length];
      }
    }

    const result = projectSource(source, { ON: next() % 2 === 0 });
    assert.equal(result.projectedText.length, source.length);
    assert.deepEqual(newlineOffsets(result.projectedText), newlineOffsets(source));
    assertBoundedRanges(source, result.directiveRanges);
    assertBoundedRanges(source, result.inactiveRanges);
    assertBoundedRanges(source, result.maskedRanges);
    for (const range of result.maskedRanges) {
      assert.match(result.projectedText.slice(range.start, range.end), /^[ \r\n]*$/);
    }
    assert.equal(
      projectSource(result.projectedText, { ON: next() % 2 === 0 }).projectedText,
      result.projectedText,
    );
  }
});
