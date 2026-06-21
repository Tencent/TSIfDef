import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import type { MacroDefinitions } from "../core/expression.js";
import { emitProject, EmitDiagnosticsError, type EmitResult } from "./emit.js";

/** Per-Profile build configuration loaded from `Build/macros/pipeline.json`. */
export interface ProfilePipelineEntry {
  readonly profile: string;
  /** tsconfig used to typecheck this Profile's projected tree, relative to root. */
  readonly tsconfig: string;
  /** Declaration directories that must exist for this Profile to typecheck. */
  readonly requireDeclarations?: readonly string[];
}

export interface PipelineConfig {
  readonly profiles: readonly ProfilePipelineEntry[];
}

/** Outcome of typechecking one projected tree. */
export interface TypecheckResult {
  readonly errors: readonly string[];
}

/** Typecheck one Profile's projected tree against its tsconfig. */
export type TypecheckRunner = (input: {
  readonly projectRoot: string;
  readonly tsconfigPath: string;
  readonly profile: string;
}) => Promise<TypecheckResult>;

/** Report whether a required declaration directory exists. */
export type DirectoryProbe = (path: string) => Promise<boolean>;

export type ProfilePipelineStatus =
  | "passed"
  | "macro-diagnostics"
  | "type-errors"
  | "skipped-missing-declarations";

export interface ProfilePipelineResult {
  readonly profile: string;
  readonly status: ProfilePipelineStatus;
  /** Files projected when emit ran; absent when the Profile was skipped early. */
  readonly emittedFiles?: number;
  /** Declaration directories that were required but missing, when skipped. */
  readonly missingDeclarations?: readonly string[];
  /** Macro or type diagnostic messages, when the status reflects diagnostics. */
  readonly diagnostics?: readonly string[];
}

export interface RunProfilePipelineOptions {
  readonly projectRoot: string;
  readonly sourceRoot?: string;
  readonly entries: readonly ProfilePipelineEntry[];
  readonly definitionsFor: (profile: string) => Promise<MacroDefinitions>;
  readonly typecheck: TypecheckRunner;
  readonly directoryExists?: DirectoryProbe;
}

/**
 * Emit and typecheck each Profile in turn.
 *
 * Each Profile is projected with the shared `emitProject`, then typechecked
 * against its own `tsconfig` and declarations. A macro diagnostic stops before
 * typecheck and preserves emit's existing output behavior. A Profile whose
 * required declaration directories are absent is reported as a skippable
 * configuration status rather than failing the run, matching workspaces that
 * carry only one region's declarations.
 */
export async function runProfilePipeline(
  options: RunProfilePipelineOptions,
): Promise<readonly ProfilePipelineResult[]> {
  const projectRoot = resolve(options.projectRoot);
  const directoryExists = options.directoryExists ?? defaultDirectoryExists;
  const results: ProfilePipelineResult[] = [];

  for (const entry of options.entries) {
    const missing = await missingDeclarationDirs(projectRoot, entry, directoryExists);
    if (missing.length > 0) {
      results.push({
        profile: entry.profile,
        status: "skipped-missing-declarations",
        missingDeclarations: missing,
      });
      continue;
    }

    const definitions = await options.definitionsFor(entry.profile);
    let emitResult: EmitResult;
    try {
      emitResult = await emitProject({
        projectRoot,
        ...(options.sourceRoot === undefined ? {} : { sourceRoot: options.sourceRoot }),
        profileName: entry.profile,
        definitions,
      });
    } catch (error) {
      if (error instanceof EmitDiagnosticsError) {
        results.push({
          profile: entry.profile,
          status: "macro-diagnostics",
          diagnostics: error.files.flatMap((file) =>
            file.diagnostics.map((diagnostic) => `${file.file}: ${diagnostic.message}`),
          ),
        });
        continue;
      }
      throw error;
    }

    const typecheck = await options.typecheck({
      projectRoot,
      tsconfigPath: resolvePath(projectRoot, entry.tsconfig),
      profile: entry.profile,
    });
    results.push({
      profile: entry.profile,
      status: typecheck.errors.length > 0 ? "type-errors" : "passed",
      emittedFiles: emitResult.files.length,
      ...(typecheck.errors.length > 0 ? { diagnostics: typecheck.errors } : {}),
    });
  }

  return results;
}

/** Load and validate `Build/macros/pipeline.json`. */
export async function loadPipelineConfig(projectRoot: string): Promise<PipelineConfig> {
  const path = join(resolve(projectRoot), "Build", "macros", "pipeline.json");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot read pipeline config '${path}'.`, { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, "")) as unknown;
  } catch (error) {
    throw new Error(`Pipeline config '${path}' is not valid JSON.`, { cause: error });
  }
  const profiles = (value as { profiles?: unknown } | null)?.profiles;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error(`Pipeline config '${path}' must list at least one profile.`);
  }
  return {
    profiles: profiles.map((entry) => normalizeEntry(entry, path)),
  };
}

function normalizeEntry(entry: unknown, path: string): ProfilePipelineEntry {
  if (entry === null || typeof entry !== "object") {
    throw new Error(`Pipeline config '${path}' has a non-object profile entry.`);
  }
  const record = entry as Record<string, unknown>;
  if (typeof record.profile !== "string" || record.profile.trim() === "") {
    throw new Error(`Pipeline config '${path}' has a profile entry without a name.`);
  }
  if (typeof record.tsconfig !== "string" || record.tsconfig.trim() === "") {
    throw new Error(`Pipeline profile '${record.profile}' is missing a tsconfig.`);
  }
  const requireDeclarations = record.requireDeclarations;
  if (
    requireDeclarations !== undefined &&
    (!Array.isArray(requireDeclarations) ||
      requireDeclarations.some((item) => typeof item !== "string"))
  ) {
    throw new Error(
      `Pipeline profile '${record.profile}' has an invalid requireDeclarations list.`,
    );
  }
  return {
    profile: record.profile,
    tsconfig: record.tsconfig,
    ...(requireDeclarations === undefined
      ? {}
      : { requireDeclarations: requireDeclarations as readonly string[] }),
  };
}

async function missingDeclarationDirs(
  projectRoot: string,
  entry: ProfilePipelineEntry,
  directoryExists: DirectoryProbe,
): Promise<readonly string[]> {
  const required = entry.requireDeclarations ?? [];
  const missing: string[] = [];
  for (const dir of required) {
    if (!(await directoryExists(resolvePath(projectRoot, dir)))) {
      missing.push(dir);
    }
  }
  return missing;
}

function resolvePath(projectRoot: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : join(projectRoot, candidate);
}

async function defaultDirectoryExists(path: string): Promise<boolean> {
  const { stat } = await import("node:fs/promises");
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
