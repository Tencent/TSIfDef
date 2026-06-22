import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { decodeTypeScriptText, loadProfileFile, precompileProject, readSourceText } from "../src/cli/index.js";

test("source decoding matches TypeScript 5.5.4 replacement behavior", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-encoding-"));
  try {
    const file = join(root, "source.ts");
    await writeFile(file, Buffer.from([0x2f, 0x2f, 0x20, 0x80, 0x0a]));
    assert.equal(await readSourceText(file), ts.sys.readFile(file));
    assert.match(await readSourceText(file), /\uFFFD/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source decoding matches tsc BOM handling", () => {
  for (const bytes of [
    Buffer.from([0xef, 0xbb, 0xbf, 0x61]),
    Buffer.from([0xff, 0xfe, 0x61, 0x00]),
    Buffer.from([0xfe, 0xff, 0x00, 0x61]),
  ]) {
    assert.equal(decodeTypeScriptText(bytes), "a");
  }
});

test("precompile accepts bytes that stock tsc decodes with replacement characters", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-encoding-emit-"));
  try {
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(join(root, "source", "main.ts"), Buffer.from([0x2f, 0x2f, 0x20, 0x80, 0x0a, 0x63, 0x6f, 0x6e, 0x73, 0x74, 0x20, 0x78, 0x3d, 0x31, 0x3b]));
    await writeFile(join(root, "Profile.json"), "[]", "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({ include: ["source/**/*.ts"] }), "utf8");
    await precompileProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
    });
    assert.match(await readFile(join(root, ".tsifdef", "Output", "project", "source", "main.ts"), "utf8"), /\uFFFD/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
