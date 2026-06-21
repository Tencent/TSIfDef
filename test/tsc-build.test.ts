import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runTypeScriptBuild } from "../src/cli/index.js";

test("tsc wrapper projects every file selected by tsconfig and imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-tsc-build-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        rootDir: "src",
        outDir: "dist",
        strict: true,
      },
      include: ["src/**/*.ts"],
    }), "utf8");
    await writeFile(join(root, "src", "main.ts"), [
      "import { value } from './value';",
      "#if NONE_EXIST_MACRO",
      "const selected: number = 'bad';",
      "#else",
      "console.log(value);",
      "#endif",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(root, "src", "value.ts"), [
      "#if HOK",
      "export const value = 'hok';",
      "#else",
      "export const value = 'other';",
      "#endif",
      "",
    ].join("\n"), "utf8");

    const result = await runTypeScriptBuild({ cwd: root, args: ["-p", "tsconfig.json"], definitions: { HOK: true } });
    assert.deepEqual(result.errors, []);
    assert.equal(result.emitted, true);
    const output = await readFile(join(root, "dist", "value.js"), "utf8");
    assert.match(output, /value = 'hok'/);
    assert.doesNotMatch(output, /value = 'other'/);

    await writeFile(join(root, "tsifdef"), "{\"HOK\":[\"HOK\"]}", "utf8");
    const cli = join(process.cwd(), "dist", "cli", "main.js");
    const packaged = spawnSync(process.execPath, [
      cli,
      "tsc",
      "--profile",
      "HOK",
      "--",
      "-p",
      "tsconfig.json",
      "--outDir",
      "dist-packaged",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(packaged.status, 0, packaged.stderr);
    assert.match(await readFile(join(root, "dist-packaged", "value.js"), "utf8"), /value = 'hok'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
