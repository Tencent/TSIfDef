const { mkdirSync, writeFileSync, copyFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

// tsserver loads a workspace plugin by resolving it as a node module named after
// the `typescriptServerPlugins` entry ("tsifdef-tsserver"). It therefore must live
// at `<extension>/node_modules/tsifdef-tsserver/`. vsce does not create that layout
// from the `tsserver-package/` template on its own, so materialize it here before
// packaging. `.vscodeignore` whitelists `node_modules/tsifdef-tsserver/**`.
const root = resolve(__dirname, "..");
const template = join(root, "tsserver-package", "package.json");
const targetDir = join(root, "node_modules", "tsifdef-tsserver");
const targetPkg = join(targetDir, "package.json");

if (!existsSync(template)) {
  throw new Error(`Missing tsserver plugin template at ${template}.`);
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
