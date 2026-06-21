import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { wrapHostWithProjection } from "../src/tsserver/index.js";
import { createMemoryHost } from "./tsserver-fixtures.js";

test("wrapped snapshot returns an equal-length whole-file projection", () => {
  const source = "#if HOK\nconst hok = 1;\n#else\nconst other = 2;\n#endif\n";
  const files = new Map([["/a.ts", { text: source, version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { HOK: true }, version: "HOK:1" }),
  });

  const snapshot = host.getScriptSnapshot("/a.ts")!;
  const projected = snapshot.getText(0, snapshot.getLength());
  assert.equal(projected.length, source.length);
  assert.equal(projected.includes("const hok = 1;"), true);
  assert.equal(projected.includes("const other"), false);
  assert.equal(projected.includes("#if"), false);
  // A later slice read is served from the same projection, not re-derived.
  assert.equal(snapshot.getText(0, 9), projected.slice(0, 9));
});

test("wrapped version carries the profile and passes non-macro files through", () => {
  const files = new Map([
    ["/a.ts", { text: "#if HOK\n#endif\n", version: "7" }],
    ["/data.json", { text: "{}", version: "3" }],
  ]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { HOK: true }, version: "HOK:abc" }),
  });

  assert.equal(host.getScriptVersion("/a.ts"), "7|tsifdef:HOK:abc");
  // A non-macro file is untouched in both version and snapshot.
  assert.equal(host.getScriptVersion("/data.json"), "3");
  assert.equal(host.getScriptSnapshot("/data.json")!.getText(0, 2), "{}");
});

test("wrapper uses the in-memory snapshot, including unsaved edits", () => {
  const files = new Map([["/a.ts", { text: "#if HOK\nconst hok = 1;\n#endif\n", version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { HOK: false }, version: "DOMESTIC:1" }),
  });
  // Edit the in-memory text; the wrapper must project the new content.
  files.set("/a.ts", { text: "#if HOK\nconst edited = 9;\n#endif\n", version: "2" });
  const projected = host.getScriptSnapshot("/a.ts")!.getText(0, files.get("/a.ts")!.text.length);
  // HOK is false, so the branch is inactive and masked to spaces.
  assert.equal(projected.includes("const edited"), false);
  assert.equal(projected.trim().length, 0);
});

test("missing snapshots pass through as undefined", () => {
  const host = wrapHostWithProjection(ts, createMemoryHost(new Map()), {
    getProfile: () => ({ definitions: { HOK: true }, version: "HOK:1" }),
  });
  assert.equal(host.getScriptSnapshot("/missing.ts"), undefined);
});

test("TypeScript 5.5.4 language service ignores the inactive branch", () => {
  assert.equal(ts.version, "5.5.4");
  const source = [
    "#if HOK",
    "export const region = 'hok';",
    "#else",
    "export const region = 42;",
    "const onlyOther = region;",
    "#endif",
    "const usesRegion: string = region;",
    "",
  ].join("\n");
  const files = new Map([["/main.ts", { text: source, version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { HOK: true }, version: "HOK:1" }),
  });
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // Under HOK, region is a string; `const usesRegion: string = region;` is valid
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
    "#if HOK",
    "export const region: string = 'hok';",
    "#else",
    "export const region: number = 42;",
    "#endif",
    "const usesRegion: number = region;",
    "",
  ].join("\n");
  const files = new Map([["/main.ts", { text: source, version: "1" }]]);
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => ({ definitions: { HOK: false }, version: "DOMESTIC:1" }),
  });
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // Under the non-HOK branch region is a number, so the numeric annotation is fine.
  assert.deepEqual(service.getSemanticDiagnostics("/main.ts"), []);
});
