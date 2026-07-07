import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { projectSource, type MacroDiagnostic } from "../core/index.js";
import type { ProfileFile } from "./config.js";
import { decodeTypeScriptText } from "./source-files.js";

export interface BuildOptions {
  readonly projectRoot: string;
  readonly project: string;
  readonly profile: ProfileFile;
}

export interface BuildResult {
  readonly emitted: boolean;
  /** Absolute paths of files written by emit, in deterministic order. */
  readonly outputFiles: readonly string[];
  /** True when type checking or macro analysis reported blocking diagnostics. */
  readonly hasErrors: boolean;
}

export interface BuildFileDiagnostic {
  readonly file: string;
  readonly diagnostics: readonly MacroDiagnostic[];
}

/** Raised when source files contain macro-structure diagnostics; blocks emit. */
export class BuildMacroDiagnosticsError extends Error {
  public readonly code = "build-macro-diagnostics" as const;

  public constructor(public readonly files: readonly BuildFileDiagnostic[]) {
    super(`Cannot build because ${files.length} source file(s) have macro diagnostics.`);
    this.name = "BuildMacroDiagnosticsError";
  }
}

/** Raised for tsconfig shapes that projected compilation cannot support. */
export class BuildUnsupportedError extends Error {
  public readonly code = "build-unsupported" as const;

  public constructor(message: string) {
    super(message);
    this.name = "BuildUnsupportedError";
  }
}

const macroFilePattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;

/**
 * Compile the project by projected compilation: hijack the CompilerHost so the
 * TypeScript compiler reads equal-length masked text under the ORIGINAL file
 * names, then drive `program.emit()`. Because the compiler never sees a shadow
 * path, emitted sourcemap `sources`, `.d.ts`, and diagnostic paths point at the
 * original sources with no post-processing.
 */
export async function buildProject(options: BuildOptions): Promise<BuildResult> {
  const ts = (await import("typescript")).default;
  const projectRoot = resolve(options.projectRoot);
  const configPath = resolve(projectRoot, options.project);

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error !== undefined) throw new Error(formatConfigDiagnostic(ts, configFile.error));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath), undefined, configPath);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((item) => formatConfigDiagnostic(ts, item)).join("\n"));
  }

  assertSupported(parsed.options, parsed.projectReferences);

  // Cache projected text and collect macro diagnostics per file. The compiler
  // may read a file more than once; project it only on the first read.
  const projected = new Map<string, string>();
  const failures: BuildFileDiagnostic[] = [];
  const readProjected = (fileName: string): string | undefined => {
    if (!macroFilePattern.test(fileName)) return ts.sys.readFile(fileName);
    const absolute = resolve(fileName);
    const cached = projected.get(absolute);
    if (cached !== undefined) return cached;
    let bytes: Buffer;
    try {
      bytes = readFileSync(absolute);
    } catch {
      return undefined;
    }
    const result = projectSource(decodeTypeScriptText(bytes), options.profile.definitions);
    if (result.diagnostics.length > 0) {
      failures.push({ file: relative(projectRoot, absolute), diagnostics: result.diagnostics });
    }
    projected.set(absolute, result.projectedText);
    return result.projectedText;
  };

  const host = ts.createCompilerHost(parsed.options, true);
  host.readFile = readProjected;
  host.getSourceFile = (fileName, languageVersionOrOptions, onError) => {
    const text = readProjected(fileName);
    if (text === undefined) {
      onError?.(`Cannot read '${fileName}'.`);
      return undefined;
    }
    return ts.createSourceFile(fileName, text, languageVersionOrOptions, true);
  };

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
  });

  // Macro-structure diagnostics are surfaced from projection; block emit.
  if (failures.length > 0) throw new BuildMacroDiagnosticsError(failures);

  const preEmit = ts.getPreEmitDiagnostics(program);
  const hasErrors = preEmit.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (preEmit.length > 0) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(preEmit, diagnosticHost(ts, projectRoot)));
  }

  const noEmit = parsed.options.noEmit === true;
  const blockedByErrors = hasErrors && parsed.options.noEmitOnError === true;
  if (noEmit || blockedByErrors) {
    return { emitted: false, outputFiles: [], hasErrors };
  }

  const outputFiles: string[] = [];
  const restoreSources = parsed.options.inlineSources === true;
  const emitResult = program.emit(undefined, (fileName, text, writeByteOrderMark) => {
    const output = restoreSources ? restoreInlineSources(fileName, text) : text;
    ts.sys.writeFile(fileName, output, writeByteOrderMark);
    outputFiles.push(resolve(fileName));
  });
  const emitDiagnostics = emitResult.diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (emitResult.diagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(emitResult.diagnostics, diagnosticHost(ts, projectRoot)));
  }

  outputFiles.sort((left, right) => left.localeCompare(right, "en"));
  return {
    emitted: !emitResult.emitSkipped,
    outputFiles,
    hasErrors: hasErrors || emitDiagnostics.length > 0,
  };
}

/**
 * With `inlineSources`, tsc embeds the text it read — which is our masked
 * projection — into the sourcemap's `sourcesContent`. Replace each embedded
 * entry with the original disk text so debuggers show real source, keeping the
 * equal-length projection everywhere else. Handles both external `.map` files
 * and inline base64 `sourceMappingURL` data URIs.
 */
function restoreInlineSources(fileName: string, text: string): string {
  if (/\.map$/i.test(fileName)) {
    return rewriteMapSourcesContent(fileName, text);
  }
  const inlinePattern = /(\/\/[#@]\s*sourceMappingURL=data:application\/json;(?:charset=[^;]+;)?base64,)([A-Za-z0-9+/=]+)/;
  const match = inlinePattern.exec(text);
  if (match === undefined || match === null) return text;
  const decoded = Buffer.from(match[2]!, "base64").toString("utf8");
  const rewritten = rewriteMapSourcesContent(fileName, decoded);
  const encoded = Buffer.from(rewritten, "utf8").toString("base64");
  return text.replace(inlinePattern, `${match[1]}${encoded}`);
}

/** Rewrite a sourcemap JSON's `sourcesContent` from disk originals. */
function rewriteMapSourcesContent(mapFileName: string, mapText: string): string {
  let map: { sources?: string[]; sourceRoot?: string; sourcesContent?: unknown[] };
  try {
    map = JSON.parse(mapText) as typeof map;
  } catch {
    return mapText;
  }
  if (!Array.isArray(map.sources) || map.sources.length === 0) return mapText;
  const base = dirname(resolve(mapFileName));
  const root = typeof map.sourceRoot === "string" ? map.sourceRoot : "";
  map.sourcesContent = map.sources.map((source) => {
    try {
      return decodeTypeScriptText(readFileSync(resolve(base, root, source)));
    } catch {
      return null;
    }
  });
  return JSON.stringify(map);
}

/** Reject tsconfig shapes incompatible with per-file projected compilation. */
function assertSupported(
  options: import("typescript").CompilerOptions,
  projectReferences: readonly import("typescript").ProjectReference[] | undefined,
): void {
  if (typeof options.outFile === "string" && options.outFile !== "") {
    throw new BuildUnsupportedError(
      "tsifdef build does not support 'outFile'; per-file projection is incompatible with single-file bundle output.",
    );
  }
  if (projectReferences !== undefined && projectReferences.length > 0) {
    throw new BuildUnsupportedError(
      "tsifdef build does not support project references (tsc -b / composite solutions); run tsifdef build per referenced project instead.",
    );
  }
}

function diagnosticHost(
  ts: typeof import("typescript"),
  projectRoot: string,
): import("typescript").FormatDiagnosticsHost {
  return {
    getCurrentDirectory: () => projectRoot,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => ts.sys.newLine,
  };
}

function formatConfigDiagnostic(
  ts: typeof import("typescript"),
  diagnostic: import("typescript").Diagnostic,
): string {
  return `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
}
