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
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import ts from "typescript";

import { loadProfileFile, precompileProject } from "../src/cli/index.js";

test("precompile derives roots and imports from the original TypeScript Program", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "HOK.json"), "[\"HOK\"]", "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        baseUrl: ".",
        paths: { "@app/*": ["src/*"] },
      },
      include: ["src/**/*.ts"],
    }), "utf8");
    await writeFile(join(root, "src", "main.ts"), "import { value } from '@app/dep';\nvalue.toFixed();\n", "utf8");
    await writeFile(join(root, "src", "dep.ts"), "#if HOK\nexport const value = 1;\n#else\nexport const value = 'x';\n#endif\n", "utf8");

    const result = await precompileProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "HOK.json")),
    });
    assert.deepEqual(result.manifest.files.map((file) => file.source), ["src/dep.ts", "src/main.ts"]);
    assert.equal(result.manifest.files.every((file) => file.sourceHash.length === 64), true);
    const projected = await readFile(join(root, ".tsifdef", "Output", "project", "src", "dep.ts"), "utf8");
    assert.equal(projected.length, (await readFile(join(root, "src", "dep.ts"), "utf8")).length);
    assert.doesNotMatch(projected, /value = 'x'/);

    const config = ts.readConfigFile(result.projectPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, join(root, ".tsifdef", "Output"));
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("precompile honors include and exclude patterns for the current project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-include-"));
  try {
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await mkdir(join(root, "types"), { recursive: true });
    await writeFile(join(root, "Profile.json"), "[\"TEST_A\"]", "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
      },
      include: ["src/**/*.ts", "types/**/*.d.ts"],
      exclude: ["src/skip.ts"],
    }), "utf8");
    await writeFile(join(root, "src", "main.ts"), "export const main = 1;\n", "utf8");
    await writeFile(join(root, "src", "nested", "helper.ts"), "export const helper = 2;\n", "utf8");
    await writeFile(join(root, "src", "skip.ts"), "export const skip = 3;\n", "utf8");
    await writeFile(
      join(root, "types", "public.d.ts"),
      "#if TEST_A\nexport interface PublicApi { readonly value: string; }\n#else\nexport interface PublicApi { readonly value: number; }\n#endif\n",
      "utf8",
    );
    await writeFile(join(root, "outside.ts"), "export const outside = 4;\n", "utf8");

    const result = await precompileProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
    });

    assert.deepEqual(result.manifest.files.map((file) => file.source), [
      "src/main.ts",
      "src/nested/helper.ts",
      "types/public.d.ts",
    ]);
    const projected = await readFile(join(root, ".tsifdef", "Output", "project", "types", "public.d.ts"), "utf8");
    assert.equal(projected.length, (await readFile(join(root, "types", "public.d.ts"), "utf8")).length);
    await assert.rejects(readFile(join(root, ".tsifdef", "Output", "project", "src", "skip.ts"), "utf8"));
    await assert.rejects(readFile(join(root, ".tsifdef", "Output", "project", "outside.ts"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("precompile honors files lists and keeps transitive imports from the current project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-files-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "Profile.json"), "[\"TEST_A\"]", "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
      },
      files: ["src/entry.ts"],
    }), "utf8");
    await writeFile(join(root, "src", "entry.ts"), "import { value } from './dep.js';\nexport const entry = value;\n", "utf8");
    await writeFile(join(root, "src", "dep.ts"), "#if TEST_A\nexport const value = 1;\n#else\nexport const value = 2;\n#endif\n", "utf8");
    await writeFile(join(root, "src", "ignored.ts"), "export const ignored = 3;\n", "utf8");

    const result = await precompileProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
    });

    assert.deepEqual(result.manifest.files.map((file) => file.source), ["src/dep.ts", "src/entry.ts"]);
    await assert.rejects(readFile(join(root, ".tsifdef", "Output", "project", "src", "ignored.ts"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("precompile preserves source-map source paths and relocates tsBuildInfoFile into Output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-sourcemap-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "Profile.json"), "[]", "utf8");
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profile.json" }), "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "es2020",
        module: "commonjs",
        incremental: true,
        sourceMap: true,
        sourceRoot: "./src",
        tsBuildInfoFile: "./cache/build.tsbuildinfo",
        outDir: "./dist",
      },
      include: ["src/**/*.ts"],
    }), "utf8");
    await writeFile(join(root, "src", "main.ts"), "export const value = 1;\n", "utf8");

    const result = await precompileProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
    });

    const tsc = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
    const run = spawnSync(process.execPath, [tsc, "-p", result.projectPath], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);

    const map = JSON.parse(await readFile(join(root, "dist", "main.js.map"), "utf8")) as {
      sourceRoot?: string;
      sources?: readonly string[];
    };
    const output = await readFile(join(root, "dist", "main.js"), "utf8");
    assert.equal(map.sourceRoot, "./src/");
    assert.deepEqual(map.sources, ["main.ts"]);
    assert.match(output, /sourceMappingURL=main\.js\.map/);
    assert.doesNotMatch(output, /\.tsifdef\/Output/);
    await assert.rejects(readFile(join(root, "cache", "build.tsbuildinfo"), "utf8"));
    assert.ok((await readFile(join(root, ".tsifdef", "Output", "cache", "build.tsbuildinfo"), "utf8")).length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("precompile places implicit incremental build info inside Output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-buildinfo-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "Profile.json"), "[]", "utf8");
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profile.json" }), "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "es2020",
        module: "commonjs",
        incremental: true,
        outDir: "./dist",
      },
      include: ["src/**/*.ts"],
    }), "utf8");
    await writeFile(join(root, "src", "main.ts"), "export const value = 1;\n", "utf8");

    const result = await precompileProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
    });

    const tsc = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
    const run = spawnSync(process.execPath, [tsc, "-p", result.projectPath], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.ok((await readFile(join(root, ".tsifdef", "Output", "tsconfig.tsbuildinfo"), "utf8")).length > 0);
    await assert.rejects(readFile(join(root, "dist", "tsconfig.tsbuildinfo"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packaged no-argument CLI uses package.json and conventional paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-cli-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "Profile.json"), "[]", "utf8");
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profile.json" }), "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"], compilerOptions: { noEmit: true } }), "utf8");
    await writeFile(join(root, "src", "main.ts"), "export const value = 1;\n", "utf8");
    const cli = join(process.cwd(), "dist", "cli", "main.js");
    const run = spawnSync(process.execPath, [cli], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const manifest = JSON.parse(await readFile(join(root, ".tsifdef", "Output", "manifest.json"), "utf8")) as { files: unknown[] };
    assert.equal(manifest.files.length, 1);
    assert.equal((await readFile(join(root, ".tsifdef", "Output", "tsconfig.json"), "utf8")).includes('"include": []'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packaged CLI supports only --project and reports configuration failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-options-"));
  try {
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(join(root, "Profile.json"), "[]", "utf8");
    await writeFile(join(root, "custom.json"), JSON.stringify({ include: ["source/**/*.ts"], compilerOptions: { noEmit: true } }), "utf8");
    await writeFile(join(root, "source", "main.ts"), "export {};\n", "utf8");
    const cli = join(process.cwd(), "dist", "cli", "main.js");

    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profile.json" }), "utf8");
    const custom = spawnSync(process.execPath, [cli, "--project", "custom.json"], { cwd: root, encoding: "utf8" });
    assert.equal(custom.status, 0, custom.stderr);

    const invalid = spawnSync(process.execPath, [cli, "emit"], { cwd: root, encoding: "utf8" });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /Usage: tsifdef/);

    await writeFile(join(root, "package.json"), "{}", "utf8");
    const missing = spawnSync(process.execPath, [cli], { cwd: root, encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /non-empty string 'tsifdef'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("precompile uses stock tsc decoding for malformed UTF-8 bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-precompile-encoding-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, ".tsifdef", "Output"), { recursive: true });
    await writeFile(join(root, "Profile.json"), "[]", "utf8");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }), "utf8");
    await writeFile(join(root, "src", "bad.ts"), new Uint8Array([0x63, 0x6f, 0x6e, 0x73, 0x74, 0x20, 0xff]));
    const marker = join(root, ".tsifdef", "Output", "existing.txt");
    await writeFile(marker, "keep", "utf8");
    await precompileProject({
      projectRoot: root,
      project: "tsconfig.json",
      profile: await loadProfileFile(join(root, "Profile.json")),
    });
    assert.match(await readFile(join(root, ".tsifdef", "Output", "project", "src", "bad.ts"), "utf8"), /\uFFFD/);
    await assert.rejects(readFile(marker, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
