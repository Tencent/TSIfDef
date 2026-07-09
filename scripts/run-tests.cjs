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

const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const testRoot = join(process.cwd(), ".test-dist", "test");

function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findTests(path);
    }
    return entry.name.endsWith(".test.js") ? [path] : [];
  });
}

const testFiles = findTests(testRoot);
if (testFiles.length === 0) {
  console.error(`No compiled tests found under ${testRoot}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
