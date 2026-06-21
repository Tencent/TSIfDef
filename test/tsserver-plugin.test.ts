import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { createMemoryHost } from "./tsserver-fixtures.js";

// The plugin uses `export =`, so load its factory through require.
import initPlugin = require("../src/tsserver/plugin.js");
const init = initPlugin as unknown as (modules: { typescript: typeof ts }) => {
  create(info: unknown): ts.LanguageService;
  onConfigurationChanged?(config: Record<string, unknown>): void;
};

async function withProject(callback: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-plugin-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function pluginInfo(
  root: string,
  host: ts.LanguageServiceHost,
  languageService: ts.LanguageService,
  config: Record<string, unknown>,
): unknown {
  const messages: string[] = [];
  return {
    languageService,
    languageServiceHost: host,
    serverHost: {},
    config,
    project: {
      projectService: { logger: { info: (message: string) => messages.push(message) } },
      getProjectName: () => join(root, "tsconfig.json"),
      getCurrentDirectory: () => root,
      markAsDirty: () => undefined,
      updateGraph: () => undefined,
      refreshDiagnostics: () => undefined,
    },
  };
}

test("plugin resolves a relative macrosDir against the project root and projects", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await writeFile(join(root, "Build", "macros", "hok.json"), "{\"HOK\":true}", "utf8");
    const file = join(root, "main.ts");
    const source = "#if HOK\nexport const value: number = 1;\n#else\nexport const value: string = 'x';\n#endif\n";

    const files = new Map([[file, { text: source, version: "1" }]]);
    const host = createMemoryHost(files);
    const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
    const info = pluginInfo(root, host, languageService, { profile: "HOK", macrosDir: "Build/macros" });

    const plugin = init({ typescript: ts });
    const wrapped = plugin.create(info);

    // The HOK branch is active; the snapshot the service sees is the projection.
    const snapshot = host.getScriptSnapshot(file)!;
    const projected = snapshot.getText(0, snapshot.getLength());
    assert.equal(projected.includes("value: number = 1"), true);
    assert.equal(projected.includes("value: string"), false);
    assert.equal(projected.includes("#if"), false);
    assert.equal(projected.length, source.length);
    // The version carries a profile tag so a profile change invalidates reuse.
    assert.match(wrapped.getProgram() ? host.getScriptVersion(file) : "", /tsifdef:/);
  });
});

test("plugin reprojects when VSCode sends a different profile", async () => {
  await withProject(async (root) => {
    const macrosDir = join(root, "Build", "macros");
    await mkdir(macrosDir, { recursive: true });
    await writeFile(join(macrosDir, "hok.json"), "{\"HOK\":true}", "utf8");
    await writeFile(join(macrosDir, "domestic.json"), "{\"HOK\":false}", "utf8");
    const file = join(root, "main.ts");
    const source = "#if HOK\nconst selected = 'hok';\n#else\nconst selected = 'domestic';\n#endif\n";
    const host = createMemoryHost(new Map([[file, { text: source, version: "1" }]]));
    const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
    const plugin = init({ typescript: ts });
    plugin.create(pluginInfo(root, host, languageService, {
      profile: "HOK",
      macrosDir: "Build/macros",
    }));

    assert.match(host.getScriptSnapshot(file)!.getText(0, source.length), /selected = 'hok'/);
    plugin.onConfigurationChanged?.({ profile: "DOMESTIC", macrosDir });
    const projected = host.getScriptSnapshot(file)!.getText(0, source.length);
    assert.match(projected, /selected = 'domestic'/);
    assert.doesNotMatch(projected, /selected = 'hok'/);
  });
});

test("plugin leaves the service untouched when no profile is selected", async () => {
  await withProject(async (root) => {
    // No macros directory and no profile config or env: projection disabled.
    const file = join(root, "main.ts");
    const source = "const plain = 1;\n";
    const files = new Map([[file, { text: source, version: "1" }]]);
    const host = createMemoryHost(files);
    const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
    const previousEnv = process.env.HOK_TS_PROFILE;
    delete process.env.HOK_TS_PROFILE;
    try {
      const info = pluginInfo(root, host, languageService, {});
      const plugin = init({ typescript: ts });
      plugin.create(info);
      assert.equal(host.getScriptVersion(file), "1");
      assert.equal(host.getScriptSnapshot(file)!.getText(0, source.length), source);
    } finally {
      if (previousEnv !== undefined) {
        process.env.HOK_TS_PROFILE = previousEnv;
      }
    }
  });
});
