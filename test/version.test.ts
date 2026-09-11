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
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { VERSION } from "../src/version.js";

test("generated runtime package versions follow root package.json", async () => {
  const rootPackage = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
    version?: unknown;
  };
  const tsserverPackage = JSON.parse(
    await readFile(resolve("scripts", "packaging", "tsserver", "package.json"), "utf8"),
  ) as { version?: unknown };
  const packageLock = JSON.parse(await readFile(resolve("package-lock.json"), "utf8")) as {
    version?: unknown;
    packages?: Record<string, { version?: unknown } | undefined>;
  };

  assert.equal(VERSION, rootPackage.version);
  assert.equal(tsserverPackage.version, rootPackage.version);
  assert.equal(packageLock.version, rootPackage.version);
  assert.equal(packageLock.packages?.[""]?.version, rootPackage.version);
  assert.equal(packageLock.packages?.["scripts/packaging/tsserver"]?.version, rootPackage.version);
});

test("demo package advertises the modern projected build path", async () => {
  const demoPackage = JSON.parse(
    await readFile(resolve("examples", "demo", "package.json"), "utf8"),
  ) as { scripts?: Record<string, unknown> };

  assert.match(String(demoPackage.scripts?.build), /^tsifdef build\b/);
  assert.match(String(demoPackage.scripts?.watch), /^tsifdef build --watch\b/);
  assert.equal(Object.prototype.hasOwnProperty.call(demoPackage.scripts ?? {}, "precompile"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(demoPackage.scripts ?? {}, "legacy:compile"), true);
});
