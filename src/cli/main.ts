#!/usr/bin/env node
import { resolve } from "node:path";

import { checkProject, loadAllProfiles, type CheckProfile } from "./check.js";
import { loadTsIfDefConfig, profileFromConfig, tsIfDefConfigFileName } from "./config.js";
import { assertEmitProfileName, emitProject, EmitDiagnosticsError } from "./emit.js";
import { runTypeScriptBuild } from "./tsc-build.js";
import { selectProfile } from "./profile.js";
import { watchProfile } from "./watch.js";

export const CliExitCode = {
  success: 0,
  diagnostics: 1,
  failure: 2,
} as const;

export async function runCli(args: readonly string[], cwd = process.cwd()): Promise<number> {
  try {
    const command = args[0];
    if (command === "tsc") {
      return await runTscCommand(args.slice(1), cwd);
    }
    if (command !== "emit" && command !== "check" && command !== "watch") {
      throw new Error("Usage: tsifdef <emit|check|watch|tsc> [options]");
    }
    const values = parseOptions(args.slice(1), command);
    const projectRoot = resolve(cwd, values.root ?? ".");
    if (command === "check") {
      const profiles = await resolveCheckProfiles(values, projectRoot);
      const diagnostics = await checkProject({
        projectRoot,
        ...(values.source === undefined ? {} : { sourceRoot: values.source }),
        profiles,
      });
      for (const diagnostic of diagnostics) {
        process.stderr.write(
          `[${diagnostic.profile}] ${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code}: ${diagnostic.message}\n`,
        );
      }
      if (diagnostics.length > 0) {
        return CliExitCode.diagnostics;
      }
      process.stdout.write(`Checked ${profiles.length} profile(s) with no macro diagnostics.\n`);
      return CliExitCode.success;
    }

    if (values.all === "true") {
      throw new Error(`The ${command} command does not support --all.`);
    }
    const selected = selectProfile({
      ...(values.profile === undefined ? {} : { cliProfile: values.profile }),
      environment: process.env,
    });
    assertEmitProfileName(selected.profile);
    const configPath = configPathFor(projectRoot);
    const macroConfigVersion = values["config-version"] ?? "1";
    if (command === "watch") {
      await watchProfile({
        projectRoot,
        ...(values.source === undefined ? {} : { sourceRoot: values.source }),
        profileName: selected.profile,
        configPath,
        macroConfigVersion,
        onResult: (error, result) => {
          if (error !== undefined) {
            process.stderr.write(`Watch rebuild failed: ${error instanceof Error ? error.message : String(error)}\n`);
          } else if (result !== undefined) {
            process.stdout.write(`Emitted ${result.files.length} file(s), ${result.cacheHits} cache hit(s).\n`);
          }
        },
      });
      process.stdout.write(`Watching ${selected.profile}.\n`);
      return CliExitCode.success;
    }
    const definitions = profileFromConfig(
      await loadTsIfDefConfig(projectRoot),
      selected.profile,
    ).definitions;
    const result = await emitProject({
      projectRoot,
      ...(values.source === undefined ? {} : { sourceRoot: values.source }),
      profileName: selected.profile,
      definitions,
    });
    process.stdout.write(`Emitted ${result.files.length} file(s) to ${result.outputRoot}\n`);
    return CliExitCode.success;
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
    return error instanceof EmitDiagnosticsError
      ? CliExitCode.diagnostics
      : CliExitCode.failure;
  }
}

async function runTscCommand(args: readonly string[], cwd: string): Promise<number> {
  const separator = args.indexOf("--");
  if (separator < 0) {
    throw new Error("Usage: tsifdef tsc --profile <PROFILE> -- <tsc options>");
  }
  const values = parseTscWrapperOptions(args.slice(0, separator));
  const projectRoot = resolve(cwd, values.root ?? ".");
  const selected = selectProfile({
    ...(values.profile === undefined ? {} : { cliProfile: values.profile }),
    environment: process.env,
  });
  const definitions = profileFromConfig(
    await loadTsIfDefConfig(projectRoot),
    selected.profile,
  ).definitions;
  const result = await runTypeScriptBuild({
    cwd,
    args: args.slice(separator + 1),
    definitions,
  });
  for (const error of result.errors) {
    process.stderr.write(`${error}\n`);
  }
  return result.errors.length === 0 ? CliExitCode.success : CliExitCode.diagnostics;
}

function parseTscWrapperOptions(args: readonly string[]): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if ((option !== "--profile" && option !== "--root") || value === undefined) {
      throw new Error(`Invalid tsc wrapper option '${option ?? ""}'.`);
    }
    values[option.slice(2)] = value;
  }
  return values;
}

async function resolveCheckProfiles(
  values: Readonly<Record<string, string | undefined>>,
  projectRoot: string,
): Promise<readonly CheckProfile[]> {
  const all = values.all === "true";
  if (all && values.profile !== undefined) {
    throw new Error("check --all and --profile are mutually exclusive.");
  }
  if (all) {
    return loadAllProfiles(projectRoot);
  }
  const selected = selectProfile({
    ...(values.profile === undefined ? {} : { cliProfile: values.profile }),
    environment: process.env,
  });
  assertEmitProfileName(selected.profile);
  return [{
    name: selected.profile,
    definitions: profileFromConfig(
      await loadTsIfDefConfig(projectRoot),
      selected.profile,
    ).definitions,
  }];
}

function configPathFor(projectRoot: string): string {
  return resolve(projectRoot, tsIfDefConfigFileName);
}

function parseOptions(
  args: readonly string[],
  command: "emit" | "check" | "watch",
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  const valueOptions = command === "watch"
    ? ["--profile", "--root", "--source", "--config-version"]
    : ["--profile", "--root", "--source"];
  for (let offset = 0; offset < args.length; offset += 1) {
    const option = args[offset];
    if (option === "--all" && command === "check") {
      values.all = "true";
      continue;
    }
    const value = args[offset + 1];
    if (option === undefined || !valueOptions.includes(option) || value === undefined || value.startsWith("--")) {
      throw new Error(`Invalid option '${option ?? ""}'.`);
    }
    values[option.slice(2)] = value;
    offset += 1;
  }
  return values;
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
