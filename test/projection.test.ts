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
import ts from "typescript";

import {
  analyzeConditionals,
  maskSourceRanges,
  projectSource,
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

test("preserves CRLF, UTF-16 length, Chinese text, and surrogate offsets", () => {
  const source = [
    'const shared = "中文😀";',
    "#if BROWSER",
    'const browser = "王者😀";',
    "#else",
    'const node = "国内😀";',
    "#endif",
    "",
  ].join("\r\n");

  const result = projectSource(source, { BROWSER: false });

  assert.equal(result.projectedText.length, source.length);
  assert.equal(
    Buffer.byteLength(result.projectedText, "utf8"),
    Buffer.byteLength(source, "utf8"),
  );
  assert.deepEqual(newlineOffsets(result.projectedText), newlineOffsets(source));
  assert.equal(result.projectedText.includes('const shared = "中文😀";'), true);
  assert.equal(result.projectedText.includes('const node = "国内😀";'), true);
  assert.equal(result.projectedText.includes("#if"), false);
  assert.equal(result.projectedText.includes("#else"), false);
  assert.equal(result.projectedText.includes("#endif"), false);

  const inactiveTextStart = source.indexOf("王者😀");
  assert.equal(
    result.projectedText.slice(inactiveTextStart, inactiveTextStart + "王者😀".length),
    "\u3000\u3000\u00A0\u00A0",
  );
});

test("produces a TypeScript 5.5.4 parseable active view", () => {
  const source = [
    "#if BROWSER",
    "const region: string = 'browser';",
    "#else",
    "const region: number = 1;",
    "#endif",
    "region;",
  ].join("\n");

  const projected = projectSource(source, { BROWSER: true }).projectedText;
  const transpiled = ts.transpileModule(
    projected,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
      fileName: "fixture.ts",
      reportDiagnostics: true,
    },
  );

  assert.equal(ts.version, "5.5.4");
  assert.deepEqual(transpiled.diagnostics, []);
  assert.equal(projected.includes("const region: string"), true);
  assert.equal(projected.includes("const region: number"), false);
});

test("uses the exact ranges returned by conditional analysis", () => {
  const source = ["#if OFF", "hidden();", "#else", "visible();", "#endif"].join("\n");
  const definitions = { OFF: false };
  const analysis = analyzeConditionals(source, definitions);
  const projected = projectSource(source, definitions);
  const expected = maskSourceRanges(
    source,
    analysis.directiveRanges.concat(analysis.inactiveRanges),
  );

  assert.equal(projected.projectedText, expected);
});

test("masks unknown directives while preserving their diagnostics", () => {
  const source = ["#unknown value", "const valid = true;"].join("\n");
  const result = projectSource(source, {});

  assert.equal(result.projectedText.startsWith(" ".repeat("#unknown value".length)), true);
  assert.equal(result.projectedText.includes("const valid = true;"), true);
  assert.equal(result.diagnostics[0]?.code, "unknown-directive");
});

test("preserves TypeScript private members while projecting conditional branches", () => {
  const source = [
    "class PrivateMembers {",
    "  #value = 1;",
    "  #typed!: string;",
    "  #method<T>(value: T): T { return value; }",
    "  #if EDITOR",
    "  editor(): number { return this.#value; }",
    "  #else",
    "  player(): string { return this.#typed; }",
    "  #endif",
    "  has(value: object): boolean { return #value in value; }",
    "}",
  ].join("\n");
  const result = projectSource(source, { EDITOR: true });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.projectedText.includes("#value = 1"), true);
  assert.equal(result.projectedText.includes("#typed!: string"), true);
  assert.equal(result.projectedText.includes("#method<T>"), true);
  assert.equal(result.projectedText.includes("editor(): number"), true);
  assert.equal(result.projectedText.includes("player(): string"), false);
  assert.equal(result.projectedText.includes("#value in value"), true);

  const transpiled = ts.transpileModule(result.projectedText, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    fileName: "private-members.ts",
    reportDiagnostics: true,
  });
  assert.deepEqual(transpiled.diagnostics, []);
});

test("normalizes overlapping ranges and rejects invalid ranges", () => {
  assert.equal(
    maskSourceRanges("abcdef\r\ngh", [
      { start: 4, end: 9 },
      { start: 1, end: 5 },
    ]),
    "a     \r\n h",
  );
  assert.throws(
    () => maskSourceRanges("abc", [{ start: 0, end: 4 }]),
    RangeError,
  );
});
