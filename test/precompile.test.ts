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
