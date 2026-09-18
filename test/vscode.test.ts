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
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { activeProfileCommand, ProfileStateController } from "../src/vscode/index.js";
import {
  createTypeScriptIntegration,
  ensureTsserverPluginModule,
} from "../src/vscode/extension.js";
import { FakeHost } from "./fake-host.js";

test("renders the package-selected Profile file and full-path tooltip", () => {
  const host = new FakeHost();
  const controller = new ProfileStateController(host);
  controller.activate();
  const profile = join("C:\\project", "Profiles", "BROWSER.json");
  controller.setProfile(profile);

  assert.equal(host.statusItem.text, "$(versions) TSIfDef: BROWSER.json");
  assert.match(host.statusItem.tooltip ?? "", /package\.json/);
  assert.match(host.statusItem.tooltip ?? "", /BROWSER\.json/);
  assert.deepEqual(controller.effectiveProfile(), { profile, source: "package.json" });
  controller.dispose();
});

test("shows missing and unavailable package Profile states", () => {
  const host = new FakeHost();
  const controller = new ProfileStateController(host);
  controller.activate();
  assert.equal(host.statusItem.text, "$(versions) TSIfDef: none");

  controller.setProfile("C:\\project\\Profiles\\BROWSER.json", "Profile file was not found");
  assert.equal(host.statusItem.text, "$(error) TSIfDef: BROWSER.json (unavailable)");
  assert.equal(host.statusItem.tooltip, "Profile file was not found");
  controller.dispose();
});

test("active Profile command returns the package-selected absolute path", async () => {
  const host = new FakeHost();
  const controller = new ProfileStateController(host);
  controller.activate();
  const profile = "C:\\project\\Profiles\\BROWSER.json";
  controller.setProfile(profile);
  assert.equal(await host.commands.get(activeProfileCommand)?.(), profile);
  controller.dispose();
  assert.equal(host.commands.has(activeProfileCommand), false);
});

test("tsserver plugin shim is rewritten when stale or incomplete", async () => {
  const moduleDir = resolve(".test-dist", "node_modules", "tsifdef-tsserver");
  const manifest = join(moduleDir, "package.json");
  const index = join(moduleDir, "index.js");
  await rm(moduleDir, { recursive: true, force: true });
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    manifest,
    JSON.stringify({ name: "tsifdef-tsserver", version: "0.0.0", private: true, main: "stale.js" }, null, 2),
    "utf8",
  );
  await writeFile(index, "module.exports = require('./stale.js');\n", "utf8");

  ensureTsserverPluginModule();

  const rewrittenManifest = JSON.parse(await readFile(manifest, "utf8")) as {
    version?: string;
    main?: string;
  };
  assert.notEqual(rewrittenManifest.version, "0.0.0");
  assert.equal(rewrittenManifest.main, "../../dist/tsserver/plugin.js");
  assert.equal(
    await readFile(index, "utf8"),
    'module.exports = require("../../dist/tsserver/plugin.js");\n',
  );
});

test("missing TypeScript language service is ignored", async () => {
  let commandCalls = 0;
  const integration = createTypeScriptIntegration({
    extensions: {
      getExtension: () => undefined,
    },
    commands: {
      executeCommand: async () => {
        commandCalls += 1;
      },
    },
  });

  await integration.configurePlugin("tsifdef-tsserver", {
    profileFile: "Profile.json",
  });
  await integration.restartServer();
  await integration.reloadProjects();

  assert.equal(commandCalls, 0);
});

test("unavailable TypeScript language service API is ignored", async () => {
  const integration = createTypeScriptIntegration({
    extensions: {
      getExtension: () => ({
        exports: undefined,
        activate: async () => {
          throw new Error("disabled");
        },
      }),
    },
    commands: {
      executeCommand: async () => {
        throw new Error("command unavailable");
      },
    },
  });

  await integration.configurePlugin("tsifdef-tsserver", {
    profileFile: "Profile.json",
  });
  await integration.restartServer();
  await integration.reloadProjects();
});

test("available TypeScript language service receives config and restart", async () => {
  const configurations: Array<{
    name: string;
    configuration: Readonly<Record<string, unknown>>;
  }> = [];
  const commands: string[] = [];
  const integration = createTypeScriptIntegration({
    extensions: {
      getExtension: () => ({
        exports: undefined,
        activate: async () => ({
          getAPI: () => ({
            configurePlugin: (
              name: string,
              configuration: Readonly<Record<string, unknown>>,
            ) => configurations.push({ name, configuration }),
          }),
        }),
      }),
    },
    commands: {
      executeCommand: async (command: string) => {
        commands.push(command);
      },
    },
  });

  const configuration = { profileFile: "Profile.json", profileToken: "abc" };
  await integration.configurePlugin("tsifdef-tsserver", configuration);
  await integration.restartServer();
  await integration.reloadProjects();

  assert.deepEqual(configurations, [{
    name: "tsifdef-tsserver",
    configuration,
  }]);
  assert.deepEqual(commands, [
    "typescript.restartTsServer",
    "typescript.reloadProjects",
  ]);
});

test("TypeScript Go mode never activates or commands the legacy TypeScript service", async () => {
  let activationCalls = 0;
  let commandCalls = 0;
  const integration = createTypeScriptIntegration(
    {
      extensions: {
        getExtension: () => ({
          exports: undefined,
          activate: async () => {
            activationCalls += 1;
            return {};
          },
        }),
      },
      commands: {
        executeCommand: async () => {
          commandCalls += 1;
        },
      },
    },
    () => true,
  );

  await integration.configurePlugin("tsifdef-tsserver", { profileFile: "Profile.json" });
  await integration.restartServer();
  await integration.reloadProjects();

  assert.equal(activationCalls, 0);
  assert.equal(commandCalls, 0);
});
