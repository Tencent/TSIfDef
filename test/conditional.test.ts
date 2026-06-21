import assert from "node:assert/strict";
import test from "node:test";

import { analyzeConditionals, type SourceRange } from "../src/core/index.js";

function isInactive(offset: number, ranges: readonly SourceRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

test("evaluates nested if, elif, and else branches", () => {
  const source = [
    "#if HOK",
    "hokCode();",
    "#if FEATURE",
    "featureCode();",
    "#else",
    "withoutFeature();",
    "#endif",
    "#elif DOMESTIC",
    "domesticCode();",
    "#else",
    "fallbackCode();",
    "#endif",
  ].join("\n");

  const result = analyzeConditionals(source, {
    HOK: true,
    DOMESTIC: false,
    FEATURE: false,
  });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.directiveRanges.length, 7);
  assert.equal(isInactive(source.indexOf("hokCode"), result.inactiveRanges), false);
  assert.equal(isInactive(source.indexOf("featureCode"), result.inactiveRanges), true);
  assert.equal(isInactive(source.indexOf("withoutFeature"), result.inactiveRanges), false);
  assert.equal(isInactive(source.indexOf("domesticCode"), result.inactiveRanges), true);
  assert.equal(isInactive(source.indexOf("fallbackCode"), result.inactiveRanges), true);
});

test("treats absent macros as false inside inactive parent branches", () => {
  const source = [
    "#if DISABLED",
    "#if UNKNOWN_IN_INACTIVE_BRANCH",
    "hidden();",
    "#endif",
    "#endif",
  ].join("\n");

  const result = analyzeConditionals(source, { DISABLED: false });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(isInactive(source.indexOf("hidden"), result.inactiveRanges), true);
});

test("reports only active error directives", () => {
  const source = [
    "#if HOK",
    "#error HOK build is blocked",
    "#else",
    "#error hidden error",
    "#endif",
  ].join("\n");

  const result = analyzeConditionals(source, { HOK: true });

  const errors = result.diagnostics.filter((diagnostic) => diagnostic.code === "active-error");
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "HOK build is blocked");
  assert.equal(source.slice(errors[0]!.range.start, errors[0]!.range.end), "HOK build is blocked");
});

test("composes structural, expression, and directive diagnostics", () => {
  const source = [
    "#if KNOWN && MISSING",
    "active();",
    "#else extra",
    "fallback();",
  ].join("\n");

  const result = analyzeConditionals(source, { KNOWN: true });

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "unterminated-if",
    "unexpected-directive-argument",
  ]);
});

test("tracks an inactive unterminated branch through end of file", () => {
  const source = ["before();", "#if OFF", "hidden();"].join("\n");

  const result = analyzeConditionals(source, { OFF: false });

  assert.equal(isInactive(source.indexOf("before"), result.inactiveRanges), false);
  assert.equal(isInactive(source.indexOf("hidden"), result.inactiveRanges), true);
  assert.equal(result.inactiveRanges.at(-1)?.end, source.length);
});

test("returns every directive-looking range for later projection", () => {
  const source = ["#unknown value", "#if ON", "active();", "#endif"].join("\n");

  const result = analyzeConditionals(source, { ON: true });

  assert.equal(result.directives.length, 2);
  assert.equal(result.directiveRanges.length, 3);
  assert.equal(result.diagnostics[0]?.code, "unknown-directive");
});
