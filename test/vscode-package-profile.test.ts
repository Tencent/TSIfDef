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

import { PackageProfileController, ProfileStateController } from "../src/vscode/index.js";
import type { MacroDefinitions } from "../src/core/index.js";
import { FakeHost } from "./fake-host.js";

test("package.json Profile changes update status, definitions, and tsserver", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-vscode-package-"));
  try {
    await mkdir(join(root, "Profiles"), { recursive: true });
    const hok = join(root, "Profiles", "HOK.json");
    const domestic = join(root, "Profiles", "Domestic.json");
    await writeFile(hok, "[\"HOK\"]", "utf8");
    await writeFile(domestic, "[\"DOMESTIC\"]", "utf8");
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profiles/HOK.json" }), "utf8");

    const host = new FakeHost({ root });
    const state = new ProfileStateController(host);
    let definitions: MacroDefinitions | undefined;
    const controller = new PackageProfileController(host, state, (next) => { definitions = next; });
    state.activate();
    controller.activate();
    await controller.reload();
    assert.equal(host.statusItem.text, "$(versions) TSIfDef: HOK.json");
    assert.equal(definitions?.HOK, true);
    const hokConfig = host.typeScriptPluginConfigurations.at(-1);
    assert.equal(hokConfig?.name, "tsifdef-tsserver");
    assert.equal((hokConfig?.configuration as { profileFile?: string }).profileFile, hok);
    const hokToken = (hokConfig?.configuration as { profileToken?: string }).profileToken;
    assert.equal(typeof hokToken, "string");

    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profiles/Domestic.json" }), "utf8");
    await controller.reload();
    assert.equal(host.statusItem.text, "$(versions) TSIfDef: Domestic.json");
    assert.equal(definitions?.DOMESTIC, true);
    assert.equal(definitions?.HOK, undefined);
    const domesticConfig = host.typeScriptPluginConfigurations.at(-1)?.configuration as {
      profileFile?: string;
      profileToken?: string;
    };
    assert.equal(domesticConfig.profileFile, domestic);
    // The token must change with the enabled macro set so the TypeScript
    // extension always forwards the new config to the plugin.
    assert.notEqual(domesticConfig.profileToken, hokToken);
    controller.dispose();
    state.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ordinary TypeScript project without tsifdef is silently disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-vscode-ordinary-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "ordinary-ts-project" }), "utf8");
    const host = new FakeHost({ root });
    const state = new ProfileStateController(host);
    let definitions: MacroDefinitions | undefined = { STALE: true };
    const controller = new PackageProfileController(host, state, (next) => { definitions = next; });
    state.activate();

    await controller.reload();

    assert.equal(definitions, undefined);
    assert.deepEqual(host.errorMessages, []);
    assert.equal(host.statusItem.shown, false);
    assert.deepEqual(host.typeScriptPluginConfigurations.at(-1), {
      name: "tsifdef-tsserver",
      configuration: {},
    });
    controller.dispose();
    state.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit invalid tsifdef configuration still reports an error", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-vscode-invalid-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "" }), "utf8");
    const host = new FakeHost({ root });
    const state = new ProfileStateController(host);
    const controller = new PackageProfileController(host, state, () => undefined);
    state.activate();

    await controller.reload();

    assert.equal(host.errorMessages.length, 1);
    assert.match(host.errorMessages[0] ?? "", /non-empty string 'tsifdef'/);
    assert.equal(host.statusItem.shown, true);
    controller.dispose();
    state.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
