import assert from "node:assert/strict";
import test from "node:test";

import { scanDirectives } from "../src/core/index.js";

test("scans C-style directives and preserves UTF-16 ranges", () => {
  const source = [
    "const label = '中文😀';",
    "  #if HOK",
    "#elif DOMESTIC",
    "#else",
    "#error Unknown region",
    "#endif",
  ].join("\r\n");

  const result = scanDirectives(source);

  assert.deepEqual(result.directives.map((directive) => directive.kind), [
    "if",
    "elif",
    "else",
    "error",
    "endif",
  ]);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.directiveRanges.length, 5);

  const first = result.directives[0];
  assert.ok(first);
  assert.equal(first.line, 1);
  assert.deepEqual(first.range, {
    start: source.indexOf("  #if HOK"),
    end: source.indexOf("  #if HOK") + "  #if HOK".length,
  });
  assert.deepEqual(first.keywordRange, {
    start: source.indexOf("#if HOK"),
    end: source.indexOf("#if HOK") + "#if".length,
  });
  assert.equal(first.argument, "HOK");
  assert.deepEqual(first.argumentRange, {
    start: source.indexOf("HOK"),
    end: source.indexOf("HOK") + 3,
  });
});

test("ignores lookalikes in strings, templates, and comments", () => {
  const source = [
    'const doubleQuoted = "#if DOUBLE";',
    "const singleQuoted = '#elif SINGLE';",
    "const template = `",
    "#if TEMPLATE",
    "`;",
    "/*",
    "#else",
    "*/",
    "// #endif",
    "#error real directive",
  ].join("\n");

  const result = scanDirectives(source);

  assert.deepEqual(result.directives.map((directive) => directive.kind), ["error"]);
  assert.equal(result.directives[0]?.argument, "real directive");
  assert.deepEqual(result.diagnostics, []);
});

test("does not let regex literals change lexical state", () => {
  const source = [
    "const backtick = /`/;",
    String.raw`const commentMarkers = /\/\*|\/\//;`,
    "#if REAL",
    "#endif",
  ].join("\n");

  const result = scanDirectives(source);

  assert.deepEqual(result.directives.map((directive) => directive.kind), [
    "if",
    "endif",
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test("recognizes directives inside a template expression", () => {
  const source = [
    "const value = `${",
    "#if HOK",
    "hokValue",
    "#endif",
    "}`;",
  ].join("\n");

  const result = scanDirectives(source);

  assert.deepEqual(result.directives.map((directive) => directive.kind), [
    "if",
    "endif",
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test("ignores a directive lookalike in a continued string", () => {
  const source = ['const value = "continued\\', "#if NOT_A_DIRECTIVE", '";', "#if REAL", "#endif"].join(
    "\n",
  );

  const result = scanDirectives(source);

  assert.deepEqual(result.directives.map((directive) => directive.argument), [
    "REAL",
    "",
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test("reports unknown and malformed conditional structure", () => {
  const source = [
    "#define LOCAL",
    "#elif A",
    "#else",
    "#endif",
    "#if OUTER",
    "#else",
    "#elif LATE",
    "#else",
  ].join("\n");

  const result = scanDirectives(source);

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "unknown-directive",
    "unmatched-elif",
    "unmatched-else",
    "unmatched-endif",
    "unterminated-if",
    "elif-after-else",
    "duplicate-else",
  ]);
  for (const diagnostic of result.diagnostics) {
    assert.equal(source.slice(diagnostic.range.start, diagnostic.range.end).startsWith("#"), true);
  }
});

test("consumes unknown directive text without changing lexical state", () => {
  const source = ["#unknown /*", "  #", "#if REAL", "#endif"].join("\n");

  const result = scanDirectives(source);

  assert.deepEqual(result.directives.map((directive) => directive.kind), [
    "if",
    "endif",
  ]);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "unknown-directive",
    "unknown-directive",
  ]);
  assert.equal(result.directiveRanges.length, 4);
});

test("handles nested conditionals without structural diagnostics", () => {
  const source = [
    "#if OUTER",
    "#if INNER",
    "#else",
    "#endif",
    "#elif FALLBACK",
    "#endif",
  ].join("\n");

  const result = scanDirectives(source);

  assert.equal(result.directives.length, 6);
  assert.deepEqual(result.diagnostics, []);
});
