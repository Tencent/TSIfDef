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

const {
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  rmSync,
  unlinkSync,
} = require("node:fs");
const { join, resolve } = require("node:path");

// tsserver loads a workspace plugin by resolving it as a node module named after
// the `typescriptServerPlugins` entry ("tsifdef-tsserver"). It therefore must live
// at `<extension>/node_modules/tsifdef-tsserver/`. vsce does not create that layout
// from the packaging template on its own, so materialize it here before
// packaging. The release script adds the generated shim to the final VSIX.
const root = resolve(__dirname, "..");
const template = join(root, "scripts", "packaging", "tsserver", "package.json");
const targetDir = join(root, "node_modules", "tsifdef-tsserver");
const targetPkg = join(targetDir, "package.json");

if (!existsSync(template)) {
  throw new Error(`Missing tsserver plugin template at ${template}.`);
}

// npm installs the local development dependency as a junction. VSIX packaging
// does not follow that junction, so replace it with a real two-file directory
// before packaging. The directory is generated and ignored by Git.
if (existsSync(targetDir)) {
  if (lstatSync(targetDir).isSymbolicLink()) {
    unlinkSync(targetDir);
  } else {
    rmSync(targetDir, { recursive: true, force: true });
  }
}
mkdirSync(targetDir, { recursive: true });
copyFileSync(template, targetPkg);
// Also drop a thin index in case a resolver ignores "main"; both point at the
// compiled plugin under the extension's dist.
writeFileSync(
  join(targetDir, "index.js"),
  'module.exports = require("../../dist/tsserver/plugin.js");\n',
  "utf8",
);
process.stdout.write(`Prepared tsserver plugin shim at ${targetPkg}\n`);
