import { join, relative, resolve } from "node:path";

import { analyzeConditionals, type MacroDiagnostic } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";
import { loadTsIfDefConfig } from "./config.js";
import { discoverSourceFiles, readSourceText } from "./source-files.js";

export interface CheckProfile {
  readonly name: string;
  readonly definitions: MacroDefinitions;
}

export interface CheckOptions {
  readonly projectRoot: string;
  readonly sourceRoot?: string;
  readonly profiles: readonly CheckProfile[];
}

export type CheckDiagnostic = MacroDiagnostic & {
  readonly profile: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
};

export async function checkProject(options: CheckOptions): Promise<readonly CheckDiagnostic[]> {
  const projectRoot = resolve(options.projectRoot);
  const sourceRoot = resolve(projectRoot, options.sourceRoot ?? ".");
  const files = await discoverSourceFiles(sourceRoot, join(projectRoot, "Build", ".macrobuild"));
  const diagnostics: CheckDiagnostic[] = [];
  for (const profile of options.profiles) {
    for (const file of files) {
      const relativePath = relative(sourceRoot, file);
      const source = await readSourceText(file, relativePath);
      for (const diagnostic of analyzeConditionals(source, profile.definitions).diagnostics) {
        const location = offsetLocation(source, diagnostic.range.start);
        diagnostics.push({
          ...diagnostic,
          profile: profile.name,
          file: relativePath,
          ...location,
        });
      }
    }
  }
  return diagnostics;
}

export async function loadAllProfiles(projectRoot: string): Promise<readonly CheckProfile[]> {
  return (await loadTsIfDefConfig(projectRoot)).profiles;
}

/** Discover Profile names from the fixed package-adjacent configuration. */
export async function discoverProfileNames(projectRoot: string): Promise<readonly string[]> {
  try {
    return (await loadTsIfDefConfig(projectRoot)).profiles.map((profile) => profile.name);
  } catch {
    return [];
  }
}

function offsetLocation(source: string, target: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let offset = 0; offset < target; offset += 1) {
    if (source[offset] === "\n" || source[offset] === "\r") {
      if (source[offset] === "\r" && source[offset + 1] === "\n") {
        offset += 1;
      }
      line += 1;
      lineStart = offset + 1;
    }
  }
  return { line, column: target - lineStart + 1 };
}
