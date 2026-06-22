import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadProfileFile,
  loadProjectConfiguration,
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

test("single Profile files reject maps, invalid macro names, and duplicates", () => {
  for (const text of [
    JSON.stringify({ HOK: ["HOK"] }),
    JSON.stringify(["NOT-VALID"]),
    JSON.stringify(["HOK", "HOK"]),
  ]) {
    assert.throws(() => parseProfileFile(text, "HOK.json"), /Profile|macro/);
  }
});
