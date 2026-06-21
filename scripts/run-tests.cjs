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
