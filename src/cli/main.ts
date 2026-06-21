#!/usr/bin/env node
import { resolve } from "node:path";

import { checkProject, loadAllProfiles, type CheckProfile } from "./check.js";
import { assertEmitProfileName, emitProject, EmitDiagnosticsError } from "./emit.js";
import { loadPipelineConfig, runProfilePipeline } from "./pipeline.js";
import { tscTypecheckRunner } from "./tsc-runner.js";
import { loadProfileFile, selectProfile } from "./profile.js";
import { watchProfile } from "./watch.js";

export const CliExitCode = {
  success: 0,
  diagnostics: 1,
  failure: 2,
} as const;

export async function runCli(args: readonly string[], cwd = process.cwd()): Promise<number> {
  try {
    const command = args[0];
    if (command !== "emit" && command !== "check" && command !== "watch" && command !== "pipeline") {
      throw new Error("Usage: tsifdef <emit|check|watch|pipeline> [options]");
    }
    const values = parseOptions(args.slice(1), command);
    const projectRoot = resolve(cwd, values.root ?? ".");
    if (command === "pipeline") {
      return await runPipelineCommand(values, projectRoot);
    }
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
    const profilePath = profilePathFor(projectRoot, selected.profile);
    const macroConfigVersion = values["config-version"] ?? "1";
    if (command === "watch") {
      await watchProfile({
        projectRoot,
        ...(values.source === undefined ? {} : { sourceRoot: values.source }),
        profileName: selected.profile,
        profilePath,
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
    const definitions = await loadProfileFile(profilePath);
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

async function runPipelineCommand(
  values: Readonly<Record<string, string | undefined>>,
  projectRoot: string,
): Promise<number> {
  const config = await loadPipelineConfig(projectRoot);
  const results = await runProfilePipeline({
    projectRoot,
    ...(values.source === undefined ? {} : { sourceRoot: values.source }),
    entries: config.profiles,
    definitionsFor: (profile) => loadProfileFile(profilePathFor(projectRoot, profile)),
    typecheck: tscTypecheckRunner,
  });

  let hasDiagnostics = false;
  for (const result of results) {
    if (result.status === "passed") {
      process.stdout.write(`[${result.profile}] passed (${result.emittedFiles ?? 0} file(s)).\n`);
    } else if (result.status === "skipped-missing-declarations") {
      process.stdout.write(
        `[${result.profile}] skipped: missing declarations ${(result.missingDeclarations ?? []).join(", ")}.\n`,
      );
    } else {
      hasDiagnostics = true;
      const label = result.status === "macro-diagnostics" ? "macro diagnostics" : "type errors";
      process.stderr.write(`[${result.profile}] ${label}:\n`);
      for (const diagnostic of result.diagnostics ?? []) {
        process.stderr.write(`  ${diagnostic}\n`);
      }
    }
  }
  return hasDiagnostics ? CliExitCode.diagnostics : CliExitCode.success;
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
    definitions: await loadProfileFile(profilePathFor(projectRoot, selected.profile)),
  }];
}

function profilePathFor(projectRoot: string, profile: string): string {
  return resolve(projectRoot, "Build", "macros", `${profile.toLowerCase()}.json`);
}

function parseOptions(
  args: readonly string[],
  command: "emit" | "check" | "watch" | "pipeline",
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
