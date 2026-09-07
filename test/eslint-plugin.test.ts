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
    processors.macros.postprocess([[]], sourceFile);

    await writeFile(
      packagePath,
      JSON.stringify({ tsifdef: "./profiles/Domestic.json" }),
      "utf8",
    );

    const second = processors.macros.preprocess(source, sourceFile)[0]!;
    assert.match(second, /selected = 'domestic'/);
    assert.doesNotMatch(second, /selected = 'hok'/);
    processors.macros.postprocess([[]], sourceFile);
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
    processors.macros.postprocess([[]], sourceFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ESLint processor filters only diagnostics caused by synthetic masking", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-eslint-diagnostics-"));
  const sourceFile = join(root, "src", "main.ts");
  const profilePath = join(root, "Profile.json");
  const source = [
    "function run() {",
    "#if EDITOR",
    "  const active = 1;",
    "#else",
    "  const inactive = 2;   ",
    "#endif",
    "  const real = 3;   ",
    "}",
  ].join("\r\n");
  try {
    await mkdir(dirname(sourceFile), { recursive: true });
    await writeFile(profilePath, "[\"EDITOR\"]\n", "utf8");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ tsifdef: "./Profile.json" }),
      "utf8",
    );

    processors.macros.preprocess(source, sourceFile);
    const messages = [
      {
        ruleId: "no-trailing-spaces",
        message: "synthetic directive whitespace",
        line: 2,
        column: 1,
        endLine: 2,
        endColumn: 11,
      },
      {
        ruleId: "prettier/prettier",
        message: "synthetic multiline formatting",
        line: 3,
        column: 20,
        endLine: 6,
        endColumn: 7,
      },
      {
        ruleId: "custom/raw-text-rule",
        message: "synthetic inactive source",
        line: 5,
        column: 1,
        endLine: 5,
        endColumn: 25,
      },
      {
        ruleId: "no-trailing-spaces",
        message: "masked range plus real indentation",
        line: 6,
        column: 1,
        endLine: 7,
        endColumn: 3,
      },
      {
        ruleId: "no-trailing-spaces",
        message: "real active-source whitespace",
        line: 7,
        column: 18,
        endLine: 7,
        endColumn: 21,
      },
      {
        ruleId: "custom/active-code-rule",
        message: "active source",
        line: 3,
        column: 3,
        endLine: 3,
        endColumn: 8,
      },
      {
        ruleId: "custom/synthetic-point",
        message: "synthetic zero-length point",
        line: 2,
        column: 2,
        endLine: 2,
        endColumn: 2,
      },
      {
        ruleId: "custom/synthetic-no-end",
        message: "synthetic point without end",
        line: 2,
        column: 2,
      },
      {
        ruleId: "custom/active-point",
        message: "active zero-length point",
        line: 3,
        column: 3,
        endLine: 3,
        endColumn: 3,
      },
      {
        ruleId: "custom/masked-boundary",
        message: "masked end boundary",
        line: 2,
        column: 11,
        endLine: 2,
        endColumn: 11,
      },
      {
        ruleId: "custom/incomplete-end",
        message: "incomplete end locations are never hidden",
        line: 2,
        column: 2,
        endLine: 2,
      },
      {
        ruleId: null,
        message: "parser diagnostics are never hidden",
        line: 2,
        column: 1,
        endLine: 2,
        endColumn: 4,
      },
      {
        ruleId: "parser/fatal",
        fatal: true,
        message: "fatal diagnostics are never hidden",
        line: 2,
        column: 1,
        endLine: 2,
        endColumn: 4,
      },
      {
        ruleId: "custom/invalid-location",
        message: "invalid locations are never hidden",
        line: 2,
        column: 999,
      },
      {
        ruleId: "custom/reversed-range",
        message: "reversed ranges are never hidden",
        line: 2,
        column: 8,
        endLine: 2,
        endColumn: 2,
      },
    ];

    const filtered = processors.macros.postprocess([messages], sourceFile);
    assert.deepEqual(
      filtered.map((message) => message.message),
      [
        "masked range plus real indentation",
        "real active-source whitespace",
        "active source",
        "active zero-length point",
        "masked end boundary",
        "incomplete end locations are never hidden",
        "parser diagnostics are never hidden",
        "fatal diagnostics are never hidden",
        "invalid locations are never hidden",
        "reversed ranges are never hidden",
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ESLint processor filters GameInit-style directive and branch diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-eslint-game-init-"));
  const sourceFile = join(root, "src", "GameInit.mts");
  const profilePath = join(root, "Profile.json");
  const source = [
    ...Array.from({ length: 55 }, (_, index) => `// filler ${index + 1}`),
    "#if UNITY_EDITOR",
    "        N.console.log('[TSIfDef] Macro: UNITY_EDITOR');",
    "#elif UNITY_OPENHARMONY",
    "        N.console.log('[TSIfDef] Macro: UNITY_OPENHARMONY');",
    "#elif UNITY_ANDROID",
    "        N.console.log('[TSIfDef] Macro: UNITY_ANDROID');",
    "#elif UNITY_IOS",
    "        N.console.log('[TSIfDef] Macro: UNITY_IOS');",
    "#else",
    "        N.console.log('[TSIfDef] Macro: UNITY OTHERS');",
    "#endif",
    "",
  ].join("\r\n");
  try {
    await mkdir(dirname(sourceFile), { recursive: true });
    await writeFile(profilePath, "[\"UNITY_EDITOR\"]\n", "utf8");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ tsifdef: "./Profile.json" }),
      "utf8",
    );

    processors.macros.preprocess(source, sourceFile);
    const messages = [
      {
        ruleId: "prettier/prettier",
        message: "directive indentation",
        line: 56,
        column: 1,
        endLine: 56,
        endColumn: 17,
      },
      {
        ruleId: "prettier/prettier",
        message: "inactive branches",
        line: 57,
        column: 56,
        endLine: 66,
        endColumn: 7,
      },
    ];
    assert.deepEqual(processors.macros.postprocess([messages], sourceFile), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ESLint processor does not filter diagnostics when no Profile is configured", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-eslint-no-profile-"));
  const sourceFile = join(root, "src", "main.ts");
  const source = "#if EDITOR\nconst value = 1;\n#endif\n";
  try {
    await mkdir(dirname(sourceFile), { recursive: true });
    processors.macros.preprocess(source, sourceFile);
    const message = {
      ruleId: "prettier/prettier",
      message: "original source remains visible",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 11,
    };
    assert.deepEqual(processors.macros.postprocess([[message]], sourceFile), [message]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
