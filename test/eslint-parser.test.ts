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
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";

import { parseForESLint } from "../src/eslint/parser.js";

const moduleRequire = createRequire(__filename);
const { ESLint } = moduleRequire("eslint") as {
  ESLint: new (options: { cwd: string; resolvePluginsRelativeTo?: string }) => {
    lintFiles(files: string[]): Promise<Array<{ readonly messages: readonly unknown[] }>>;
  };
};

async function setup(): Promise<{ root: string; sourceFile: string; dependencyFile: string }> {
  // Keep the fixture below the repository so parser resolution from the linted
  // file can discover this test project's @typescript-eslint/parser dependency.
  const root = await mkdtemp(join(process.cwd(), ".tsifdef-eslint-parser-"));
  const sourceFile = join(root, "src", "main.ts");
  const dependencyFile = join(root, "src", "dependency.ts");
  await mkdir(dirname(sourceFile), { recursive: true });
  await writeFile(join(root, "Profile.json"), '["EDITOR"]\n', "utf8");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", private: true, tsifdef: "./Profile.json" }),
    "utf8",
  );
  await writeFile(
    sourceFile,
    [
      'import { dependency } from "./dependency";',
      "export const active = dependency;",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    dependencyFile,
    [
      "#if EDITOR",
      'import { active } from "./main";',
      "export const dependency = active;",
      "#else",
      "export const dependency = 0;",
      "#endif",
      "",
    ].join("\n"),
    "utf8",
  );
  return { root, sourceFile, dependencyFile };
}

async function selectParser(root: string, parserPackage: string): Promise<void> {
  const adapterRoot = join(root, "node_modules", "@typescript-eslint", "parser");
  const parserPath = moduleRequire.resolve(parserPackage);
  await mkdir(adapterRoot, { recursive: true });
  await writeFile(
    join(adapterRoot, "package.json"),
    JSON.stringify({ name: "@typescript-eslint/parser", main: "index.cjs" }),
    "utf8",
  );
  await writeFile(
    join(adapterRoot, "index.cjs"),
    `module.exports = require(${JSON.stringify(parserPath)});\n`,
    "utf8",
  );
}

const parserMatrix = [
  ["parser 5", "@typescript-eslint/parser"],
  ["parser 6", "typescript-eslint-parser6"],
  ["parser 7", "typescript-eslint-parser7"],
  ["parser 8", "typescript-eslint-parser8"],
] as const;

for (const [label, parserPackage] of parserMatrix) {
  test(`ESLint parser wrapper projects raw macro source with ${label}`, async () => {
    const { root, dependencyFile } = await setup();
    try {
      await selectParser(root, parserPackage);
      const source = await readFile(dependencyFile, "utf8");
      const result = parseForESLint(source, {
        filePath: dependencyFile,
        ecmaVersion: 2022,
        sourceType: "module",
        range: true,
        loc: true,
        tokens: true,
        comment: true,
      });
      assert.equal((result.ast as { type?: unknown }).type, "Program");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("eslint-plugin-import side-channel parsing uses the TSIfDef parser wrapper", async () => {
  const { root, sourceFile } = await setup();
  try {
    const parserPath = join(process.cwd(), "dist", "eslint", "parser.js");
    await writeFile(
      join(root, ".eslintrc.json"),
      JSON.stringify({
        // Keep the recognized parser at the top level so VSCode ESLint's
        // default TypeScript probe enables validation. The TSIfDef wrapper is
        // only for eslint-plugin-import's dependency side channel.
        parser: require.resolve("@typescript-eslint/parser"),
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
        plugins: ["import"],
        rules: { "import/no-cycle": "error" },
        settings: {
          "import/parsers": {
            [parserPath]: [".ts", ".tsx", ".mts", ".cts"],
          },
          "import/resolver": {
            node: { extensions: [".js", ".ts", ".tsx", ".mts", ".cts"] },
          },
        },
      }),
      "utf8",
    );
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      const [result] = await new ESLint({
        cwd: root,
        resolvePluginsRelativeTo: process.cwd(),
      }).lintFiles([sourceFile]);
      assert.equal(result?.messages.length, 1);
      assert.equal(
        (result?.messages[0] as { readonly ruleId?: unknown } | undefined)?.ruleId,
        "import/no-cycle",
      );
    } finally {
      console.warn = originalWarn;
    }
    assert.deepEqual(warnings, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
