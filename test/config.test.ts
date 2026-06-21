import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadTsIfDefConfig,
  parseTsIfDefConfig,
  profileFromConfig,
} from "../src/cli/index.js";

test("loads the fixed package-adjacent tsifdef file with enabled macros only", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-config-"));
  try {
    await writeFile(join(root, "package.json"), "{}", "utf8");
    await writeFile(
      join(root, "tsifdef"),
      JSON.stringify({ HOK: ["HOK", "GLOBAL_GENERAL"], DOMESTIC: ["DOMESTIC"] }),
      "utf8",
    );
    const config = await loadTsIfDefConfig(root);
    assert.equal(config.path, join(root, "tsifdef"));
    assert.deepEqual(config.profiles.map((profile) => profile.name), ["DOMESTIC", "HOK"]);
    assert.deepEqual({ ...profileFromConfig(config, "hok").definitions }, {
      HOK: true,
      GLOBAL_GENERAL: true,
    });
    assert.equal(profileFromConfig(config, "DOMESTIC").definitions.HOK, undefined);
    assert.equal(Object.isFrozen(config.profiles), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects build fields, invalid names, duplicates, and ambiguous profiles", () => {
  for (const text of [
    JSON.stringify({ source: "src" }),
    JSON.stringify({ HOK: ["NOT-VALID"] }),
    JSON.stringify({ HOK: ["HOK", "HOK"] }),
    JSON.stringify({ HOK: [], hok: [] }),
    "{}",
  ]) {
    assert.throws(() => parseTsIfDefConfig(text), /TSIfDef|Profile|macro/);
  }
});
