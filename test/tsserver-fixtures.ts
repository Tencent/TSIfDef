import ts from "typescript";

import { wrapHostWithProjection, type ActiveProfile } from "../src/tsserver/index.js";

export interface MemoryFile {
  text: string;
  version: string;
}

/** A host whose script contents and versions are controlled in memory. */
export function createMemoryHost(files: Map<string, MemoryFile>): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: (fileName) => files.get(fileName)?.version ?? "0",
    getScriptSnapshot: (fileName) => {
      const file = files.get(fileName);
      return file === undefined ? undefined : ts.ScriptSnapshot.fromString(file.text);
    },
    getCurrentDirectory: () => "/",
    getCompilationSettings: () => ({
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      strict: true,
    }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    // Resolve in-memory files first so virtual modules import each other; fall
    // back to disk for the real lib files.
    fileExists: (path) => files.has(path) || ts.sys.fileExists(path),
    readFile: (path, encoding) =>
      files.has(path) ? files.get(path)!.text : ts.sys.readFile(path, encoding),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
}

/**
 * Create a language service over a projection-wrapping in-memory host for a
 * fixed Profile. The returned `files` map is the original (unprojected) source,
 * so tests compute and assert offsets against the real document.
 */
export function createWrappedService(
  files: Map<string, MemoryFile>,
  profile: ActiveProfile,
): { service: ts.LanguageService; files: Map<string, MemoryFile> } {
  const host = wrapHostWithProjection(ts, createMemoryHost(files), {
    getProfile: () => profile,
  });
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return { service, files };
}

/** Offset of the first occurrence of `needle` in the original document. */
export function offsetOf(files: Map<string, MemoryFile>, fileName: string, needle: string): number {
  const offset = files.get(fileName)!.text.indexOf(needle);
  if (offset < 0) {
    throw new Error(`'${needle}' not found in ${fileName}`);
  }
  return offset;
}
