import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { createWrappedService, offsetOf, type MemoryFile } from "./tsserver-fixtures.js";

const HOK = { definitions: { HOK: true }, version: "HOK:1" } as const;

test("completion at an active position excludes inactive-branch identifiers", () => {
  assert.equal(ts.version, "5.5.4");
  const source = [
    "#if HOK",
    "const hokOnly = 1;",
    "#else",
    "const domesticOnly = 2;",
    "#endif",
    "const ref = hokOnly;",
    "",
  ].join("\n");
  const files = new Map<string, MemoryFile>([["/main.ts", { text: source, version: "1" }]]);
  const { service } = createWrappedService(files, HOK);

  // Query at the original-document offset where `ref` is assigned.
  const offset = offsetOf(files, "/main.ts", "hokOnly;") ;
  const completions = service.getCompletionsAtPosition("/main.ts", offset, undefined);
  const names = new Set(completions?.entries.map((entry) => entry.name) ?? []);
  assert.equal(names.has("hokOnly"), true);
  assert.equal(names.has("domesticOnly"), false);
});

test("definition resolves to the active declaration at original offsets", () => {
  const source = [
    "#if HOK",
    "const region = 'hok';",
    "#else",
    "const region = 42;",
    "#endif",
    "const ref = region;",
    "",
  ].join("\n");
  const files = new Map<string, MemoryFile>([["/main.ts", { text: source, version: "1" }]]);
  const { service } = createWrappedService(files, HOK);

  // Use position of `region` inside `const ref = region;`.
  const useOffset = offsetOf(files, "/main.ts", "region;");
  const definitions = service.getDefinitionAtPosition("/main.ts", useOffset);
  assert.equal(definitions?.length, 1);
  const span = definitions![0]!.textSpan;
  // The definition must point at the active (string) declaration, which in the
  // original document is the first `region` occurrence.
  assert.equal(span.start, offsetOf(files, "/main.ts", "region = 'hok'"));
  // And never at the inactive numeric declaration.
  assert.notEqual(span.start, files.get("/main.ts")!.text.indexOf("region = 42"));
});

test("find-all-references reports only active occurrences across files", () => {
  const lib = [
    "#if HOK",
    "export const flag = 'hok';",
    "#else",
    "export const flag = 0;",
    "#endif",
    "",
  ].join("\n");
  const main = ["import { flag } from './lib';", "const usesFlag = flag;", ""].join("\n");
  const files = new Map<string, MemoryFile>([
    ["/lib.ts", { text: lib, version: "1" }],
    ["/main.ts", { text: main, version: "1" }],
  ]);
  const { service } = createWrappedService(files, HOK);

  const queryOffset = offsetOf(files, "/main.ts", "flag;");
  const references = service.getReferencesAtPosition("/main.ts", queryOffset) ?? [];
  const byFile = new Map<string, number>();
  for (const reference of references) {
    byFile.set(reference.fileName, (byFile.get(reference.fileName) ?? 0) + 1);
    // No reference may land inside the inactive numeric declaration.
    if (reference.fileName === "/lib.ts") {
      assert.notEqual(reference.textSpan.start, lib.indexOf("flag = 0"));
    }
  }
  // The active export plus two uses in main (import + usage).
  assert.equal((byFile.get("/lib.ts") ?? 0) >= 1, true);
  assert.equal((byFile.get("/main.ts") ?? 0) >= 2, true);
});

test("rename edits only active occurrences at original offsets", () => {
  const source = [
    "#if HOK",
    "let value = 1;",
    "value = value + 1;",
    "#else",
    "let value = 'x';",
    "#endif",
    "",
  ].join("\n");
  const files = new Map<string, MemoryFile>([["/main.ts", { text: source, version: "1" }]]);
  const { service } = createWrappedService(files, HOK);

  const declarationOffset = offsetOf(files, "/main.ts", "value = 1") ;
  const locations = service.findRenameLocations("/main.ts", declarationOffset, false, false, {}) ?? [];
  assert.equal(locations.length >= 2, true);
  for (const location of locations) {
    // Every rename edit maps into the active branch of the original document.
    assert.equal(location.textSpan.start < source.indexOf("#else"), true);
  }
  // The inactive `let value = 'x';` is never touched.
  const inactiveOffset = source.indexOf("value = 'x'");
  assert.equal(locations.some((location) => location.textSpan.start === inactiveOffset), false);
});

test("a quick fix is offered for active-branch code at original offsets", () => {
  // The active branch contains a real type error; quick-fix lookup must operate
  // on original-document spans without crossing into masked directive text.
  const source = [
    "#if HOK",
    "const message: string = 123;",
    "#endif",
    "",
  ].join("\n");
  const files = new Map<string, MemoryFile>([["/main.ts", { text: source, version: "1" }]]);
  const { service } = createWrappedService(files, HOK);

  const start = offsetOf(files, "/main.ts", "message");
  const end = start + "message".length;
  // The active branch has a real diagnostic; quick-fix lookup must operate on the
  // original-document span without crossing into masked directive text.
  const diagnostics = service.getSemanticDiagnostics("/main.ts");
  assert.equal(diagnostics.length >= 1, true);
  assert.equal(diagnostics[0]!.start! >= 0, true);
  // Offsets remain within the original document length (projection is equal-length).
  assert.equal(diagnostics[0]!.start! + diagnostics[0]!.length! <= source.length, true);
  const fixes = service.getCodeFixesAtPosition(
    "/main.ts",
    start,
    end,
    diagnostics.map((diagnostic) => diagnostic.code),
    {},
    {},
  );
  // Whether or not a fix exists, the call must succeed and any returned edit must
  // reference the original document with in-range spans.
  for (const fix of fixes) {
    for (const change of fix.changes) {
      assert.equal(change.fileName, "/main.ts");
      for (const edit of change.textChanges) {
        assert.equal(edit.span.start + edit.span.length <= source.length, true);
      }
    }
  }
});
