import assert from "node:assert/strict";
import test from "node:test";

import {
  ProfileSelectionError,
  selectProfile,
} from "../src/cli/index.js";

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
