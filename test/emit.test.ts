import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { emitProject, EmitDiagnosticsError } from "../src/cli/index.js";

async function withProject(callback: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-emit-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("emits projected files, preserves source, and removes stale output", async () => {
  await withProject(async (root) => {
    const sourceRoot = join(root, "src");
    const source = ["#if HOK", "export const region = 'hok';", "#else", "export const region = 'other';", "#endif", ""].join("\r\n");
    await mkdir(join(sourceRoot, "nested"), { recursive: true });
    await writeFile(join(sourceRoot, "nested", "region.ts"), source, "utf8");
    await writeFile(join(sourceRoot, "types.d.ts"), "declare const value: string;\n", "utf8");
    await writeFile(join(sourceRoot, "ignored.js"), "#if HOK\n", "utf8");
    const stale = join(root, "Build", ".macrobuild", "HOK", "stale.ts");
    await mkdir(dirname(stale), { recursive: true });
    await writeFile(stale, "stale", "utf8");

    const result = await emitProject({
      projectRoot: root,
      sourceRoot: "src",
      profileName: "HOK",
      definitions: { HOK: true },
    });

    assert.deepEqual(result.files, [join("nested", "region.ts"), "types.d.ts"]);
    const output = await readFile(join(result.outputRoot, "nested", "region.ts"), "utf8");
    assert.equal(output.length, source.length);
    assert.equal(output.includes("region = 'hok'"), true);
    assert.equal(output.includes("region = 'other'"), false);
    assert.equal(await readFile(join(sourceRoot, "nested", "region.ts"), "utf8"), source);
    await assert.rejects(readFile(stale, "utf8"));
  });
});

test("keeps existing output when source diagnostics prevent emission", async () => {
  await withProject(async (root) => {
    await writeFile(join(root, "broken.ts"), "#if MISSING\nvalue();\n#endif\n", "utf8");
    const existing = join(root, "Build", ".macrobuild", "HOK", "existing.ts");
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, "existing", "utf8");

    await assert.rejects(
      emitProject({ projectRoot: root, profileName: "HOK", definitions: {} }),
      (error: unknown) =>
        error instanceof EmitDiagnosticsError && error.files[0]?.file === "broken.ts",
    );
    assert.equal(await readFile(existing, "utf8"), "existing");
  });
});

test("rejects profile path traversal", async () => {
  await assert.rejects(
    emitProject({ projectRoot: tmpdir(), profileName: "../escape", definitions: {} }),
    RangeError,
  );
});

test("runs the packaged emit command", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await writeFile(join(root, "Build", "macros", "hok.json"), "{\"HOK\":true}", "utf8");
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(join(root, "source", "main.ts"), "#if HOK\nconst ok = true;\n#endif\n", "utf8");

    const command = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "cli", "main.js"), "emit", "--profile", "HOK", "--source", "source"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout, /Emitted 1 file/);
    assert.equal(
      (await readFile(join(root, "Build", ".macrobuild", "HOK", "main.ts"), "utf8")).includes("const ok"),
      true,
    );
  });
});
