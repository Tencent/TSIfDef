#!/usr/bin/env node
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

import { resolve } from "node:path";

import {
  buildProject,
  BuildMacroDiagnosticsError,
  BuildUnsupportedError,
  parseTscOverride,
} from "./build.js";
import { loadProfileFile, loadProjectConfiguration } from "./config.js";
import { precompileProject, PrecompileDiagnosticsError } from "./precompile.js";
import { watchProject } from "./watch.js";

export const CliExitCode = {
  success: 0,
  diagnostics: 1,
  failure: 2,
} as const;

/** Run the TSIfDef CLI: `build` for projected compilation, else legacy precompile. */
export async function runCli(args: readonly string[], cwd = process.cwd()): Promise<number> {
  if (args[0] === "build") {
    return runBuild(args.slice(1), cwd);
  }
  return runPrecompile(args, cwd);
}

/**
 * `tsifdef build [--watch] [--emit-projection <dir>] [-p <tsconfig>] [-- <tsc flags>]`.
 * Flags after `--` are parsed as tsc compiler-option overrides (e.g.
 * `-- --module commonjs --outDir dist`), mirroring how a build pipeline would
 * pass per-invocation options to `tsc`.
 */
async function runBuild(args: readonly string[], cwd: string): Promise<number> {
  const separatorIndex = args.indexOf("--");
  const ownArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const overrideArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];
  const watch = ownArgs.includes("--watch");
  let emitProjectionDir: string | undefined;
  const rest: string[] = [];
  for (let index = 0; index < ownArgs.length; index += 1) {
    const arg = ownArgs[index]!;
    if (arg === "--watch") continue;
    if (arg === "--emit-projection") {
      const value = ownArgs[index + 1];
      if (value === undefined || value.trim() === "") {
        process.stderr.write("Usage: tsifdef build [--emit-projection <dir>]\n");
        return CliExitCode.failure;
      }
      emitProjectionDir = resolve(cwd, value);
      index += 1;
      continue;
    }
    rest.push(arg);
  }
  try {
    const project = parseProjectOption(rest, "Usage: tsifdef build [--watch] [--emit-projection <dir>] [-p <tsconfig>] [-- <tsc flags>]");
    const compilerOptionsOverride = await parseTscOverride(overrideArgs, cwd);
    const projectRoot = resolve(cwd);
    const configuration = await loadProjectConfiguration(projectRoot);
    const profile = await loadProfileFile(configuration.profilePath);
    if (watch) {
      await watchProject({
        projectRoot,
        project: project ?? "tsconfig.json",
        profilePath: configuration.profilePath,
        compilerOptionsOverride,
        ...(emitProjectionDir === undefined ? {} : { emitProjectionDir }),
        onBuild: (info) => {
          process.stdout.write(
            info.hasErrors
              ? `Rebuilt with errors (${info.macroDiagnostics.size} macro issue(s)).\n`
              : `Rebuilt ${info.outputFiles.length} file(s).\n`,
          );
        },
        onProfileReload: (reloaded) => {
          process.stdout.write(`Profile changed to ${reloaded.fileName}; rebuilding.\n`);
        },
      });
      // Watch mode runs until the process is terminated.
      return await new Promise<number>(() => {});
    }
    const result = await buildProject({
      projectRoot,
      project: project ?? "tsconfig.json",
      profile,
      compilerOptionsOverride,
      ...(emitProjectionDir === undefined ? {} : { emitProjectionDir }),
    });
    if (result.hasErrors) {
      return CliExitCode.diagnostics;
    }
    process.stdout.write(
      `Built ${result.outputFiles.length} file(s) with ${profile.fileName}.\n`,
    );
    return CliExitCode.success;
  } catch (error) {
    if (error instanceof BuildMacroDiagnosticsError) {
      for (const file of error.files) {
        for (const diagnostic of file.diagnostics) {
          process.stderr.write(`${file.file}:${diagnostic.range.start}: ${diagnostic.message}\n`);
        }
      }
      return CliExitCode.diagnostics;
    }
    if (error instanceof BuildUnsupportedError) {
      process.stderr.write(`${error.message}\n`);
      return CliExitCode.failure;
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return CliExitCode.failure;
  }
}

/** Legacy `tsifdef [--project <tsconfig>]`: emit the auditable projected project. */
async function runPrecompile(args: readonly string[], cwd: string): Promise<number> {
  try {
    const project = parseProjectOption(args, "Usage: tsifdef [--project <tsconfig>]");
    const projectRoot = resolve(cwd);
    const configuration = await loadProjectConfiguration(projectRoot);
    const profile = await loadProfileFile(configuration.profilePath);
    const result = await precompileProject({
      projectRoot,
      project: project ?? "tsconfig.json",
      profile,
    });
    process.stdout.write(
      `Precompiled ${result.manifest.files.length} file(s) with ${profile.fileName} to ${result.outputRoot}\n`,
    );
    return CliExitCode.success;
  } catch (error) {
    if (error instanceof PrecompileDiagnosticsError) {
      for (const file of error.files) {
        for (const diagnostic of file.diagnostics) {
          process.stderr.write(`${file.file}:${diagnostic.range.start}: ${diagnostic.message}\n`);
        }
      }
      return CliExitCode.diagnostics;
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return CliExitCode.failure;
  }
}

/** Accept both `--project <path>` and `-p <path>`; otherwise no override. */
function parseProjectOption(args: readonly string[], usage: string): string | undefined {
  if (args.length === 0) return undefined;
  if (
    args.length === 2 &&
    (args[0] === "--project" || args[0] === "-p") &&
    args[1] !== undefined &&
    args[1].trim() !== ""
  ) {
    return args[1];
  }
  throw new Error(usage);
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
