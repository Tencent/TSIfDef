import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  checkProject,
  emitProject,
  readSourceText,
  SourceEncodingError,
} from "../src/cli/index.js";

async function withProject(callback: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-encoding-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// A lone 0x80 continuation byte is never valid UTF-8.
const invalidUtf8 = Buffer.from([0x23, 0x69, 0x66, 0x20, 0x80, 0x0a]); // "#if " + 0x80 + LF

test("readSourceText rejects malformed UTF-8 with file context", async () => {
  await withProject(async (root) => {
    const file = join(root, "broken.ts");
    await writeFile(file, invalidUtf8);
    await assert.rejects(
      readSourceText(file, "broken.ts"),
      (error: unknown) => error instanceof SourceEncodingError && error.file === "broken.ts",
    );
  });
});

test("readSourceText keeps a correctly encoded U+FFFD character", async () => {
  await withProject(async (root) => {
    const file = join(root, "ok.ts");
    const source = "const replacement = '�';\n";
    await writeFile(file, source, "utf8");
    assert.equal(await readSourceText(file, "ok.ts"), source);
  });
});

test("check fails on malformed UTF-8 source before reporting diagnostics", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(join(root, "source", "bad.ts"), invalidUtf8);
    await assert.rejects(
      checkProject({
        projectRoot: root,
        sourceRoot: "source",
        profiles: [{ name: "HOK", definitions: { HOK: true } }],
      }),
      (error: unknown) => error instanceof SourceEncodingError && error.file === "bad.ts",
    );
  });
});

test("emit fails on malformed UTF-8 without replacing existing output", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(join(root, "source", "bad.ts"), invalidUtf8);
    const existing = join(root, "Build", ".macrobuild", "HOK", "existing.ts");
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, "existing", "utf8");

    await assert.rejects(
      emitProject({
        projectRoot: root,
        sourceRoot: "source",
        profileName: "HOK",
        definitions: { HOK: true },
      }),
      (error: unknown) => error instanceof SourceEncodingError && error.file === "bad.ts",
    );
    assert.equal(await readFile(existing, "utf8"), "existing");
  });
});

test("packaged emit and check report encoding failures with exit code 2", async () => {
  await withProject(async (root) => {
    await writeFile(join(root, "tsifdef"), "{\"HOK\":[\"HOK\"]}", "utf8");
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(join(root, "source", "bad.ts"), invalidUtf8);
    const cli = join(process.cwd(), "dist", "cli", "main.js");

    const emit = spawnSync(
      process.execPath,
      [cli, "emit", "--profile", "HOK", "--source", "source"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(emit.status, 2, emit.stdout);
    assert.match(emit.stderr, /bad\.ts.*not valid UTF-8/);

    const check = spawnSync(
      process.execPath,
      [cli, "check", "--profile", "HOK", "--source", "source"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(check.status, 2, check.stdout);
    assert.match(check.stderr, /bad\.ts.*not valid UTF-8/);
  });
});
