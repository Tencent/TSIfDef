import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { projectSource, type MacroDiagnostic, type MacroDefinitions } from "../core/index.js";

export interface TypeScriptBuildOptions {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly definitions: MacroDefinitions;
}

export interface TypeScriptBuildResult {
  readonly errors: readonly string[];
  readonly emitted: boolean;
}

const macroFilePattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;

/** Run tsc semantics while projecting every TypeScript file the Program reads. */
export async function runTypeScriptBuild(
  options: TypeScriptBuildOptions,
): Promise<TypeScriptBuildResult> {
  const ts = (await import("typescript")).default;
  const commandLine = ts.parseCommandLine([...options.args]);
  if (commandLine.errors.length > 0) {
    return { errors: commandLine.errors.map((item) => formatDiagnostic(ts, item)), emitted: false };
  }
  if (commandLine.fileNames.length > 0 && commandLine.options.project !== undefined) {
    return { errors: ["TS5042: Option 'project' cannot be mixed with source files."], emitted: false };
  }

  const configPath = resolveConfigPath(ts, options.cwd, commandLine.options.project);
  if (configPath === undefined) {
    return { errors: ["TS5057: Cannot find a tsconfig.json file."], emitted: false };
  }
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error !== undefined) {
    return { errors: [formatDiagnostic(ts, configFile.error)], emitted: false };
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath),
    commandLine.options,
    configPath,
  );
  if (parsed.errors.length > 0) {
    return { errors: parsed.errors.map((item) => formatDiagnostic(ts, item)), emitted: false };
  }

  const macroDiagnostics: Array<{ readonly file: string; readonly diagnostic: MacroDiagnostic }> = [];
  const projected = new Map<string, string>();
  const system: import("typescript").System = {
    ...ts.sys,
    readFile: (fileName, encoding) => {
      if (!macroFilePattern.test(fileName)) {
        return ts.sys.readFile(fileName, encoding);
      }
      const key = resolve(fileName);
      const cached = projected.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const source = readUtf8Source(fileName);
      const result = projectSource(source, options.definitions);
      for (const diagnostic of result.diagnostics) {
        macroDiagnostics.push({ file: fileName, diagnostic });
      }
      projected.set(key, result.projectedText);
      return result.projectedText;
    },
  };
  const host = ts.createIncrementalCompilerHost(parsed.options, system);
  const createOptions = {
    rootNames: parsed.fileNames,
    options: parsed.options,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
    host,
    configFileParsingDiagnostics: parsed.errors,
  };
  const builder = parsed.options.incremental === true || parsed.options.composite === true
    ? ts.createIncrementalProgram(createOptions)
    : undefined;
  const program = builder?.getProgram() ?? ts.createProgram(createOptions);

  if (macroDiagnostics.length > 0) {
    return {
      errors: macroDiagnostics.map(({ file, diagnostic }) =>
        `${file}:${diagnostic.range.start}: ${diagnostic.code}: ${diagnostic.message}`),
      emitted: false,
    };
  }
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const emit = builder?.emit() ?? program.emit();
  const allDiagnostics = [...diagnostics, ...emit.diagnostics];
  return {
    errors: allDiagnostics.map((item) => formatDiagnostic(ts, item)),
    emitted: !emit.emitSkipped,
  };
}

function resolveConfigPath(
  ts: typeof import("typescript"),
  cwd: string,
  project: string | undefined,
): string | undefined {
  if (project !== undefined) {
    const candidate = isAbsolute(project) ? project : resolve(cwd, project);
    return candidate.toLowerCase().endsWith(".json") ? candidate : resolve(candidate, "tsconfig.json");
  }
  return ts.findConfigFile(resolve(cwd), ts.sys.fileExists, "tsconfig.json");
}

function readUtf8Source(path: string): string {
  const bytes = readFileSync(path);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch (error) {
    throw new Error(`Source file '${path}' is not valid UTF-8.`, { cause: error });
  }
}

function formatDiagnostic(
  ts: typeof import("typescript"),
  diagnostic: import("typescript").Diagnostic,
): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file !== undefined && diagnostic.start !== undefined) {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${message}`;
  }
  return `TS${diagnostic.code}: ${message}`;
}
