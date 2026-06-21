import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { projectSource, type MacroDiagnostic } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";

export interface EmitOptions {
  readonly projectRoot: string;
  readonly sourceRoot?: string;
  readonly profileName: string;
  readonly definitions: MacroDefinitions;
}

export interface EmitFileDiagnostic {
  readonly file: string;
  readonly diagnostics: readonly MacroDiagnostic[];
}

export interface EmitResult {
  readonly outputRoot: string;
  readonly files: readonly string[];
}

export class EmitDiagnosticsError extends Error {
  public readonly code = "emit-diagnostics" as const;

  public constructor(public readonly files: readonly EmitFileDiagnostic[]) {
    super(`Cannot emit because ${files.length} source file(s) have macro diagnostics.`);
    this.name = "EmitDiagnosticsError";
  }
}

const sourceExtensionPattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;
const ignoredDirectories = new Set([".git", "node_modules"]);
const profileNamePattern = /^[A-Za-z0-9_-]+$/;

/** Project all TypeScript-family files and atomically replace one profile output. */
export async function emitProject(options: EmitOptions): Promise<EmitResult> {
  assertEmitProfileName(options.profileName);

  const projectRoot = resolve(options.projectRoot);
  const sourceRoot = resolve(projectRoot, options.sourceRoot ?? ".");
  const generatedRoot = join(projectRoot, "Build", ".macrobuild");
  const outputRoot = join(generatedRoot, options.profileName);
  const sourceFiles = await discoverSourceFiles(sourceRoot, generatedRoot);
  const projectedFiles: Array<{ relativePath: string; text: string }> = [];
  const failures: EmitFileDiagnostic[] = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const projected = projectSource(source, options.definitions);
    const relativePath = relative(sourceRoot, file);
    if (projected.diagnostics.length > 0) {
      failures.push({ file: relativePath, diagnostics: projected.diagnostics });
    }
    projectedFiles.push({ relativePath, text: projected.projectedText });
  }

  if (failures.length > 0) {
    throw new EmitDiagnosticsError(failures);
  }

  await mkdir(generatedRoot, { recursive: true });
  const stagingRoot = join(
    generatedRoot,
    `.${options.profileName}.tmp-${process.pid}-${Date.now()}`,
  );
  await rm(stagingRoot, { recursive: true, force: true });
  try {
    for (const file of projectedFiles) {
      const destination = join(stagingRoot, file.relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.text, "utf8");
    }
    await rm(outputRoot, { recursive: true, force: true });
    await rename(stagingRoot, outputRoot);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  return { outputRoot, files: projectedFiles.map((file) => file.relativePath) };
}

/** Require a single safe path segment for profile-specific generated output. */
export function assertEmitProfileName(profileName: string): void {
  if (!profileNamePattern.test(profileName)) {
    throw new RangeError(`Invalid profile name '${profileName}'.`);
  }
}

async function discoverSourceFiles(
  root: string,
  generatedRoot: string,
): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name) || resolve(path) === generatedRoot) {
          continue;
        }
        await visit(path);
      } else if (entry.isFile() && sourceExtensionPattern.test(entry.name)) {
        files.push(path);
      }
    }
  };
  await visit(root);
  return files;
}
