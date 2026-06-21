#!/usr/bin/env node
import { resolve } from "node:path";

import { assertEmitProfileName, emitProject, EmitDiagnosticsError } from "./emit.js";
import { loadProfileFile, selectProfile } from "./profile.js";

export async function runCli(args: readonly string[], cwd = process.cwd()): Promise<number> {
  try {
    if (args[0] !== "emit") {
      throw new Error("Usage: tsifdef emit --profile <PROFILE> [--root <path>] [--source <path>]");
    }
    const values = parseOptions(args.slice(1));
    const selected = selectProfile({
      ...(values.profile === undefined ? {} : { cliProfile: values.profile }),
      environment: process.env,
    });
    assertEmitProfileName(selected.profile);
    const projectRoot = resolve(cwd, values.root ?? ".");
    const profilePath = resolve(
      projectRoot,
      "Build",
      "macros",
      `${selected.profile.toLowerCase()}.json`,
    );
    const definitions = await loadProfileFile(profilePath);
    const result = await emitProject({
      projectRoot,
      ...(values.source === undefined ? {} : { sourceRoot: values.source }),
      profileName: selected.profile,
      definitions,
    });
    process.stdout.write(`Emitted ${result.files.length} file(s) to ${result.outputRoot}\n`);
    return 0;
  } catch (error) {
    if (error instanceof EmitDiagnosticsError) {
      for (const file of error.files) {
        for (const diagnostic of file.diagnostics) {
          process.stderr.write(`${file.file}:${diagnostic.range.start}: ${diagnostic.message}\n`);
        }
      }
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    return 1;
  }
}

function parseOptions(args: readonly string[]): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (let offset = 0; offset < args.length; offset += 2) {
    const option = args[offset];
    const value = args[offset + 1];
    if (option === undefined || !["--profile", "--root", "--source"].includes(option) || value === undefined) {
      throw new Error(`Invalid emit option '${option ?? ""}'.`);
    }
    values[option.slice(2)] = value;
  }
  return values;
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
