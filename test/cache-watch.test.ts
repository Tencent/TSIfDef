import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createProjectionCacheKey,
  emitProject,
  WatchRebuilder,
  watchProfile,
  type WatchSubscribe,
} from "../src/cli/index.js";

async function withProject(callback: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-cache-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("cache keys are deterministic and include every required input", () => {
  const base = createProjectionCacheKey("source", { B: false, A: true }, "core-1", "config-1");
  assert.equal(base, createProjectionCacheKey("source", { A: true, B: false }, "core-1", "config-1"));
  assert.notEqual(base, createProjectionCacheKey("changed", { A: true, B: false }, "core-1", "config-1"));
  assert.notEqual(base, createProjectionCacheKey("source", { A: false, B: false }, "core-1", "config-1"));
  assert.notEqual(base, createProjectionCacheKey("source", { A: true, B: false }, "core-2", "config-1"));
  assert.notEqual(base, createProjectionCacheKey("source", { A: true, B: false }, "core-1", "config-2"));
});

test("incremental emit invalidates changed inputs and removes deleted files", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "#if ON\nconst a = 1;\n#endif\n", "utf8");
    await writeFile(join(root, "src", "b.ts"), "const b = 1;\n", "utf8");
    const emit = (definitions = { ON: true }, macroConfigVersion = "1", preprocessorVersion?: string) =>
      emitProject({
        projectRoot: root,
        sourceRoot: "src",
        profileName: "TEST",
        definitions,
        cache: {
          macroConfigVersion,
          ...(preprocessorVersion === undefined ? {} : { preprocessorVersion }),
        },
      });

    assert.equal((await emit()).cacheHits, 0);
    assert.equal((await emit()).cacheHits, 2);
    await writeFile(join(root, "src", "a.ts"), "#if ON\nconst a = 2;\n#endif\n", "utf8");
    assert.equal((await emit()).cacheHits, 1);
    await unlink(join(root, "src", "b.ts"));
    const afterDelete = await emit();
    assert.equal(afterDelete.cacheHits, 1);
    await assert.rejects(readFile(join(afterDelete.outputRoot, "b.ts"), "utf8"));
    assert.equal((await emit({ ON: false })).cacheHits, 0);
    assert.equal((await emit({ ON: false }, "2")).cacheHits, 0);
    assert.equal((await emit({ ON: false }, "2", "core-2")).cacheHits, 0);

    const cachePath = join(root, "Build", ".macrobuild", ".cache", "TEST.json");
    await writeFile(cachePath, "not json", "utf8");
    assert.equal((await emit({ ON: false }, "2", "core-2")).cacheHits, 0);
  });
});

test("watch rebuilder serializes work and coalesces changes while busy", async () => {
  let calls = 0;
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolveGate) => {
    releaseFirst = resolveGate;
  });
  const rebuilder = new WatchRebuilder(async () => {
    calls += 1;
    if (calls === 1) {
      await firstGate;
    }
  });
  rebuilder.trigger();
  await Promise.resolve();
  rebuilder.trigger();
  rebuilder.trigger();
  releaseFirst?.();
  await rebuilder.waitForIdle();
  assert.equal(calls, 2);
});

test("watch reloads a changed profile through an injected subscription", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    const profilePath = join(root, "Build", "macros", "test.json");
    await writeFile(profilePath, "{\"ON\":true}", "utf8");
    await writeFile(join(root, "src", "main.ts"), "#if ON\nconst on = true;\n#else\nconst off = true;\n#endif\n", "utf8");
    const callbacks: Array<(fileName?: string) => void> = [];
    const subscribe: WatchSubscribe = (_path, _recursive, onChange) => {
      callbacks.push(onChange);
      return { close: () => undefined };
    };
    const handle = await watchProfile({
      projectRoot: root,
      sourceRoot: "src",
      profileName: "TEST",
      profilePath,
      macroConfigVersion: "1",
      subscribe,
    });
    let output = await readFile(join(root, "Build", ".macrobuild", "TEST", "main.ts"), "utf8");
    assert.equal(output.includes("const on"), true);
    await writeFile(profilePath, "{\"ON\":false}", "utf8");
    callbacks.at(-1)?.("test.json");
    await handle.rebuilder.waitForIdle();
    output = await readFile(join(root, "Build", ".macrobuild", "TEST", "main.ts"), "utf8");
    assert.equal(output.includes("const off"), true);
    assert.equal(output.includes("const on"), false);
    handle.close();
  });
});
