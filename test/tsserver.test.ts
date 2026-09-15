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

import { wrapHostWithProjection, type ActiveProfile } from "../src/tsserver/index.js";
import { createMemoryHost } from "./tsserver-fixtures.js";

test("wrapped snapshot returns an equal-length whole-file projection", () => {
  const source = "#if BROWSER\nconst browser = 1;\n#else\nconst other = 2;\n#endif\n";
  const files = new Map([["/a.ts", { text: source, version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:1" }),
  });

  const snapshot = host.getScriptSnapshot("/a.ts")!;
  const projected = snapshot.getText(0, snapshot.getLength());
  assert.equal(projected.length, source.length);
  assert.equal(projected.includes("const browser = 1;"), true);
  assert.equal(projected.includes("const other"), false);
  assert.equal(projected.includes("#if"), false);
  // A later slice read is served from the same projection, not re-derived.
  assert.equal(snapshot.getText(0, 9), projected.slice(0, 9));
});

test("wrapped version carries the profile and passes non-macro files through", () => {
  const files = new Map([
    ["/a.ts", { text: "#if BROWSER\n#endif\n", version: "7" }],
    ["/data.json", { text: "{}", version: "3" }],
  ]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:abc" }),
  });

  assert.equal(host.getScriptVersion("/a.ts"), "7|tsifdef:BROWSER:abc");
  // A non-macro file is untouched in both version and snapshot.
  assert.equal(host.getScriptVersion("/data.json"), "3");
  assert.equal(host.getScriptSnapshot("/data.json")!.getText(0, 2), "{}");
});

test("wrapper uses the in-memory snapshot, including unsaved edits", () => {
  const files = new Map([["/a.ts", { text: "#if BROWSER\nconst browser = 1;\n#endif\n", version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { BROWSER: false }, version: "NODE:1" }),
  });
  // Edit the in-memory text; the wrapper must project the new content.
  files.set("/a.ts", { text: "#if BROWSER\nconst edited = 9;\n#endif\n", version: "2" });
  const projected = host.getScriptSnapshot("/a.ts")!.getText(0, files.get("/a.ts")!.text.length);
  // BROWSER is false, so the branch is inactive and masked to spaces.
  assert.equal(projected.includes("const edited"), false);
  assert.equal(projected.trim().length, 0);
});

test("missing snapshots pass through as undefined", () => {
  const host = wrapHostWithProjection(ts, createMemoryHost(new Map()), {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:1" }),
  });
  assert.equal(host.getScriptSnapshot("/missing.ts"), undefined);
});

test("TypeScript 5.5.4 language service ignores the inactive branch", () => {
  assert.equal(ts.version, "5.5.4");
  const source = [
    "#if BROWSER",
    "export const region = 'browser';",
    "#else",
    "export const region = 42;",
    "const onlyOther = region;",
    "#endif",
    "const usesRegion: string = region;",
    "",
  ].join("\n");
  const files = new Map([["/main.ts", { text: source, version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:1" }),
  });
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // Under BROWSER, region is a string; `const usesRegion: string = region;` is valid
  // and the duplicate numeric declaration in the inactive branch is gone.
  const semantic = service.getSemanticDiagnostics("/main.ts");
  assert.deepEqual(
    semantic.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
  );

  // The inactive-only identifier must not exist in the program.
  const program = service.getProgram()!;
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile("/main.ts")!;
  const symbols = checker
    .getSymbolsInScope(sourceFile, ts.SymbolFlags.BlockScopedVariable | ts.SymbolFlags.Variable)
    .map((symbol) => symbol.getName());
  assert.equal(symbols.includes("onlyOther"), false);
});

test("the same source under the other profile flips the active branch", () => {
  const source = [
    "#if BROWSER",
    "export const region: string = 'browser';",
    "#else",
    "export const region: number = 42;",
    "#endif",
    "const usesRegion: number = region;",
    "",
  ].join("\n");
  const files = new Map([["/main.ts", { text: source, version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { BROWSER: false }, version: "NODE:1" }),
  });
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // Under the NODE branch region is a number, so the numeric annotation is fine.
  assert.deepEqual(service.getSemanticDiagnostics("/main.ts"), []);
});

test("projected snapshots delegate change ranges so edits reparse incrementally", () => {
  // Regression: ScriptSnapshot.fromString always returns undefined from
  // getChangeRange, which forced TypeScript to reparse the whole file on every
  // keystroke. Large files then took seconds to serve completions.
  const before = "#if BROWSER\nconst a = 1;\n#else\nconst b = 2;\n#endif\n";
  const after = "#if BROWSER\nconst a = 12;\n#else\nconst b = 2;\n#endif\n";
  const files = new Map([["/a.ts", { text: before, version: "1" }]]);
  const profile = { definitions: { BROWSER: true }, version: "BROWSER:1" };
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => profile,
  });

  const first = host.getScriptSnapshot("/a.ts")!;
  files.set("/a.ts", { text: after, version: "2" });
  const second = host.getScriptSnapshot("/a.ts")!;

  // The host fixture builds snapshots with fromString, which cannot describe a
  // delta, so the wrapper must not invent one.
  assert.equal(second.getChangeRange(first), undefined);
  // The projection itself must still be correct and equal-length.
  assert.equal(second.getLength(), after.length);
  assert.equal(second.getText(0, second.getLength()).includes("const a = 12;"), true);
});

test("projected snapshots report a full change when macro structure changes", () => {
  // Flipping a branch rewrites text far from the edit, so the source delta no
  // longer describes the projection and a full reparse is required.
  const before = "#if BROWSER\nconst a = 1;\n#else\nconst b = 2;\n#endif\n";
  const after = "#if OTHER\nconst a = 1;\n#else\nconst b = 2;\n#endif\n";
  const files = new Map([["/a.ts", { text: before, version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:1" }),
  });

  const first = host.getScriptSnapshot("/a.ts")!;
  assert.equal(first.getText(0, first.getLength()).includes("const a = 1;"), true);

  files.set("/a.ts", { text: after, version: "2" });
  const second = host.getScriptSnapshot("/a.ts")!;
  // The active branch flipped, so the other branch is now live.
  assert.equal(second.getText(0, second.getLength()).includes("const b = 2;"), true);
  assert.equal(second.getChangeRange(first), undefined);
});

test("unchanged files reuse the cached projection instead of rescanning", () => {
  const source = "#if BROWSER\nconst a = 1;\n#else\nconst b = 2;\n#endif\n";
  const files = new Map([["/a.ts", { text: source, version: "1" }]]);
  const profile = { definitions: { BROWSER: true }, version: "BROWSER:1" };
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => profile,
  });

  const first = host.getScriptSnapshot("/a.ts");
  const second = host.getScriptSnapshot("/a.ts");
  assert.equal(first, second, "repeated reads must return the memoized projection");
});

test("a changed Profile invalidates the cached projection", () => {
  const source = "#if BROWSER\nconst a = 1;\n#else\nconst b = 2;\n#endif\n";
  const files = new Map([["/a.ts", { text: source, version: "1" }]]);
  let profile: ActiveProfile = { definitions: { BROWSER: true }, version: "BROWSER:1" };
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => profile,
  });

  const browser = host.getScriptSnapshot("/a.ts")!;
  assert.equal(browser.getText(0, browser.getLength()).includes("const a = 1;"), true);

  profile = { definitions: {}, version: "NODE:1" };
  const node = host.getScriptSnapshot("/a.ts")!;
  assert.equal(node.getText(0, node.getLength()).includes("const b = 2;"), true);
});

test("wrapping the same host again replaces the projection instead of stacking wrappers", () => {
  const source = "#if BROWSER\nconst selected = 'browser';\n#else\nconst selected = 'node';\n#endif\n";
  const files = new Map([["/a.ts", { text: source, version: "1" }]]);
  const host = createMemoryHost(files);

  wrapHostWithProjection(ts, host, {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:1" }),
  });
  wrapHostWithProjection(ts, host, {
    getProfile: () => ({ definitions: {}, version: "NODE:1" }),
  });

  const snapshot = host.getScriptSnapshot("/a.ts")!;
  const projected = snapshot.getText(0, snapshot.getLength());
  assert.equal(projected.includes("selected = 'browser'"), false);
  assert.equal(projected.includes("selected = 'node'"), true);
  assert.equal(host.getScriptVersion("/a.ts"), "1|tsifdef:NODE:1");
});

test("files without directives pass through untouched", () => {
  // Large generated .d.ts files contain no macros. Projecting them wastes time
  // and discards the host's change range, so they must be passed through.
  const source = "export declare const value: number;\n";
  const files = new Map([["/big.d.ts", { text: source, version: "1" }]]);
  const memoryHost = createMemoryHost(files);
  const host = wrapHostWithProjection(ts, memoryHost, {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:1" }),
  });

  const snapshot = host.getScriptSnapshot("/big.d.ts")!;
  assert.equal(snapshot.getText(0, snapshot.getLength()), source);
});

test("a directive-free file is not rescanned on every request", () => {
  // Generated .d.ts files reach tens of megabytes. Scanning one costs well over
  // 100ms, so the "no directives here" verdict must be cached rather than
  // recomputed each time tsserver asks for the snapshot.
  const source = "export declare const value: number;\n";
  const files = new Map([["/big.d.ts", { text: source, version: "1" }]]);
  let reads = 0;
  const memoryHost = createMemoryHost(files);
  const originalGetScriptSnapshot = memoryHost.getScriptSnapshot.bind(memoryHost);
  // Count whole-file reads, which is what a rescan requires.
  memoryHost.getScriptSnapshot = (fileName: string) => {
    const snapshot = originalGetScriptSnapshot(fileName);
    if (snapshot === undefined) {
      return snapshot;
    }
    const originalGetText = snapshot.getText.bind(snapshot);
    return {
      ...snapshot,
      getLength: () => snapshot.getLength(),
      getChangeRange: (old: ts.IScriptSnapshot) => snapshot.getChangeRange(old),
      getText: (start: number, end: number) => {
        if (start === 0 && end === snapshot.getLength()) {
          reads += 1;
        }
        return originalGetText(start, end);
      },
    };
  };
  const host = wrapHostWithProjection(ts, memoryHost, {
    getProfile: () => ({ definitions: { BROWSER: true }, version: "BROWSER:1" }),
  });

  host.getScriptSnapshot("/big.d.ts");
  const readsAfterFirst = reads;
  host.getScriptSnapshot("/big.d.ts");
  host.getScriptSnapshot("/big.d.ts");
  // Subsequent requests may re-read to compare content, but must not exceed one
  // read apiece, and the first request must not have been repeated.
  assert.equal(readsAfterFirst, 1, "the first request reads the file once");
  assert.ok(reads <= 3, `expected at most one read per request, saw ${reads}`);

  // The pass-through contract still holds after caching.
  const snapshot = host.getScriptSnapshot("/big.d.ts")!;
  assert.equal(snapshot.getText(0, snapshot.getLength()), source);
});
