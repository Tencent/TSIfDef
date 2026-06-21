import type { TypecheckRunner } from "./pipeline.js";

/**
 * Default typecheck runner backed by the TypeScript compiler API.
 *
 * It loads `typescript` lazily so the package keeps no static runtime dependency
 * on it; CI provides the workspace TypeScript (pinned to 5.5.4 per D003). The
 * runner parses the Profile's `tsconfig` and reports semantic and syntactic
 * diagnostics as formatted strings without emitting output.
 */
export const tscTypecheckRunner: TypecheckRunner = async ({ tsconfigPath }) => {
  const ts = (await import("typescript")).default;
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error !== undefined) {
    return { errors: [formatDiagnostic(ts, configFile.error)] };
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirnameOf(tsconfigPath),
  );
  if (parsed.errors.length > 0) {
    return { errors: parsed.errors.map((diagnostic) => formatDiagnostic(ts, diagnostic)) };
  }
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return { errors: diagnostics.map((diagnostic) => formatDiagnostic(ts, diagnostic)) };
};

function formatDiagnostic(
  ts: typeof import("typescript"),
  diagnostic: import("typescript").Diagnostic,
): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file !== undefined && diagnostic.start !== undefined) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName}:${line + 1}:${character + 1} TS${diagnostic.code}: ${message}`;
  }
  return `TS${diagnostic.code}: ${message}`;
}

function dirnameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "." : normalized.slice(0, index);
}
