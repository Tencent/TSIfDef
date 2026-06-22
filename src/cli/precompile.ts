import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { coreApiVersion, projectSource } from "../core/index.js";
import type { ProfileFile } from "./config.js";
import { decodeTypeScriptText } from "./source-files.js";

export interface PrecompileOptions {
  readonly projectRoot: string;
  readonly project: string;
  readonly profile: ProfileFile;
}

export interface PrecompileManifestFile {
  readonly source: string;
  readonly projected: string;
  readonly sourceHash: string;
  readonly projectedHash: string;
}

export interface PrecompileManifest {
  readonly schemaVersion: 1;
  readonly toolVersion: string;
  readonly profileFile: string;
  readonly profileHash: string;
  readonly sourceProject: string;
  readonly generatedProject: string;
  readonly files: readonly PrecompileManifestFile[];
}

export interface PrecompileResult {
  readonly outputRoot: string;
  readonly projectPath: string;
  readonly manifest: PrecompileManifest;
}

export interface PrecompileFileDiagnostic {
  readonly file: string;
  readonly diagnostics: readonly import("../core/index.js").MacroDiagnostic[];
}

export class PrecompileDiagnosticsError extends Error {
  public readonly code = "precompile-diagnostics" as const;

  public constructor(public readonly files: readonly PrecompileFileDiagnostic[]) {
    super(`Cannot precompile because ${files.length} source file(s) have macro diagnostics.`);
    this.name = "PrecompileDiagnosticsError";
  }
}

const macroFilePattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;

/** Emit an auditable projected project derived from the original TypeScript Program. */
export async function precompileProject(options: PrecompileOptions): Promise<PrecompileResult> {
  const ts = (await import("typescript")).default;
  const projectRoot = resolve(options.projectRoot);
  const sourceProject = resolve(projectRoot, options.project);
  const outputRoot = resolve(projectRoot, ".tsifdef", "Output");
  const configFile = ts.readConfigFile(sourceProject, ts.sys.readFile);
  if (configFile.error !== undefined) throw new Error(formatDiagnostic(ts, configFile.error));
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(sourceProject),
    undefined,
    sourceProject,
  );
  if (parsed.errors.length > 0) throw new Error(parsed.errors.map((item) => formatDiagnostic(ts, item)).join("\n"));

  const projected = new Map<string, { source: string; sourceHash: string; projected: string }>();
  const failures: PrecompileFileDiagnostic[] = [];
  const host = ts.createCompilerHost(parsed.options, true);
  const readProjected = (fileName: string): string | undefined => {
    if (!macroFilePattern.test(fileName)) return ts.sys.readFile(fileName);
    const absolute = resolve(fileName);
    const cached = projected.get(absolute);
    if (cached !== undefined) return cached.projected;
    const sourceBytes = readFileSync(absolute);
    const source = decodeTypeScriptText(sourceBytes);
    const result = projectSource(source, options.profile.definitions);
    if (result.diagnostics.length > 0) {
      failures.push({ file: relative(projectRoot, absolute), diagnostics: result.diagnostics });
    }
    projected.set(absolute, { source, sourceHash: hash(sourceBytes), projected: result.projectedText });
    return result.projectedText;
  };
  host.readFile = readProjected;
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const text = readProjected(fileName);
    if (text === undefined) {
      onError?.(`Cannot read '${fileName}'.`);
      return undefined;
    }
    return ts.createSourceFile(fileName, text, languageVersion, true);
  };
  ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
  });
  if (failures.length > 0) throw new PrecompileDiagnosticsError(failures);

  const internalFiles = [...projected.entries()]
    .filter(([path]) => isInside(projectRoot, path) && !relative(projectRoot, path).split(sep).includes("node_modules"))
    .sort(([left], [right]) => left.localeCompare(right, "en"));
  const staging = `${outputRoot}.tmp-${process.pid}-${Date.now()}`;
  const generatedProject = resolve(outputRoot, "tsconfig.json");
  const manifestFiles: PrecompileManifestFile[] = [];
  await rm(staging, { recursive: true, force: true });
  try {
    for (const [sourcePath, texts] of internalFiles) {
      const relativePath = relative(projectRoot, sourcePath);
      const projectedPath = resolve(staging, "project", relativePath);
      await mkdir(dirname(projectedPath), { recursive: true });
      await writeFile(projectedPath, texts.projected, "utf8");
      manifestFiles.push({
        source: relativePath.replaceAll("\\", "/"),
        projected: `project/${relativePath.replaceAll("\\", "/")}`,
        sourceHash: texts.sourceHash,
        projectedHash: hash(texts.projected),
      });
    }
    const generatedConfig = {
      extends: sourceProject.replaceAll("\\", "/"),
      files: manifestFiles.map((file) => `./${file.projected}`),
      include: [] as string[],
      compilerOptions: projectedPathOptions(parsed.options, projectRoot, outputRoot, sourceProject),
    };
    await writeFile(resolve(staging, "tsconfig.json"), `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");
    const profileBytes = await readFile(options.profile.path);
    const manifest: PrecompileManifest = {
      schemaVersion: 1,
      toolVersion: String(coreApiVersion),
      profileFile: options.profile.path,
      profileHash: hash(profileBytes),
      sourceProject,
      generatedProject,
      files: manifestFiles,
    };
    await writeFile(resolve(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(dirname(outputRoot), { recursive: true });
    await rename(staging, outputRoot);
    return { outputRoot, projectPath: generatedProject, manifest };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function projectedPathOptions(
  options: import("typescript").CompilerOptions,
  projectRoot: string,
  outputRoot: string,
  sourceProject: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const mapTarget = (path: string): string => {
    const absolute = resolve(path);
    return isInside(projectRoot, absolute)
      ? resolve(outputRoot, "project", relative(projectRoot, absolute))
      : absolute;
  };
  const mapAbsolute = (path: string): string => {
    const mapped = mapTarget(path);
    let value = relative(outputRoot, mapped).replaceAll("\\", "/");
    if (!value.startsWith(".")) value = `./${value}`;
    return value;
  };
  if (options.baseUrl !== undefined) result.baseUrl = mapAbsolute(options.baseUrl);
  if (options.rootDir !== undefined) result.rootDir = mapAbsolute(options.rootDir);
  if (options.rootDirs !== undefined) result.rootDirs = options.rootDirs.map(mapAbsolute);
  if (options.typeRoots !== undefined) result.typeRoots = options.typeRoots.map(mapAbsolute);
  if (options.paths !== undefined) {
    const base = options.baseUrl ?? dirname(sourceProject);
    const mappedBase = mapTarget(base);
    result.paths = Object.fromEntries(Object.entries(options.paths).map(([key, values]) => [
      key,
      values.map((value) => relative(mappedBase, mapTarget(resolve(base, value))).replaceAll("\\", "/")),
    ]));
  }
  return result;
}

function isInside(root: string, path: string): boolean {
  const value = relative(root, path);
  return !value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value);
}

function hash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function formatDiagnostic(ts: typeof import("typescript"), diagnostic: import("typescript").Diagnostic): string {
  return `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
}
