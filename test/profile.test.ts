import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadProfileFile,
  ProfileLoadError,
  ProfileSelectionError,
  selectProfile,
} from "../src/cli/index.js";

async function withTempProfile(
  content: string,
  callback: (path: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "tsifdef-profile-"));
  const path = join(directory, "profile.json");
  try {
    await writeFile(path, content, "utf8");
    await callback(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("loads an immutable UTF-8 JSON profile", async () => {
  await withTempProfile("\uFEFF{\"HOK\":true,\"DOMESTIC\":false}", async (path) => {
    const profile = await loadProfileFile(path);
    assert.deepEqual({ ...profile }, { HOK: true, DOMESTIC: false });
    assert.equal(Object.isFrozen(profile), true);
    assert.throws(() => {
      (profile as Record<string, boolean>).HOK = false;
    }, TypeError);
  });
});

test("reports stable profile loading failures", async () => {
  const cases = [
    ["not json", "profile-invalid-json"],
    ["[]", "profile-invalid-shape"],
    ["{\"NOT-VALID\":true}", "profile-invalid-macro-name"],
    ["{\"HOK\":1}", "profile-invalid-macro-value"],
  ] as const;

  for (const [content, code] of cases) {
    await withTempProfile(content, async (path) => {
      await assert.rejects(
        loadProfileFile(path),
        (error: unknown) => error instanceof ProfileLoadError && error.code === code,
      );
    });
  }

  await assert.rejects(
    loadProfileFile(join(tmpdir(), "tsifdef-profile-does-not-exist.json")),
    (error: unknown) =>
      error instanceof ProfileLoadError && error.code === "profile-read-failed",
  );
});

test("selects profiles in fixed precedence order", () => {
  const all = {
    cliProfile: " cli ",
    environment: { HOK_TS_PROFILE: "environment" },
    vscodeProfile: "vscode",
    allowDevelopmentInference: true,
    inferFromJunction: () => "junction",
  } as const;

  assert.deepEqual(selectProfile(all), { profile: "cli", source: "cli" });
  assert.deepEqual(
    selectProfile({
      environment: all.environment,
      vscodeProfile: all.vscodeProfile,
      allowDevelopmentInference: all.allowDevelopmentInference,
      inferFromJunction: all.inferFromJunction,
    }),
    { profile: "environment", source: "environment" },
  );
  assert.deepEqual(
    selectProfile({
      environment: {},
      vscodeProfile: all.vscodeProfile,
      allowDevelopmentInference: all.allowDevelopmentInference,
      inferFromJunction: all.inferFromJunction,
    }),
    { profile: "vscode", source: "vscode" },
  );
  assert.deepEqual(
    selectProfile({
      environment: {},
      allowDevelopmentInference: true,
      inferFromJunction: () => "junction",
    }),
    { profile: "junction", source: "junction" },
  );
  assert.deepEqual(
    selectProfile({
      environment: { HOK_TS_PROFILE: "  " },
      vscodeProfile: "vscode",
    }),
    { profile: "vscode", source: "vscode" },
  );
});

test("keeps Junction inference development-only and rejects missing selections", () => {
  let inferenceCalls = 0;
  const inferFromJunction = (): string => {
    inferenceCalls += 1;
    return "junction";
  };

  assert.throws(
    () => selectProfile({ environment: {}, inferFromJunction }),
    ProfileSelectionError,
  );
  assert.equal(inferenceCalls, 0);
  assert.throws(
    () => selectProfile({ cliProfile: "  ", environment: {} }),
    ProfileSelectionError,
  );
  assert.throws(
    () => selectProfile({ environment: { HOK_TS_PROFILE: "  " } }),
    ProfileSelectionError,
  );
  assert.equal(inferenceCalls, 0);
});
