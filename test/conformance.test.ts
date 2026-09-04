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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  projectSource,
  type MacroDiagnostic,
  type SourceRange,
} from "../src/core/index.js";
import {
  parseProfileFile,
  TsIfDefConfigError,
} from "../src/cli/index.js";

type LineState = "active" | "inactive" | "directive";

interface FixturePosition {
  readonly line: number;
  readonly character: number;
}

interface FixtureDiagnostic {
  readonly code: string;
  readonly start: FixturePosition;
  readonly end: FixturePosition;
}

interface FixtureDirective {
  readonly kind: string;
  readonly line: number;
  readonly argument: string;
}

interface ConformanceFixture {
  readonly version: number;
  readonly name: string;
  readonly lineEnding: "lf" | "crlf";
  readonly trailingNewline: boolean;
  readonly bom: boolean;
  readonly defines: readonly string[];
  readonly sourceLines: readonly string[];
  readonly lineStates: readonly LineState[];
  readonly directives: readonly FixtureDirective[];
  readonly diagnostics: readonly FixtureDiagnostic[];
}

const fixtureRoot = join(process.cwd(), "spec", "cases");
const profileFixtureRoot = join(process.cwd(), "spec", "profiles");

for (const fileName of readdirSync(fixtureRoot).filter((name) => name.endsWith(".json")).sort()) {
  const fixture = JSON.parse(
    readFileSync(join(fixtureRoot, fileName), "utf8"),
  ) as ConformanceFixture;

  test(`conformance: ${fixture.name}`, () => {
    validateFixture(fixture, fileName);
    const source = materializeSource(fixture);
    const definitions = Object.fromEntries(
      fixture.defines.map((name) => [name, true] as const),
    );
    const result = projectSource(source, definitions);

    assert.equal(result.projectedText, expectedProjection(fixture));
    assert.equal(result.projectedText.length, source.length);
    assert.equal(
      Buffer.byteLength(result.projectedText, "utf8"),
      Buffer.byteLength(source, "utf8"),
      "projection must preserve UTF-8 byte length",
    );
    assert.deepEqual(
      newlineOffsets(result.projectedText),
      newlineOffsets(source),
      "projection must preserve newline offsets",
    );
    assert.deepEqual(
      result.directives.map(({ kind, line, argument }) => ({ kind, line, argument })),
      fixture.directives,
    );
    assert.deepEqual(
      normalizeDiagnostics(source, result.diagnostics),
      [...fixture.diagnostics].sort(compareDiagnostics),
    );
  });
}

interface ProfileFixture {
  readonly version: number;
  readonly name: string;
  readonly text: string;
  readonly expectedDefines?: readonly string[];
  readonly expectedError?: string;
}

for (const fileName of readdirSync(profileFixtureRoot).filter((name) => name.endsWith(".json")).sort()) {
  const fixture = JSON.parse(
    readFileSync(join(profileFixtureRoot, fileName), "utf8"),
  ) as ProfileFixture;

  test(`profile conformance: ${fixture.name}`, () => {
    assert.equal(fixture.version, 1, `${fileName}: unsupported fixture version`);
    assert.notEqual(
      fixture.expectedDefines === undefined,
      fixture.expectedError === undefined,
      `${fileName}: expectedDefines or expectedError is required`,
    );

    if (fixture.expectedError !== undefined) {
      assert.throws(
        () => parseProfileFile(fixture.text, `${fixture.name}.json`),
        (error: unknown) =>
          error instanceof TsIfDefConfigError && error.code === fixture.expectedError,
      );
      return;
    }

    const profile = parseProfileFile(fixture.text, `${fixture.name}.json`);
    assert.deepEqual(Object.keys(profile.definitions).sort(), [...fixture.expectedDefines!].sort());
  });
}

function validateFixture(fixture: ConformanceFixture, fileName: string): void {
  assert.equal(fixture.version, 1, `${fileName}: unsupported fixture version`);
  assert.equal(fixture.name.length > 0, true, `${fileName}: name is required`);
  assert.equal(
    fixture.sourceLines.length,
    fixture.lineStates.length,
    `${fileName}: sourceLines and lineStates must have the same length`,
  );
  assert.equal(new Set(fixture.defines).size, fixture.defines.length, `${fileName}: duplicate define`);
  for (const name of fixture.defines) {
    assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/, `${fileName}: invalid define`);
  }
}

function materializeSource(fixture: ConformanceFixture): string {
  const eol = fixture.lineEnding === "crlf" ? "\r\n" : "\n";
  const lines = [...fixture.sourceLines];
  if (fixture.bom) {
    lines[0] = `\uFEFF${lines[0] ?? ""}`;
  }
  return lines.join(eol) + (fixture.trailingNewline ? eol : "");
}

function expectedProjection(fixture: ConformanceFixture): string {
  const eol = fixture.lineEnding === "crlf" ? "\r\n" : "\n";
  const lines = [...fixture.sourceLines];
  if (fixture.bom) {
    lines[0] = `\uFEFF${lines[0] ?? ""}`;
  }
  const projected = lines.map((line, index) =>
    fixture.lineStates[index] === "active" ? line : maskText(line),
  );
  return projected.join(eol) + (fixture.trailingNewline ? eol : "");
}

function maskText(text: string): string {
  let result = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f) {
      result += " ";
    } else if (codePoint <= 0x7ff) {
      result += "\u00A0";
    } else if (codePoint <= 0xffff) {
      result += "\u3000";
    } else {
      result += "\u00A0\u00A0";
    }
  }
  return result;
}

function newlineOffsets(source: string): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === "\r" || source[offset] === "\n") {
      offsets.push(offset);
    }
  }
  return offsets;
}

function normalizeDiagnostics(
  source: string,
  diagnostics: readonly MacroDiagnostic[],
): FixtureDiagnostic[] {
  const lineStarts = buildLineStarts(source);
  return diagnostics
    .map((diagnostic) => ({
      code: diagnostic.code,
      start: positionAt(source, lineStarts, diagnostic.range.start),
      end: positionAt(source, lineStarts, diagnostic.range.end),
    }))
    .sort(compareDiagnostics);
}

function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === "\r") {
      if (source[offset + 1] === "\n") {
        offset += 1;
      }
      starts.push(offset + 1);
    } else if (source[offset] === "\n") {
      starts.push(offset + 1);
    }
  }
  return starts;
}

function positionAt(
  source: string,
  lineStarts: readonly number[],
  offset: number,
): FixturePosition {
  const clamped = Math.max(0, Math.min(offset, source.length));
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lineStarts[middle]! <= clamped) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return { line: low, character: clamped - lineStarts[low]! };
}

function compareDiagnostics(left: FixtureDiagnostic, right: FixtureDiagnostic): number {
  return (
    left.start.line - right.start.line ||
    left.start.character - right.start.character ||
    left.end.line - right.end.line ||
    left.end.character - right.end.character ||
    left.code.localeCompare(right.code)
  );
}
