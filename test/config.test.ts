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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadProfileFile,
  loadProjectConfiguration,
  discoverProjectConfiguration,
  parseProfileFile,
} from "../src/cli/index.js";

test("loads the one package.json Profile pointer relative to the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-package-config-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profiles/HOK.json" }), "utf8");
    const configuration = await loadProjectConfiguration(root);
    assert.equal(configuration.packagePath, join(root, "package.json"));
    assert.equal(configuration.profilePath, join(root, "Profiles", "HOK.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a missing or non-string package.json Profile pointer", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-package-config-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: { profile: "HOK" } }), "utf8");
    await assert.rejects(loadProjectConfiguration(root), /non-empty string 'tsifdef'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("optional project discovery treats an absent TSIfDef opt-in as disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-config-optional-"));
  try {
    assert.equal(await discoverProjectConfiguration(root), undefined);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "ordinary-ts-project" }), "utf8");
    assert.equal(await discoverProjectConfiguration(root), undefined);
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "" }), "utf8");
    await assert.rejects(discoverProjectConfiguration(root), /non-empty string 'tsifdef'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loads one explicitly selected Profile file without a configured name", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-profile-file-"));
  const path = join(root, "HOK.json");
  try {
    await writeFile(path, "\uFEFF[\"HOK\",\"GLOBAL_GENERAL\"]", "utf8");
    const profile = await loadProfileFile(path);
    assert.equal(profile.path, path);
    assert.equal(profile.fileName, "HOK.json");
    assert.deepEqual({ ...profile.definitions }, { HOK: true, GLOBAL_GENERAL: true });
    assert.equal(Object.isFrozen(profile.definitions), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("single Profile files reject maps and invalid macro names", () => {
  for (const text of [
    JSON.stringify({ HOK: ["HOK"] }),
    JSON.stringify(["NOT-VALID"]),
  ]) {
    assert.throws(() => parseProfileFile(text, "HOK.json"), /Profile|macro/);
  }
});

test("a repeated macro name is tolerated and de-duplicated", () => {
  // A generated Profile with an accidental duplicate must not collapse the whole
  // Profile; enabling a macro twice means the same as enabling it once.
  const profile = parseProfileFile(JSON.stringify(["HOK", "HOK", "DOMESTIC"]), "HOK.json");
  assert.equal(profile.definitions.HOK, true);
  assert.equal(profile.definitions.DOMESTIC, true);
  assert.equal(Object.keys(profile.definitions).length, 2);
});
