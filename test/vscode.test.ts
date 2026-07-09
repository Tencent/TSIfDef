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
import { join } from "node:path";
import test from "node:test";

import { activeProfileCommand, ProfileStateController } from "../src/vscode/index.js";
import { FakeHost } from "./fake-host.js";

test("renders the package-selected Profile file and full-path tooltip", () => {
  const host = new FakeHost();
  const controller = new ProfileStateController(host);
  controller.activate();
  const profile = join("C:\\project", "Profiles", "HOK.json");
  controller.setProfile(profile);

  assert.equal(host.statusItem.text, "$(versions) TSIfDef: HOK.json");
  assert.match(host.statusItem.tooltip ?? "", /package\.json/);
  assert.match(host.statusItem.tooltip ?? "", /HOK\.json/);
  assert.deepEqual(controller.effectiveProfile(), { profile, source: "package.json" });
  controller.dispose();
});

test("shows missing and unavailable package Profile states", () => {
  const host = new FakeHost();
  const controller = new ProfileStateController(host);
  controller.activate();
  assert.equal(host.statusItem.text, "$(versions) TSIfDef: none");

  controller.setProfile("C:\\project\\Profiles\\HOK.json", "Profile file was not found");
  assert.equal(host.statusItem.text, "$(error) TSIfDef: HOK.json (unavailable)");
  assert.equal(host.statusItem.tooltip, "Profile file was not found");
  controller.dispose();
});

test("active Profile command returns the package-selected absolute path", async () => {
  const host = new FakeHost();
  const controller = new ProfileStateController(host);
  controller.activate();
  const profile = "C:\\project\\Profiles\\HOK.json";
  controller.setProfile(profile);
  assert.equal(await host.commands.get(activeProfileCommand)?.(), profile);
  controller.dispose();
  assert.equal(host.commands.has(activeProfileCommand), false);
});
