import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";

import { coreApiVersion, projectSource, type MacroDiagnostic } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";
import { discoverSourceFiles, readSourceText } from "./source-files.js";

export interface EmitOptions {
  readonly projectRoot: string;
  readonly sourceRoot?: string;
  readonly profileName: string;
  readonly definitions: MacroDefinitions;
  readonly cache?: {
    readonly macroConfigVersion: string;
    readonly preprocessorVersion?: string;
  };
}

export interface EmitFileDiagnostic {
  readonly file: string;
  readonly diagnostics: readonly MacroDiagnostic[];
}

export interface EmitResult {
  readonly outputRoot: string;
  readonly files: readonly string[];
  readonly cacheHits: number;
}

export class EmitDiagnosticsError extends Error {
  public readonly code = "emit-diagnostics" as const;

  public constructor(public readonly files: readonly EmitFileDiagnostic[]) {
    super(`Cannot emit because ${files.length} source file(s) have macro diagnostics.`);
    this.name = "EmitDiagnosticsError";
  }
}

const profileNamePattern = /^[A-Za-z0-9_-]+$/;

interface CacheEntry {
  readonly key: string;
  readonly projectedText: string;
}

interface CacheManifest {
  readonly entries: Readonly<Record<string, CacheEntry>>;
}

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
  const cachePath = join(generatedRoot, ".cache", `${options.profileName}.json`);
  const previousCache = options.cache === undefined
    ? { entries: {} } satisfies CacheManifest
    : await readCache(cachePath);
  const nextEntries: Record<string, CacheEntry> = {};
  let cacheHits = 0;

  for (const file of sourceFiles) {
    const relativePath = relative(sourceRoot, file);
    const source = await readSourceText(file, relativePath);
    const key = options.cache === undefined
      ? ""
      : createProjectionCacheKey(
          source,
          options.definitions,
          options.cache.preprocessorVersion ?? String(coreApiVersion),
          options.cache.macroConfigVersion,
        );
    const cached = previousCache.entries[relativePath];
    if (options.cache !== undefined && cached?.key === key) {
      projectedFiles.push({ relativePath, text: cached.projectedText });
      nextEntries[relativePath] = cached;
      cacheHits += 1;
      continue;
    }
    const projected = projectSource(source, options.definitions);
    if (projected.diagnostics.length > 0) {
      failures.push({ file: relativePath, diagnostics: projected.diagnostics });
    }
    projectedFiles.push({ relativePath, text: projected.projectedText });
    if (options.cache !== undefined && projected.diagnostics.length === 0) {
      nextEntries[relativePath] = { key, projectedText: projected.projectedText };
    }
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
    if (options.cache !== undefined) {
      await writeCache(cachePath, { entries: nextEntries });
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  return {
    outputRoot,
    files: projectedFiles.map((file) => file.relativePath),
    cacheHits,
  };
}

export function createProjectionCacheKey(
  source: string,
  definitions: MacroDefinitions,
  preprocessorVersion: string,
  macroConfigVersion: string,
): string {
  const sortedDefinitions = Object.keys(definitions)
    .sort()
    .map((name) => [name, definitions[name]] as const);
  return createHash("sha256")
    .update(JSON.stringify([source, sortedDefinitions, preprocessorVersion, macroConfigVersion]))
    .digest("hex");
}

async function readCache(path: string): Promise<CacheManifest> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as CacheManifest;
    if (parsed === null || typeof parsed !== "object" || parsed.entries === null || typeof parsed.entries !== "object") {
      return { entries: {} };
    }
    const entries: Record<string, CacheEntry> = {};
    for (const [file, entry] of Object.entries(parsed.entries)) {
      if (
        entry !== null &&
        typeof entry === "object" &&
        typeof entry.key === "string" &&
        typeof entry.projectedText === "string"
      ) {
        entries[file] = entry;
      }
    }
    return { entries };
  } catch {
    return { entries: {} };
  }
}

async function writeCache(path: string, manifest: CacheManifest): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, JSON.stringify(manifest), "utf8");
    await rm(path, { force: true });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Require a single safe path segment for profile-specific generated output. */
export function assertEmitProfileName(profileName: string): void {
  if (!profileNamePattern.test(profileName)) {
    throw new RangeError(`Invalid profile name '${profileName}'.`);
  }
}
