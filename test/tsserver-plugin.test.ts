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

test("plugin resolves the selected Profile file and projects", async () => {
  await withProject(async (root) => {
    await writeFile(join(root, "HOK.json"), "[\"HOK\"]", "utf8");
    const file = join(root, "main.ts");
    const source = "#if HOK\nexport const value: number = 1;\n#else\nexport const value: string = 'x';\n#endif\n";

    const files = new Map([[file, { text: source, version: "1" }]]);
    const host = createMemoryHost(files);
    const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
    const info = pluginInfo(root, host, languageService, { profileFile: "HOK.json" });

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
    const hokPath = join(root, "HOK.json");
    const domesticPath = join(root, "Domestic.json");
    await writeFile(hokPath, "[\"HOK\"]", "utf8");
    await writeFile(domesticPath, "[]", "utf8");
    const file = join(root, "main.ts");
    const source = "#if HOK\nconst selected = 'hok';\n#else\nconst selected = 'domestic';\n#endif\n";
    const host = createMemoryHost(new Map([[file, { text: source, version: "1" }]]));
    const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
    const plugin = init({ typescript: ts });
    plugin.create(pluginInfo(root, host, languageService, {
      profileFile: hokPath,
    }));

    assert.match(host.getScriptSnapshot(file)!.getText(0, source.length), /selected = 'hok'/);
    plugin.onConfigurationChanged?.({ profileFile: domesticPath });
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

test("plugin closes the Profile directory watcher on dispose", async () => {
  await withProject(async (root) => {
    const profilePath = join(root, "HOK.json");
    await writeFile(profilePath, "[\"HOK\"]", "utf8");
    const file = join(root, "main.ts");
    const host = createMemoryHost(new Map([[file, { text: "const value = 1;\n", version: "1" }]]));
    const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
    let closed = 0;
    const info = pluginInfo(root, host, languageService, { profileFile: profilePath }) as {
      serverHost: {
        watchDirectory?: (
          path: string,
          callback: () => void,
          recursive?: boolean,
        ) => { close(): void };
      };
    };
    info.serverHost = {
      watchDirectory: () => ({
        close: () => {
          closed += 1;
        },
      }),
    };

    const plugin = init({ typescript: ts });
    const wrapped = plugin.create(info);
    wrapped.dispose();

    assert.equal(closed, 1);
  });
});
