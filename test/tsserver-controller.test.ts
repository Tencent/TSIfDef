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
import test from "node:test";
import ts from "typescript";

import {
  ProfileProjectionController,
  wrapHostWithProjection,
  type ActiveProfile,
  type ProfileResolution,
} from "../src/tsserver/index.js";
import { createMemoryHost } from "./tsserver-fixtures.js";

/** Wrap a profile-or-undefined into the resolution the controller now expects. */
function resolution(profile: ActiveProfile | undefined): ProfileResolution {
  return profile === undefined ? { kind: "none" } : { kind: "profile", profile };
}

test("reload marks the project dirty only when the profile version changes", () => {
  const profiles: Array<ActiveProfile | undefined> = [
    { definitions: { HOK: true }, version: "HOK:1" },
    { definitions: { HOK: true }, version: "HOK:1" }, // unchanged
    { definitions: { HOK: false }, version: "DOMESTIC:1" }, // changed
  ];
  let index = 0;
  let dirtyCount = 0;
  const controller = new ProfileProjectionController({
    resolve: () => resolution(profiles[Math.min(index, profiles.length - 1)]),
    markDirty: () => {
      dirtyCount += 1;
    },
  });

  assert.equal(controller.getProfile()?.version, "HOK:1");
  index = 1;
  assert.equal(controller.reload(), false);
  assert.equal(dirtyCount, 0);
  index = 2;
  assert.equal(controller.reload(), true);
  assert.equal(dirtyCount, 1);
  assert.equal(controller.getProfile()?.version, "DOMESTIC:1");
});

test("reload invalidates across none<->selected transitions", () => {
  let value: ActiveProfile | undefined;
  let dirtyCount = 0;
  const controller = new ProfileProjectionController({
    resolve: () => resolution(value),
    markDirty: () => {
      dirtyCount += 1;
    },
  });
  assert.equal(controller.getProfile(), undefined);

  value = { definitions: { HOK: true }, version: "HOK:1" };
  assert.equal(controller.reload(), true);
  assert.equal(dirtyCount, 1);

  // Same selection again: no further invalidation.
  assert.equal(controller.reload(), false);
  assert.equal(dirtyCount, 1);

  value = undefined;
  assert.equal(controller.reload(), true);
  assert.equal(dirtyCount, 2);
  assert.equal(controller.getProfile(), undefined);
});

test("a transient unavailable resolution keeps the current profile", () => {
  let next: ProfileResolution = { kind: "profile", profile: { definitions: { HOK: true }, version: "HOK:1" } };
  let dirtyCount = 0;
  const controller = new ProfileProjectionController({
    resolve: () => next,
    markDirty: () => {
      dirtyCount += 1;
    },
  });
  assert.equal(controller.getProfile()?.version, "HOK:1");

  // A momentary read miss (atomic write) must not flap the profile to none.
  next = { kind: "unavailable" };
  assert.equal(controller.reload(), false);
  assert.equal(dirtyCount, 0);
  assert.equal(controller.getProfile()?.version, "HOK:1");

  // Once the real new content is readable, it takes effect.
  next = { kind: "profile", profile: { definitions: { HOK: false }, version: "DOMESTIC:1" } };
  assert.equal(controller.reload(), true);
  assert.equal(dirtyCount, 1);
  assert.equal(controller.getProfile()?.version, "DOMESTIC:1");
});

function memoryHost(
  files: Map<string, { text: string; version: string }>,
): ts.LanguageServiceHost {
  return createMemoryHost(files);
}

test("switching the profile flips diagnostics on the same TypeScript 5.5.4 service", () => {
  assert.equal(ts.version, "5.5.4");
  const source = [
    "#if HOK",
    "export const region: string = 'hok';",
    "#else",
    "export const region: number = 42;",
    "#endif",
    "const usesRegion: string = region;",
    "",
  ].join("\n");
  const files = new Map([["/main.ts", { text: source, version: "1" }]]);

  // The controller is the single source of truth for the active profile; the
  // host reads it live, so changing it (and the script version) invalidates the
  // cached AST without recreating the language service.
  let active: ActiveProfile | undefined = { definitions: { HOK: true }, version: "HOK:1" };
  const controller = new ProfileProjectionController({
    resolve: () => resolution(active),
    markDirty: () => undefined,
  });
  const host = wrapHostWithProjection(ts, memoryHost(files), {
    getProfile: () => controller.getProfile(),
  });
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  // Under HOK, region is a string and `usesRegion: string` is valid.
  assert.deepEqual(service.getSemanticDiagnostics("/main.ts"), []);

  // Switch to the non-HOK profile: region becomes a number, so assigning it to a
  // string annotation is now an error. The version change drives reprojection.
  active = { definitions: { HOK: false }, version: "DOMESTIC:1" };
  controller.reload();
  const afterSwitch = service.getSemanticDiagnostics("/main.ts");
  assert.equal(afterSwitch.length >= 1, true);
  assert.match(
    afterSwitch.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"),
    /not assignable to type 'string'/,
  );
});
