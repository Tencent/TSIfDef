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
