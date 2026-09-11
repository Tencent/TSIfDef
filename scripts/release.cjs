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

const { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const yauzl = require("yauzl");
const yazl = require("yazl");

const root = resolve(__dirname, "..");
const releaseDir = join(root, "release");
const packageJsonPath = join(root, "package.json");
const tsserverShimRoot = join(root, "node_modules", "tsifdef-tsserver");
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

function assertPackageVersion(path, expectedVersion, label) {
  assertExists(path, label);
  const manifest = parseJson(readFileSync(path, "utf8"), path);
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `${label} version '${String(manifest.version)}' does not match '${expectedVersion}'.`,
    );
  }
}

function appendTsserverShim(vsixPath, packageJson) {
  const temporaryPath = `${vsixPath}.new`;
  const manifestEntry = "extension/node_modules/tsifdef-tsserver/package.json";
  const indexEntry = "extension/node_modules/tsifdef-tsserver/index.js";
  const shimEntries = new Set([manifestEntry, indexEntry]);
  const manifestPath = join(tsserverShimRoot, "package.json");
  const entryPath = join(tsserverShimRoot, "index.js");
  assertPackageVersion(
    manifestPath,
    packageJson.version,
    "generated tsserver plugin shim manifest",
  );
  assertExists(entryPath, "generated tsserver plugin shim entry");
  const manifest = readFileSync(manifestPath);
  const entry = readFileSync(entryPath);

  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(vsixPath, { lazyEntries: true }, (openError, input) => {
      if (openError || input === undefined) {
        rejectPromise(openError ?? new Error(`Cannot open ${vsixPath}`));
        return;
      }

      const output = new yazl.ZipFile();
      const outputStream = require("node:fs").createWriteStream(temporaryPath);
      output.outputStream.pipe(outputStream);
      let failed = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        input.close();
        output.end();
        outputStream.destroy();
        rejectPromise(error);
      };

      outputStream.on("error", fail);
      outputStream.on("close", () => {
        if (failed) return;
        rmSync(vsixPath, { force: true });
        require("node:fs").renameSync(temporaryPath, vsixPath);
        resolvePromise();
      });

      input.on("error", fail);
      input.on("entry", (zipEntry) => {
        if (shimEntries.has(zipEntry.fileName)) {
          input.readEntry();
          return;
        }
        input.openReadStream(zipEntry, (streamError, stream) => {
          if (streamError || stream === undefined) {
            fail(streamError ?? new Error(`Cannot read ${zipEntry.fileName}`));
            return;
          }
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            output.addBuffer(Buffer.concat(chunks), zipEntry.fileName, {
              compress: zipEntry.compressionMethod !== 0,
              mtime: zipEntry.getLastModDate(),
              mode: zipEntry.externalFileAttributes >>> 16,
            });
            input.readEntry();
          });
          stream.on("error", fail);
        });
      });
      input.on("end", () => {
        output.addBuffer(
          manifest,
          manifestEntry,
        );
        output.addBuffer(
          entry,
          indexEntry,
        );
        output.end();
      });

      input.readEntry();
    });
  });
}

async function verifyInstalledVsix(vsixPath, packageJson) {
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
  const shimRoot = join(installedRoot, "node_modules", "tsifdef-tsserver");
  const shimManifest = join(shimRoot, "package.json");
  const shimEntry = join(shimRoot, "index.js");
  assertPackageVersion(
    shimManifest,
    packageJson.version,
    "VSIX tsserver plugin shim manifest",
  );
  assertExists(shimEntry, "VSIX tsserver plugin shim entry");
  const shimFiles = readdirSync(shimRoot).sort();
  if (JSON.stringify(shimFiles) !== JSON.stringify(["index.js", "package.json"])) {
    throw new Error(
      `VSIX tsserver plugin shim must contain only index.js and package.json; found ${shimFiles.join(", ")}`,
    );
  }
  if (typeof require(shimEntry) !== "function") {
    throw new Error("VSIX tsserver plugin shim does not load the packaged plugin.");
  }
  const packagedModules = readdirSync(join(installedRoot, "node_modules")).sort();
  if (JSON.stringify(packagedModules) !== JSON.stringify(["tsifdef-tsserver"])) {
    throw new Error(
      `VSIX must not contain extra node_modules dependencies; found ${packagedModules.join(", ")}`,
    );
  }
}

function verifyInstalledTgz(tgzPath, packageJson) {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "tsifdef-tgz-"));
  const projectRoot = join(tempRoot, "project");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({
      name: "tsifdef-smoke",
      private: true,
      tsifdef: "./Profile.json",
      devDependencies: {
        "@typescript-eslint/parser": "5.62.0",
        eslint: "8.57.1",
        "eslint-plugin-tsifdef": `file:${tgzPath.replaceAll("\\", "/")}`,
        typescript: "5.5.4",
      },
    }, null, 2),
    "utf8",
  );
  writeFileSync(join(projectRoot, "Profile.json"), '["BROWSER"]\n', "utf8");
  writeFileSync(
    join(projectRoot, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "Node16", moduleResolution: "Node16" }, include: ["src/**/*.ts"] }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(projectRoot, ".eslintrc.json"),
    JSON.stringify({
      parser: "@typescript-eslint/parser",
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      plugins: ["tsifdef"],
      overrides: [
        {
          files: ["*.ts"],
          processor: "tsifdef/macros",
        },
      ],
      rules: {
        "no-unused-vars": "error",
      },
    }, null, 2),
    "utf8",
  );
  writeFileSync(join(projectRoot, "src", "main.ts"), "const value = 1;\n", "utf8");

  run(process.execPath, [
    npmCli,
    "install",
    "--ignore-scripts",
  ], { cwd: projectRoot });

  const binPath = process.platform === "win32"
    ? join(projectRoot, "node_modules", ".bin", "tsifdef.cmd")
    : join(projectRoot, "node_modules", ".bin", "tsifdef");
  assertExists(binPath, "tgz CLI shim");

  const installedPackageRoot = join(projectRoot, "node_modules", "eslint-plugin-tsifdef");
  run(process.execPath, [join(installedPackageRoot, "dist", "cli", "main.js")], {
    cwd: projectRoot,
  });

  assertExists(join(projectRoot, ".tsifdef", "Output", "tsconfig.json"), "precompile output");
  assertExists(join(installedPackageRoot, "dist", "cli", "main.js"), "installed CLI entry");
  assertPackageVersion(
    join(installedPackageRoot, "package.json"),
    packageJson.version,
    "installed package manifest",
  );
  const projectRequire = require("node:module").createRequire(join(projectRoot, "package.json"));
  const eslintPlugin = projectRequire("eslint-plugin-tsifdef");
  if (typeof eslintPlugin?.processors?.macros !== "object") {
    throw new Error("Installed package does not expose the macros processor.");
  }
  if (eslintPlugin.coreApiVersion !== 1) {
    throw new Error("Installed package root does not preserve the core API.");
  }
  const eslintParser = projectRequire("eslint-plugin-tsifdef/parser");
  if (typeof eslintParser?.parseForESLint !== "function") {
    throw new Error("Installed package does not expose the TSIfDef parser wrapper.");
  }
  const macroSourcePath = join(projectRoot, "src", "macro.ts");
  writeFileSync(macroSourcePath, "#if BROWSER\nexport const active = 1;\n#endif\n", "utf8");
  const parsed = eslintParser.parseForESLint(readFileSync(macroSourcePath, "utf8"), {
    filePath: macroSourcePath,
    ecmaVersion: 2022,
    sourceType: "module",
  });
  if (parsed?.ast?.type !== "Program") {
    throw new Error("Installed ESLint parser wrapper did not parse projected macro source.");
  }
  writeFileSync(
    macroSourcePath,
    "#if BROWSER\nconst unused = 1;\n#else\nconst hidden = 2;\n#endif\n",
    "utf8",
  );
  const eslintPath = join(projectRoot, "node_modules", "eslint", "bin", "eslint.js");
  const lintResult = spawnSync(
    process.execPath,
    [eslintPath, macroSourcePath, "--format", "json"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      shell: false,
    },
  );
  if (lintResult.error) {
    throw lintResult.error;
  }
  if (lintResult.status !== 1) {
    throw new Error(
      `Installed ESLint integration exited with ${String(lintResult.status)}:\n${lintResult.stderr}`,
    );
  }
  const lintReports = parseJson(lintResult.stdout, "installed ESLint smoke output");
  const messages = lintReports?.[0]?.messages;
  if (
    !Array.isArray(messages)
    || !messages.some(
      (message) => message.ruleId === "no-unused-vars" && message.line === 2,
    )
  ) {
    throw new Error("Installed package did not lint projected macro source through its processor.");
  }
}

async function main() {
  const releaseArguments = process.argv.slice(2);
  const supportedArguments = new Set(["--skip-vsix-install", "--vsix-only"]);
  const unsupportedArgument = releaseArguments.find((argument) => !supportedArguments.has(argument));
  if (unsupportedArgument !== undefined) {
    throw new Error(`Unsupported release argument '${unsupportedArgument}'.`);
  }
  const skipVsixInstall = releaseArguments.includes("--skip-vsix-install");
  const vsixOnly = releaseArguments.includes("--vsix-only");

  // Explorer, antivirus, and extension installers can briefly retain handles
  // after inspecting a VSIX. Let Node retry transient Windows EPERM/EBUSY
  // failures instead of making an otherwise valid release flaky.
  rmSync(releaseDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  mkdirSync(releaseDir, { recursive: true });

  if (npmCli === undefined) {
    throw new Error("npm_execpath is unavailable; run release through npm.");
  }
  const npm = [process.execPath, npmCli];

  const packageJson = parseJson(readFileSync(packageJsonPath, "utf8"), "package.json");
  const vsixName = `${packageJson.name}-${packageJson.version}.vsix`;
  const vsixPath = join(releaseDir, vsixName);

  // `vsce package` runs vscode:prepublish, which performs the clean build used
  // by the VSIX and, during a full release, the npm tarball.
  run(npm[0], [
    npm[1],
    "exec",
    "--",
    "vsce",
    "package",
    "--no-dependencies",
    "--out",
    vsixPath,
  ]);

  const { VERSION } = require(join(root, "dist", "version.js"));
  if (packageJson.version !== VERSION) {
    throw new Error(`package.json version '${packageJson.version}' does not match VERSION '${VERSION}'.`);
  }
  if (!vsixName.includes(VERSION)) {
    throw new Error(`VSIX name '${vsixName}' does not include version '${VERSION}'.`);
  }

  await appendTsserverShim(vsixPath, packageJson);
  if (vsixOnly) {
    if (!skipVsixInstall) await verifyInstalledVsix(vsixPath, packageJson);
    process.stdout.write(`VSIX artifact written to ${vsixPath}\n`);
    return;
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
  const tgzName = packed[0].filename;
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
  if (!skipVsixInstall) await verifyInstalledVsix(vsixPath, packageJson);
  verifyInstalledTgz(join(releaseDir, tgzName), packageJson);

  process.stdout.write(
    `Release artifacts written to ${releaseDir}\n${tgzName}\n${vsixName}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
