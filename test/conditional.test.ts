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

import assert from "node:assert/strict";
import test from "node:test";

import { analyzeConditionals, type SourceRange } from "../src/core/index.js";

function isInactive(offset: number, ranges: readonly SourceRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

test("evaluates nested if, elif, and else branches", () => {
  const source = [
    "#if BROWSER",
    "browserCode();",
    "#if FEATURE",
    "featureCode();",
    "#else",
    "withoutFeature();",
    "#endif",
    "#elif NODE",
    "nodeCode();",
    "#else",
    "fallbackCode();",
    "#endif",
  ].join("\n");

  const result = analyzeConditionals(source, {
    BROWSER: true,
    NODE: false,
    FEATURE: false,
  });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.directiveRanges.length, 7);
  assert.equal(isInactive(source.indexOf("browserCode"), result.inactiveRanges), false);
  assert.equal(isInactive(source.indexOf("featureCode"), result.inactiveRanges), true);
  assert.equal(isInactive(source.indexOf("withoutFeature"), result.inactiveRanges), false);
  assert.equal(isInactive(source.indexOf("nodeCode"), result.inactiveRanges), true);
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
    "#if BROWSER",
    "#error BROWSER build is blocked",
    "#else",
    "#error hidden error",
    "#endif",
  ].join("\n");

  const result = analyzeConditionals(source, { BROWSER: true });

  const errors = result.diagnostics.filter((diagnostic) => diagnostic.code === "active-error");
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "BROWSER build is blocked");
  assert.equal(source.slice(errors[0]!.range.start, errors[0]!.range.end), "BROWSER build is blocked");
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
