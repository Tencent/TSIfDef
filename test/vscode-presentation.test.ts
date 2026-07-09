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

import {
  DiagnosticSeverity,
  MacroPresentationController,
  PositionMapper,
  analyzeDocument,
} from "../src/vscode/index.js";
import type { MacroDefinitions } from "../src/core/index.js";
import { FakeHost, macroDocument } from "./fake-host.js";

test("PositionMapper maps offsets across CRLF, LF, and surrogate pairs", () => {
  // Line 0: "a😀b" — 😀 is a surrogate pair occupying two UTF-16 code units.
  const source = "a\u{1F600}b\r\nc\nd";
  const mapper = new PositionMapper(source);

  assert.deepEqual(mapper.positionAt(0), { line: 0, character: 0 });
  // 'b' sits after the surrogate pair: offsets 1 and 2 are the emoji.
  assert.deepEqual(mapper.positionAt(3), { line: 0, character: 3 });
  // After the CRLF, 'c' begins line 1 at character 0.
  const cIndex = source.indexOf("c");
  assert.deepEqual(mapper.positionAt(cIndex), { line: 1, character: 0 });
  // After the lone LF, 'd' begins line 2.
  const dIndex = source.indexOf("d");
  assert.deepEqual(mapper.positionAt(dIndex), { line: 2, character: 0 });
  // Out-of-range offsets clamp to the document end.
  assert.deepEqual(mapper.positionAt(999), mapper.positionAt(source.length));
});

test("analyzeDocument reuses core analysis for diagnostics and inactive ranges", () => {
  const source = [
    "const shared = 1;",
    "#if HOK",
    "const onlyHok = 2;",
    "#else",
    "const onlyOther = 3;",
    "#endif",
    "#if MISSING",
    "#endif",
    "",
  ].join("\n");

  const analysis = analyzeDocument(source, { HOK: true });

  // The #else branch is inactive under HOK and must be grayed.
  assert.equal(analysis.inactiveRanges.length >= 1, true);
  const inactive = analysis.inactiveRanges[0]!;
  assert.equal(inactive.start.line <= 4, true);
  assert.equal(inactive.end.line >= 4, true);

  // MISSING is absent, so it is false without an editor diagnostic.
  assert.deepEqual(analysis.diagnostics, []);
  assert.equal(analysis.inactiveRanges.some((range) => range.start.line <= 6), true);
});

const hok: MacroDefinitions = { HOK: true };

test("presentation publishes diagnostics and decorations for open macro documents", () => {
  const source = "#if HOK\nconst a = 1;\n#else\nconst b = 2;\n#endif\n";
  const host = new FakeHost({ documents: [macroDocument("file:///a.ts", source)] });
  const controller = new MacroPresentationController(host, () => hok);
  controller.activate();

  assert.equal(host.diagnostics.has("file:///a.ts"), true);
  const decoration = host.decorations.get("file:///a.ts");
  assert.notEqual(decoration, undefined);
  assert.equal(decoration!.ranges.length >= 1, true);
  controller.dispose();
  assert.equal(host.diagnosticCollectionDisposed, true);
  assert.equal(host.decorationTypeDisposed, true);
});

test("presentation clears everything when no profile is selected", () => {
  const host = new FakeHost({
    documents: [macroDocument("file:///a.ts", "#if HOK\n#endif\n")],
  });
  const controller = new MacroPresentationController(host, () => undefined);
  controller.activate();

  assert.equal(host.diagnostics.size, 0);
  assert.equal(host.diagnosticsCleared >= 1, true);
  controller.dispose();
});

test("presentation skips non-macro documents", () => {
  const host = new FakeHost({
    documents: [{ uri: "file:///a.js", isMacroDocument: false, getText: () => "#if HOK\n#endif\n" }],
  });
  const controller = new MacroPresentationController(host, () => hok);
  controller.activate();

  assert.equal(host.diagnostics.has("file:///a.js"), false);
  controller.dispose();
});

test("refresh drops documents that are no longer open", () => {
  const host = new FakeHost({ documents: [macroDocument("file:///a.ts", "#if HOK\n#endif\n")] });
  const controller = new MacroPresentationController(host, () => hok);
  controller.activate();
  assert.equal(host.diagnostics.has("file:///a.ts"), true);

  host.documents = [];
  controller.refresh();
  assert.equal(host.diagnostics.has("file:///a.ts"), false);
  assert.deepEqual(host.decorations.get("file:///a.ts")?.ranges, []);
  controller.dispose();
});

test("refreshDocument reanalyzes a single edited document", () => {
  const host = new FakeHost();
  const controller = new MacroPresentationController(host, () => hok);
  controller.activate();

  controller.refreshDocument(macroDocument("file:///edit.ts", "#if HOK\nconst a = 1;\n#else\nx\n#endif\n"));
  assert.equal(host.diagnostics.has("file:///edit.ts"), true);
  assert.equal((host.decorations.get("file:///edit.ts")?.ranges.length ?? 0) >= 1, true);

  controller.closeDocument("file:///edit.ts");
  assert.equal(host.diagnostics.has("file:///edit.ts"), false);
  assert.deepEqual(host.decorations.get("file:///edit.ts")?.ranges, []);
  controller.dispose();
});

test("a changed profile reanalyzes with the new definitions", () => {
  const source = "#if HOK\nconst a = 1;\n#else\nconst b = 2;\n#endif\n";
  let definitions: MacroDefinitions = { HOK: true };
  const host = new FakeHost({ documents: [macroDocument("file:///a.ts", source)] });
  const controller = new MacroPresentationController(host, () => definitions);
  controller.activate();
  const hokInactive = host.decorations.get("file:///a.ts")!.ranges[0]!;

  definitions = { HOK: false };
  controller.refresh();
  const otherInactive = host.decorations.get("file:///a.ts")!.ranges[0]!;

  // The inactive branch moves from the #else block to the #if block.
  assert.notDeepEqual(hokInactive, otherInactive);
  controller.dispose();
});
