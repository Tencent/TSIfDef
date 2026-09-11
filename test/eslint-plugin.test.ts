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
import { createRequire } from "node:module";
import test from "node:test";

import plugin, { configs, meta, processors } from "../src/eslint/plugin.js";
import { VERSION } from "../src/version.js";

interface FlatShape {
  readonly files: readonly string[];
  readonly plugins: { readonly tsifdef: unknown };
  readonly processor: string;
  readonly settings: Record<string, unknown>;
}

interface LegacyShape {
  readonly plugins: readonly string[];
  readonly overrides: readonly { readonly files: readonly string[]; readonly processor: string }[];
  readonly settings: Record<string, unknown>;
}

const moduleRequire = createRequire(__filename);

interface LintMessage {
  readonly fatal?: boolean;
  readonly message: string;
}

interface Linter {
  verify(
    source: string,
    config: readonly unknown[],
    options: { readonly filename: string },
  ): readonly LintMessage[];
}

interface LinterConstructor {
  new (options: { readonly configType: "flat" }): Linter;
}

const eslintMatrix = [
  ["ESLint 8 with parser 5", "eslint", "@typescript-eslint/parser"],
  ["ESLint 8 with parser 6", "eslint", "typescript-eslint-parser6"],
  ["ESLint 8 with parser 7", "eslint", "typescript-eslint-parser7"],
  ["ESLint 8 with parser 8", "eslint", "typescript-eslint-parser8"],
  ["ESLint 9 with parser 8", "eslint9", "typescript-eslint-parser8"],
] as const;

async function setupProject(): Promise<{
  readonly root: string;
  readonly sourceFile: string;
  readonly packagePath: string;
}> {
  const root = await mkdtemp(join(process.cwd(), ".tsifdef-eslint-"));
  const sourceFile = join(root, "src", "main.ts");
  await mkdir(dirname(sourceFile), { recursive: true });
  await mkdir(join(root, "profiles"), { recursive: true });
  await writeFile(join(root, "profiles", "BROWSER.json"), "[\"BROWSER\"]\n", "utf8");
  await writeFile(join(root, "profiles", "NODE.json"), "[]\n", "utf8");
  await writeFile(
    sourceFile,
    "#if BROWSER\nconst selected = 'browser';\n#else\nconst selected = 'node';\n#endif\n",
    "utf8",
  );
  const packagePath = join(root, "package.json");
  await writeFile(packagePath, JSON.stringify({ tsifdef: "./profiles/BROWSER.json" }), "utf8");
  return { root, sourceFile, packagePath };
}

test("ESLint plugin exports metadata and a reusable flat config", () => {
  assert.deepEqual(meta, { name: "tsifdef", version: VERSION });
  assert.equal(plugin.meta, meta);
  assert.equal(plugin.processors, processors);
  assert.equal(plugin.configs, configs);
  const flat = configs["flat/recommended"] as FlatShape;
  assert.equal(flat.plugins.tsifdef, plugin);
  assert.equal(flat.processor, "tsifdef/macros");
  assert.deepEqual(flat.files, ["**/*.{ts,tsx,mts,cts}"]);
  assert.deepEqual(flat.settings["import/parsers"], {
    "tsifdef/parser": [".ts", ".tsx", ".mts", ".cts"],
  });
  assert.deepEqual(processors.macros.meta, {
    name: "tsifdef/macros",
    version: VERSION,
  });
});

/**
 * The legacy `.eslintrc` schema rejects a top-level `files` key, so reusing the
 * flat config for `extends: ["plugin:tsifdef/recommended"]` made ESLint 8 abort
 * with "Unexpected top-level property \"files\"".
 */
test("the legacy recommended config uses the eslintrc shape", () => {
  const legacy = configs.recommended as LegacyShape;
  assert.equal((legacy as { files?: unknown }).files, undefined);
  assert.deepEqual(legacy.plugins, ["tsifdef"]);
  assert.deepEqual(legacy.overrides, [
    { files: ["*.ts", "*.tsx", "*.mts", "*.cts"], processor: "tsifdef/macros" },
  ]);
  // Legacy resolves the plugin as eslint-plugin-tsifdef, so import/parsers must
  // be keyed by the full package name rather than the flat-config short name.
  assert.deepEqual(legacy.settings["import/parsers"], {
    "eslint-plugin-tsifdef/parser": [".ts", ".tsx", ".mts", ".cts"],
  });
});

for (const [label, eslintPackage, parserPackage] of eslintMatrix) {
  test(`flat config projects TypeScript with ${label}`, async () => {
    const { root, sourceFile } = await setupProject();
    const source = [
      "#if BROWSER",
      "const selected: string = 'browser';",
      "#else",
      "const selected: = ;",
      "#endif",
      "selected;",
      "",
    ].join("\n");
    try {
      const { Linter } = moduleRequire(eslintPackage) as { readonly Linter: LinterConstructor };
      const parser = moduleRequire(parserPackage) as unknown;
      const linter = new Linter({ configType: "flat" });
      const messages = linter.verify(
        source,
        [
          configs["flat/recommended"],
          {
            files: ["**/*.{ts,tsx,mts,cts}"],
            languageOptions: {
              parser,
              parserOptions: { ecmaVersion: "latest", sourceType: "module" },
            },
          },
        ],
        { filename: sourceFile },
      );
      assert.deepEqual(messages, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("ESLint processor notices package.json Profile pointer edits in one process", async () => {
  const { root, sourceFile, packagePath } = await setupProject();
  const source = "#if BROWSER\nconst selected = 'browser';\n#else\nconst selected = 'node';\n#endif\n";
  try {
    const first = processors.macros.preprocess(source, sourceFile)[0]!;
    assert.match(first, /selected = 'browser'/);
    assert.doesNotMatch(first, /selected = 'node'/);
    processors.macros.postprocess([[]], sourceFile);

    await writeFile(
      packagePath,
      JSON.stringify({ tsifdef: "./profiles/NODE.json" }),
      "utf8",
    );

    const second = processors.macros.preprocess(source, sourceFile)[0]!;
    assert.match(second, /selected = 'node'/);
    assert.doesNotMatch(second, /selected = 'browser'/);
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

test("ESLint processor does not filter diagnostics when no Profile is configured", async () => {  const root = await mkdtemp(join(tmpdir(), "tsifdef-eslint-no-profile-"));
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

for (const [label, eslintPackage, parserPackage] of eslintMatrix) {
  test(`autofix survives the processor with ${label}`, async () => {
    const { root, sourceFile } = await setupProject();
    const source = [
      "#if BROWSER",
      "const active = 1",
      "#else",
      "const inactive = 2",
      "#endif",
      "active;",
      "",
    ].join("\n");
    try {
      const { Linter } = moduleRequire(eslintPackage) as { readonly Linter: LinterConstructor };
      const parser = moduleRequire(parserPackage) as unknown;
      const linter = new Linter({ configType: "flat" });
      const messages = linter.verify(
        source,
        [
          configs["flat/recommended"],
          {
            files: ["**/*.{ts,tsx,mts,cts}"],
            languageOptions: {
              parser,
              parserOptions: { ecmaVersion: "latest", sourceType: "module" },
            },
            rules: { semi: ["error", "always"] },
          },
        ],
        { filename: sourceFile },
      );

      // The active branch keeps its autofix; the masked branch reports nothing.
      assert.equal(messages.length, 1);
      const [message] = messages as readonly (LintMessage & {
        readonly line?: number;
        readonly fix?: { readonly range: readonly [number, number]; readonly text: string };
      })[];
      assert.equal(message?.line, 2);
      assert.ok(message?.fix, "expected the active-branch fix to survive the processor");
      const [start, end] = message!.fix!.range;
      assert.equal(source.slice(0, start).endsWith("const active = 1"), true);
      assert.equal(start, end);
      assert.equal(message!.fix!.text, ";");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("ESLint processor keeps active fixes and drops fixes that touch masked text", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-eslint-fixes-"));
  const sourceFile = join(root, "src", "main.ts");
  const profilePath = join(root, "Profile.json");
  const source = [
    "const before = 1",
    "#if EDITOR",
    "const active = 2",
    "#else",
    "const inactive = 3",
    "#endif",
    "const after = 4",
    "",
  ].join("\n");
  try {
    await mkdir(dirname(sourceFile), { recursive: true });
    await writeFile(profilePath, "[\"EDITOR\"]\n", "utf8");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ tsifdef: "./Profile.json" }),
      "utf8",
    );

    processors.macros.preprocess(source, sourceFile);

    const directiveStart = source.indexOf("#if EDITOR");
    const inactiveStart = source.indexOf("const inactive = 3");
    const activeStart = source.indexOf("const active = 2");
    const afterStart = source.indexOf("const after = 4");

    const messages = [
      {
        ruleId: "semi",
        message: "active fix is preserved",
        line: 3,
        column: 17,
        fix: { range: [activeStart + 16, activeStart + 16] as [number, number], text: ";" },
      },
      {
        ruleId: "semi",
        message: "leading active fix is preserved",
        line: 1,
        column: 17,
        fix: { range: [16, 16] as [number, number], text: ";" },
      },
      {
        ruleId: "custom/spanning",
        message: "fix spanning a masked directive is dropped",
        line: 1,
        column: 1,
        fix: { range: [0, afterStart] as [number, number], text: "rewritten" },
      },
      {
        ruleId: "custom/inside-inactive",
        message: "fix inside an inactive branch is dropped",
        line: 7,
        column: 1,
        fix: {
          range: [inactiveStart, inactiveStart + 5] as [number, number],
          text: "let",
        },
      },
      {
        ruleId: "custom/insertion-in-mask",
        message: "insertion point inside masked text is dropped",
        line: 7,
        column: 1,
        fix: {
          range: [directiveStart + 2, directiveStart + 2] as [number, number],
          text: "x",
        },
      },
      {
        ruleId: "custom/suggestions",
        message: "unsafe suggestions are pruned",
        line: 7,
        column: 1,
        suggestions: [
          { desc: "safe", fix: { range: [afterStart, afterStart + 5] as [number, number], text: "let" } },
          { desc: "unsafe", fix: { range: [inactiveStart, afterStart] as [number, number], text: "" } },
        ],
      },
    ];

    const processed = processors.macros.postprocess([messages], sourceFile);
    const byMessage = new Map(processed.map((entry) => [entry.message as string, entry]));

    assert.ok(byMessage.get("active fix is preserved")?.fix, "active fix must survive");
    assert.ok(byMessage.get("leading active fix is preserved")?.fix, "pre-macro fix must survive");
    assert.equal(byMessage.get("fix spanning a masked directive is dropped")?.fix, undefined);
    assert.equal(byMessage.get("fix inside an inactive branch is dropped")?.fix, undefined);
    assert.equal(byMessage.get("insertion point inside masked text is dropped")?.fix, undefined);

    // Every diagnostic is anchored in active code, so none is filtered as
    // synthetic: only the unsafe fixes are removed, never the reports.
    assert.deepEqual(
      processed.map((entry) => entry.message),
      messages.map((entry) => entry.message),
    );

    const pruned = byMessage.get("unsafe suggestions are pruned");
    assert.equal(pruned?.suggestions?.length, 1);
    assert.equal(pruned?.suggestions?.[0]?.desc, "safe");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ESLint processor exposes autofix support to ESLint", () => {
  assert.equal(processors.macros.supportsAutofix, true);
});
