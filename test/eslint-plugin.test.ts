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
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { processors } from "../src/eslint/plugin.js";

async function setupProject(): Promise<{
  readonly root: string;
  readonly sourceFile: string;
  readonly packagePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-eslint-"));
  const sourceFile = join(root, "src", "main.ts");
  await mkdir(dirname(sourceFile), { recursive: true });
  await mkdir(join(root, "profiles"), { recursive: true });
  await writeFile(join(root, "profiles", "HOK.json"), "[\"HOK\"]\n", "utf8");
  await writeFile(join(root, "profiles", "Domestic.json"), "[]\n", "utf8");
  await writeFile(
    sourceFile,
    "#if HOK\nconst selected = 'hok';\n#else\nconst selected = 'domestic';\n#endif\n",
    "utf8",
  );
  const packagePath = join(root, "package.json");
  await writeFile(packagePath, JSON.stringify({ tsifdef: "./profiles/HOK.json" }), "utf8");
  return { root, sourceFile, packagePath };
}

test("ESLint processor notices package.json Profile pointer edits in one process", async () => {
  const { root, sourceFile, packagePath } = await setupProject();
  const source = "#if HOK\nconst selected = 'hok';\n#else\nconst selected = 'domestic';\n#endif\n";
  try {
    const first = processors.macros.preprocess(source, sourceFile)[0]!;
    assert.match(first, /selected = 'hok'/);
    assert.doesNotMatch(first, /selected = 'domestic'/);

    await writeFile(
      packagePath,
      JSON.stringify({ tsifdef: "./profiles/Domestic.json" }),
      "utf8",
    );

    const second = processors.macros.preprocess(source, sourceFile)[0]!;
    assert.match(second, /selected = 'domestic'/);
    assert.doesNotMatch(second, /selected = 'hok'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ESLint processor preserves TypeScript private members and masks directives", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-eslint-private-"));
  const sourceFile = join(root, "src", "main.ts");
  const profilePath = join(root, "Profile.json");
  const source = [
    "class PrivateMembers {",
    "  #value = 1;",
    "  #typed!: string;",
    "  #method(): number { return this.#value; }",
    "  #if EDITOR",
    "  active(): number { return this.#method(); }",
    "  #else",
    "  inactive(): string { return this.#typed; }",
    "  #endif",
    "}",
  ].join("\n");
  try {
    await mkdir(dirname(sourceFile), { recursive: true });
    await writeFile(profilePath, "[\"EDITOR\"]\n", "utf8");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ tsifdef: "./Profile.json" }),
      "utf8",
    );

    const projected = processors.macros.preprocess(source, sourceFile)[0]!;
    assert.match(projected, /#value = 1/);
    assert.match(projected, /#typed!: string/);
    assert.match(projected, /#method\(\)/);
    assert.match(projected, /active\(\)/);
    assert.doesNotMatch(projected, /inactive\(\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
