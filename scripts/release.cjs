const { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const releaseDir = join(root, "release");
const packageJsonPath = join(root, "package.json");
const npmCli = process.env.npm_execpath;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status ?? 1}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status ?? 1}`);
  }
  return (result.stdout ?? "").trim();
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function findPackageRoot(directory, packageName, packageVersion) {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findPackageRoot(path, packageName, packageVersion);
      if (nested !== undefined) return nested;
      continue;
    }
    if (entry.isFile() && entry.name === "package.json") {
      const json = parseJson(readFileSync(path, "utf8"), path);
      if (json?.name === packageName && json?.version === packageVersion) {
        return directory;
      }
    }
  }
  return undefined;
}

function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function verifyInstalledVsix(vsixPath, packageJson) {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "tsifdef-vsix-"));
  const extensionsDir = join(tempRoot, "extensions");
  const userDataDir = join(tempRoot, "user-data");
  mkdirSync(extensionsDir, { recursive: true });
  mkdirSync(userDataDir, { recursive: true });

  run("cmd.exe", [
    "/c",
    "code",
    "--install-extension",
    vsixPath,
    "--extensions-dir",
    extensionsDir,
    "--user-data-dir",
    userDataDir,
    "--force",
  ]);

  const installedRoot = findPackageRoot(extensionsDir, packageJson.name, packageJson.version);
  if (installedRoot === undefined) {
    throw new Error(`Installed VSIX '${vsixPath}' did not expose package ${packageJson.name}@${packageJson.version}.`);
  }
  assertExists(join(installedRoot, "dist", "vscode", "extension.js"), "VSIX extension entry");
  assertExists(join(installedRoot, "dist", "tsserver", "plugin.js"), "VSIX tsserver plugin");
  assertExists(join(installedRoot, "tsserver-package", "package.json"), "VSIX tsserver-package manifest");
}

function verifyInstalledTgz(tgzPath, packageJson) {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "tsifdef-tgz-"));
  const projectRoot = join(tempRoot, "project");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "tsifdef-smoke", private: true, tsifdef: "./Profile.json" }, null, 2),
    "utf8",
  );
  writeFileSync(join(projectRoot, "Profile.json"), '["HOK"]\n', "utf8");
  writeFileSync(
    join(projectRoot, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "Node16", moduleResolution: "Node16" }, include: ["src/**/*.ts"] }, null, 2),
    "utf8",
  );
  writeFileSync(join(projectRoot, "src", "main.ts"), "const value = 1;\n", "utf8");

  run(process.execPath, [npmCli, "install", "--no-save", tgzPath], { cwd: projectRoot });

  const binPath = process.platform === "win32"
    ? join(projectRoot, "node_modules", ".bin", "tsifdef.cmd")
    : join(projectRoot, "node_modules", ".bin", "tsifdef");
  assertExists(binPath, "tgz CLI shim");

  run(process.execPath, [join(projectRoot, "node_modules", packageJson.name, "dist", "cli", "main.js")], {
    cwd: projectRoot,
  });

  assertExists(join(projectRoot, ".tsifdef", "Output", "tsconfig.json"), "precompile output");
  assertExists(join(projectRoot, "node_modules", packageJson.name, "dist", "cli", "main.js"), "installed CLI entry");
}

function main() {
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  if (npmCli === undefined) {
    throw new Error("npm_execpath is unavailable; run release through npm.");
  }
  const npm = [process.execPath, npmCli];

  run(npm[0], [npm[1], "run", "build"]);

  const packageJson = parseJson(readFileSync(packageJsonPath, "utf8"), "package.json");
  const { VERSION } = require(join(root, "dist", "version.js"));
  if (packageJson.version !== VERSION) {
    throw new Error(`package.json version '${packageJson.version}' does not match VERSION '${VERSION}'.`);
  }
  const revision = runCapture("git", ["rev-parse", "HEAD"]);

  const packOutput = runCapture(npm[0], [
    npm[1],
    "pack",
    "--json",
    "--pack-destination",
    releaseDir,
  ]);
  const packed = parseJson(packOutput, "npm pack output");
  if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0]?.filename !== "string") {
    throw new Error("npm pack did not return a single tarball filename.");
  }

  run(npm[0], [npm[1], "exec", "--", "vsce", "package", "--out", releaseDir]);

  const tgzName = packed[0].filename;
  const vsixName = `${packageJson.name}-${VERSION}.vsix`;
  const manifest = {
    package: packageJson.name,
    version: VERSION,
    revision,
    artifacts: {
      tgz: tgzName,
      vsix: vsixName,
    },
  };

  writeFileSync(
    join(releaseDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  if (!tgzName.includes(packageJson.version)) {
    throw new Error(`Tarball name '${tgzName}' does not include version '${packageJson.version}'.`);
  }
  if (!vsixName.includes(VERSION)) {
    throw new Error(`VSIX name '${vsixName}' does not include version '${VERSION}'.`);
  }

  verifyInstalledVsix(join(releaseDir, vsixName), packageJson);
  verifyInstalledTgz(join(releaseDir, tgzName), packageJson);

  process.stdout.write(
    `Release artifacts written to ${releaseDir}\n${tgzName}\n${vsixName}\n`,
  );
}

main();
