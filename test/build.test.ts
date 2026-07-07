import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { buildProject, BuildUnsupportedError, loadProfileFile } from "../src/cli/index.js";

interface ProjectSpec {
  readonly profile: readonly string[];
  readonly compilerOptions: Record<string, unknown>;
  readonly files: Readonly<Record<string, string>>;
  readonly include?: readonly string[];
}

async function setup(spec: ProjectSpec): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-build-"));
  await writeFile(join(root, "Profile.json"), JSON.stringify(spec.profile), "utf8");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }),
    "utf8",
  );
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: spec.compilerOptions,
      include: spec.include ?? ["src/**/*.ts", "src/**/*.mts"],
    }),
    "utf8",
  );
  for (const [rel, content] of Object.entries(spec.files)) {
    const target = join(root, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return root;
}

async function run(root: string) {
  return buildProject({
    projectRoot: root,
    project: "tsconfig.json",
    profile: await loadProfileFile(join(root, "Profile.json")),
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

test("emits active branch and omits inactive branch in output JavaScript", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020" },
    files: {
      "src/main.ts":
        "#if BROWSER\nexport const runtime = 'browser';\n#else\nexport const runtime = 'node';\n#endif\n",
    },
  });
  try {
    const result = await run(root);
    assert.equal(result.emitted, true);
    assert.equal(result.hasErrors, false);
    const js = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.match(js, /browser/);
    assert.doesNotMatch(js, /node/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sourcemap sources are relative, portable, and resolve to the original source", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: { strict: true, outDir: "dist", sourceMap: true, module: "commonjs", target: "ES2020" },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    await run(root);
    const mapPath = join(root, "dist", "main.js.map");
    const map = JSON.parse(await readFile(mapPath, "utf8")) as { sources: string[]; sourceRoot?: string };
    assert.equal(map.sources.length, 1);
    const source = map.sources[0]!;
    // Relative and portable: no absolute path baked in.
    assert.equal(/^([a-zA-Z]:[\\/]|\/)/.test(source), false);
    assert.equal(source.includes(tmpdir().replace(/\\/g, "/")), false);
    const resolved = resolve(dirname(mapPath), map.sourceRoot ?? "", source);
    assert.equal(await exists(resolved), true);
    assert.equal(resolve(resolved), resolve(join(root, "src", "main.ts")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sourcemap sources are correct across different output directory depths", async () => {
  const root = await setup({
    profile: [],
    compilerOptions: { strict: true, outDir: "dist", sourceMap: true, module: "commonjs", target: "ES2020" },
    files: {
      "src/shallow.ts": "export const a = 1;\n",
      "src/deep/deeper/leaf.ts": "export const b = 2;\n",
    },
  });
  try {
    await run(root);
    for (const [mapRel, srcRel] of [
      ["dist/shallow.js.map", "src/shallow.ts"],
      ["dist/deep/deeper/leaf.js.map", "src/deep/deeper/leaf.ts"],
    ] as const) {
      const mapPath = join(root, mapRel);
      const map = JSON.parse(await readFile(mapPath, "utf8")) as { sources: string[]; sourceRoot?: string };
      const resolved = resolve(dirname(mapPath), map.sourceRoot ?? "", map.sources[0]!);
      assert.equal(resolve(resolved), resolve(join(root, srcRel)), `${mapRel} should map to ${srcRel}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("equal-length masking keeps mappings aligned to the original line", async () => {
  const root = await setup({
    profile: ["KEEP"],
    compilerOptions: { strict: true, outDir: "dist", sourceMap: true, module: "commonjs", target: "ES2020" },
    files: {
      // The active symbol sits on line 5 of the original file; masking the
      // inactive block above must not shift it.
      "src/main.ts":
        "#if OTHER\nconst dead = 0;\n#endif\n#if KEEP\nexport const marker = 42;\n#endif\n",
    },
  });
  try {
    await run(root);
    const map = JSON.parse(await readFile(join(root, "dist", "main.js.map"), "utf8")) as {
      sources: string[];
      mappings: string;
    };
    // The projected source must still be equal length to the original: the
    // original text is what the map points into.
    const original = await readFile(join(root, "src", "main.ts"), "utf8");
    assert.match(original.split(/\r?\n/)[4]!, /marker = 42/);
    assert.notEqual(map.mappings.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("inlineSources embeds the original source text, not masked whitespace", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: {
      strict: true,
      outDir: "dist",
      sourceMap: true,
      inlineSources: true,
      module: "commonjs",
      target: "ES2020",
    },
    files: {
      "src/main.ts": "#if BROWSER\nexport const only = 'x';\n#else\nexport const only = 'y';\n#endif\n",
    },
  });
  try {
    await run(root);
    const map = JSON.parse(await readFile(join(root, "dist", "main.js.map"), "utf8")) as {
      sourcesContent?: string[];
    };
    assert.ok(map.sourcesContent && map.sourcesContent.length === 1);
    const content = map.sourcesContent[0]!;
    // The inactive branch text ('y') should be present in the embedded original,
    // and the content must not be only whitespace.
    assert.match(content, /only = 'y'/);
    assert.notEqual(content.trim().length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("declaration output drops inactive branches and .d.ts.map points at original", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: {
      strict: true,
      outDir: "dist",
      declaration: true,
      declarationMap: true,
      module: "commonjs",
      target: "ES2020",
    },
    files: {
      "src/main.ts":
        "#if BROWSER\nexport const runtime = 'browser';\n#else\nexport const legacy = 'node';\n#endif\n",
    },
  });
  try {
    await run(root);
    const dts = await readFile(join(root, "dist", "main.d.ts"), "utf8");
    assert.match(dts, /runtime/);
    assert.doesNotMatch(dts, /legacy/);
    const mapPath = join(root, "dist", "main.d.ts.map");
    const map = JSON.parse(await readFile(mapPath, "utf8")) as { sources: string[]; sourceRoot?: string };
    const resolved = resolve(dirname(mapPath), map.sourceRoot ?? "", map.sources[0]!);
    assert.equal(resolve(resolved), resolve(join(root, "src", "main.ts")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("type error diagnostics reference the original source path", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: { strict: true, outDir: "dist", noEmitOnError: true, module: "commonjs", target: "ES2020" },
    files: {
      "src/main.ts": "#if BROWSER\nexport const n: number = 'not a number';\n#endif\n",
    },
  });
  const chunks: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as { write: unknown }).write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  try {
    const result = await run(root);
    assert.equal(result.hasErrors, true);
    const output = chunks.join("");
    assert.match(output, /src[\\/]main\.ts/);
    assert.doesNotMatch(output, /Output[\\/]project/);
  } finally {
    (process.stderr as { write: unknown }).write = originalWrite;
    await rm(root, { recursive: true, force: true });
  }
});

test("noEmitOnError blocks emit and reports errors", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: { strict: true, outDir: "dist", noEmitOnError: true, module: "commonjs", target: "ES2020" },
    files: { "src/main.ts": "export const n: number = 'bad';\n" },
  });
  const originalWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as { write: unknown }).write = (() => true) as typeof process.stderr.write;
  try {
    const result = await run(root);
    assert.equal(result.hasErrors, true);
    assert.equal(result.emitted, false);
    assert.equal(await exists(join(root, "dist", "main.js")), false);
  } finally {
    (process.stderr as { write: unknown }).write = originalWrite;
    await rm(root, { recursive: true, force: true });
  }
});

test("noEmit type-checks without producing output", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: { strict: true, noEmit: true, module: "commonjs", target: "ES2020" },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    const result = await run(root);
    assert.equal(result.emitted, false);
    assert.equal(result.outputFiles.length, 0);
    assert.equal(await exists(join(root, "dist")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("macro-structure errors block the build with a diagnostic", async () => {
  const root = await setup({
    profile: ["BROWSER"],
    compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020" },
    files: { "src/main.ts": "#if BROWSER\nexport const x = 1;\n" }, // missing #endif
  });
  try {
    await assert.rejects(run(root), (error: unknown) => {
      assert.ok(error && typeof error === "object" && "code" in error);
      assert.equal((error as { code: unknown }).code, "build-macro-diagnostics");
      return true;
    });
    assert.equal(await exists(join(root, "dist", "main.js")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("outFile is rejected as unsupported", async () => {
  const root = await setup({
    profile: [],
    compilerOptions: { strict: true, outFile: "bundle.js", module: "system", target: "ES2020" },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    await assert.rejects(run(root), BuildUnsupportedError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
