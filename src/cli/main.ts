#!/usr/bin/env node
import { resolve } from "node:path";

import { loadProfileFile, loadProjectConfiguration } from "./config.js";
import { precompileProject, PrecompileDiagnosticsError } from "./precompile.js";

export const CliExitCode = {
  success: 0,
  diagnostics: 1,
  failure: 2,
} as const;

/** Run the single TSIfDef product operation: create the conventional projected project. */
export async function runCli(args: readonly string[], cwd = process.cwd()): Promise<number> {
  try {
    const project = parseProjectOption(args);
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

function parseProjectOption(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 2 && args[0] === "--project" && args[1] !== undefined && args[1].trim() !== "") {
    return args[1];
  }
  throw new Error("Usage: tsifdef [--project <tsconfig>]");
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
