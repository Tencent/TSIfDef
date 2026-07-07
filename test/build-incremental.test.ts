import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildProject, loadProfileFile } from "../src/cli/index.js";

async function setup(profile: readonly string[], files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-inc-"));
  await writeFile(join(root, "Profile.json"), JSON.stringify(profile), "utf8");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }),
    "utf8",
  );
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        outDir: "dist",
        module: "commonjs",
        target: "ES2020",
        incremental: true,
      },
      include: ["src/**/*.ts"],
    }),
    "utf8",
  );
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return root;
}

async function run(root: string, profileName = "Profile.json") {
  return buildProject({
    projectRoot: root,
    project: "tsconfig.json",
    profile: await loadProfileFile(join(root, profileName)),
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test("same Profile: second build reuses incremental state and emits nothing", async () => {
  const root = await setup(["BROWSER"], {
    "src/main.ts": "#if BROWSER\nexport const runtime = 'browser';\n#else\nexport const runtime = 'node';\n#endif\n",
  });
  try {
    const first = await run(root);
    assert.equal(first.emitted, true);
    assert.ok(first.outputFiles.length > 0);
    // A build info file must be produced for incremental reuse.
    assert.equal(await exists(join(root, "dist", "tsconfig.tsbuildinfo")), true);

    const second = await run(root);
    // Nothing changed on disk and the Profile is identical, so the builder
    // should not re-emit any file.
    assert.equal(second.outputFiles.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editing an active branch re-emits the changed file", async () => {
  const root = await setup(["BROWSER"], {
    "src/main.ts": "#if BROWSER\nexport const runtime = 'browser';\n#endif\n",
  });
  try {
    await run(root);
    await writeFile(
      join(root, "src", "main.ts"),
      "#if BROWSER\nexport const runtime = 'browser-2';\n#endif\n",
      "utf8",
    );
    const result = await run(root);
    assert.ok(result.outputFiles.some((file) => file.endsWith("main.js")));
    const js = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.match(js, /browser-2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CORE REGRESSION: switching Profile with unchanged sources rebuilds with the new Profile", async () => {
  const root = await setup(["BROWSER"], {
    "src/main.ts": "#if BROWSER\nexport const runtime = 'browser';\n#else\nexport const runtime = 'node';\n#endif\n",
  });
  try {
    // First build under BROWSER.
    const first = await run(root);
    assert.equal(first.emitted, true);
    let js = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.match(js, /browser/);
    assert.doesNotMatch(js, /node/);

    // Switch the Profile file to NODE. The source file bytes are untouched, so a
    // naive incremental build would wrongly reuse the BROWSER output.
    await writeFile(join(root, "Profile.json"), JSON.stringify(["NODE"]), "utf8");
    const second = await run(root);
    assert.ok(second.outputFiles.some((file) => file.endsWith("main.js")), "profile switch must re-emit");
    js = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.match(js, /node/);
    assert.doesNotMatch(js, /browser/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing profile hash sidecar forces a full rebuild", async () => {
  const root = await setup(["BROWSER"], {
    "src/main.ts": "export const value = 1;\n",
  });
  try {
    await run(root);
    const hashPath = join(root, "dist", "tsconfig.tsbuildinfo.profilehash");
    assert.equal(await exists(hashPath), true);
    // Remove the sidecar: the next build must not trust stale build info.
    await rm(hashPath, { force: true });
    const result = await run(root);
    assert.ok(result.outputFiles.some((file) => file.endsWith("main.js")), "missing hash must re-emit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
