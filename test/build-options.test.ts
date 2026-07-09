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
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildProject, BuildUnsupportedError, loadProfileFile } from "../src/cli/index.js";

interface ProjectSpec {
  readonly profile?: readonly string[];
  readonly compilerOptions: Record<string, unknown>;
  readonly files: Readonly<Record<string, string>>;
  readonly include?: readonly string[];
  readonly extra?: Readonly<Record<string, unknown>>;
}

async function setup(spec: ProjectSpec): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-opts-"));
  await writeFile(join(root, "Profile.json"), JSON.stringify(spec.profile ?? []), "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }), "utf8");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: spec.compilerOptions,
      include: spec.include ?? ["src/**/*.ts"],
      ...(spec.extra ?? {}),
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

test("module: commonjs emits CommonJS exports", async () => {
  const root = await setup({
    compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020" },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    await run(root);
    const js = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.match(js, /exports\.value|Object\.defineProperty\(exports/);
    assert.doesNotMatch(js, /export const/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("module: esnext preserves ES module syntax", async () => {
  const root = await setup({
    compilerOptions: { strict: true, outDir: "dist", module: "esnext", target: "ES2020" },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    await run(root);
    const js = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.match(js, /export const value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("paths/baseUrl aliases resolve under projected compilation", async () => {
  const root = await setup({
    compilerOptions: {
      strict: true,
      outDir: "dist",
      module: "commonjs",
      target: "ES2020",
      baseUrl: ".",
      paths: { "@app/*": ["src/*"] },
    },
    files: {
      "src/dep.ts": "#if BROWSER\nexport const value = 1;\n#else\nexport const value = 2;\n#endif\n",
      "src/main.ts": "import { value } from '@app/dep';\nexport const doubled = value * 2;\n",
    },
    profile: ["BROWSER"],
  });
  try {
    const result = await run(root);
    assert.equal(result.hasErrors, false);
    assert.equal(await exists(join(root, "dist", "main.js")), true);
    assert.equal(await exists(join(root, "dist", "dep.js")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("emitBOM writes a UTF-8 BOM on emitted files", async () => {
  const root = await setup({
    compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020", emitBOM: true },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    await run(root);
    const bytes = readFileSync(join(root, "dist", "main.js"));
    assert.equal(bytes[0], 0xef);
    assert.equal(bytes[1], 0xbb);
    assert.equal(bytes[2], 0xbf);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("newLine: crlf produces CRLF line endings without disturbing masking", async () => {
  const root = await setup({
    compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020", newLine: "crlf" },
    files: {
      "src/main.ts": "#if BROWSER\nexport const only = 'x';\n#else\nexport const only = 'y';\n#endif\n",
    },
    profile: ["BROWSER"],
  });
  try {
    await run(root);
    const js = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.match(js, /\r\n/);
    assert.match(js, /'x'/);
    assert.doesNotMatch(js, /'y'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("emitDeclarationOnly produces only .d.ts, no .js", async () => {
  const root = await setup({
    compilerOptions: {
      strict: true,
      outDir: "dist",
      module: "commonjs",
      target: "ES2020",
      declaration: true,
      emitDeclarationOnly: true,
    },
    files: { "src/main.ts": "export const value: number = 1;\n" },
  });
  try {
    await run(root);
    assert.equal(await exists(join(root, "dist", "main.d.ts")), true);
    assert.equal(await exists(join(root, "dist", "main.js")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("outFile is rejected with a stable unsupported message", async () => {
  const root = await setup({
    compilerOptions: { strict: true, outFile: "bundle.js", module: "system", target: "ES2020" },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    await assert.rejects(run(root), (error: unknown) => {
      assert.ok(error instanceof BuildUnsupportedError);
      assert.match(error.message, /outFile/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("emitProjection dumps equal-length masked text at the original relative path", async () => {
  const source = "#if BROWSER\nexport const only = 'x';\n#else\nexport const only = 'y';\n#endif\n";
  const root = await setup({
    compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020" },
    files: { "src/main.ts": source },
    profile: ["BROWSER"],
  });
  try {
    await buildProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
      emitProjectionDir: join(root, ".projection"),
    });
    const dumped = await readFile(join(root, ".projection", "src", "main.ts"), "utf8");
    // Equal length to the original, inactive branch masked to spaces.
    assert.equal(dumped.length, source.length);
    assert.match(dumped, /only = 'x'/);
    assert.doesNotMatch(dumped, /only = 'y'/);
    // The dump is not fed to the compiler; normal emit still happened.
    assert.equal(await exists(join(root, "dist", "main.js")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("compilerOptionsOverride overrides tsconfig (module + outDir)", async () => {
  const root = await setup({
    // tsconfig says esnext + dist; the override should win.
    compilerOptions: { strict: true, outDir: "dist", module: "esnext", target: "ES2020" },
    files: { "src/main.ts": "export const value = 1;\n" },
  });
  try {
    await buildProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
      compilerOptionsOverride: { module: 1 /* CommonJS */, outDir: join(root, "out-cjs") },
    });
    assert.equal(await exists(join(root, "out-cjs", "main.js")), true);
    assert.equal(await exists(join(root, "dist", "main.js")), false);
    const js = await readFile(join(root, "out-cjs", "main.js"), "utf8");
    assert.match(js, /exports\.value|Object\.defineProperty\(exports/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project references are rejected with a stable unsupported message", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-opts-refs-"));
  try {
    // Referenced composite project.
    await mkdir(join(root, "lib", "src"), { recursive: true });
    await writeFile(
      join(root, "lib", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { composite: true, outDir: "dist", module: "commonjs", target: "ES2020" },
        include: ["src/**/*.ts"],
      }),
      "utf8",
    );
    await writeFile(join(root, "lib", "src", "dep.ts"), "export const value = 1;\n", "utf8");
    // Main project referencing it.
    await writeFile(join(root, "Profile.json"), "[]", "utf8");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }), "utf8");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "main.ts"), "export const a = 1;\n", "utf8");
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020" },
        include: ["src/**/*.ts"],
        references: [{ path: "./lib" }],
      }),
      "utf8",
    );
    await assert.rejects(run(root), (error: unknown) => {
      assert.ok(error instanceof BuildUnsupportedError);
      assert.match(error.message, /project references|tsc -b|composite/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
