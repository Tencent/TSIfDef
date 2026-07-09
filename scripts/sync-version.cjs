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

const { readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const versionPath = join(root, "src", "version.ts");
const packagePath = join(root, "package.json");
const lockPath = join(root, "package-lock.json");

function readVersion() {
  const text = readFileSync(versionPath, "utf8");
  const match = text.match(/export const VERSION = "([^"]+)";/);
  if (match === null) {
    throw new Error(`Could not read VERSION from ${versionPath}.`);
  }
  return match[1];
}

function parseJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const version = readVersion();

  const packageJson = parseJson(packagePath);
  if (packageJson.version !== version) {
    packageJson.version = version;
    writeJson(packagePath, packageJson);
  }

  if (require("node:fs").existsSync(lockPath)) {
    const lockJson = parseJson(lockPath);
    if (lockJson.version !== version) {
      lockJson.version = version;
    }
    if (lockJson.packages && lockJson.packages[""] && lockJson.packages[""].version !== version) {
      lockJson.packages[""].version = version;
    }
    writeJson(lockPath, lockJson);
  }
}

main();
