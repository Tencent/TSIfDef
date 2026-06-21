import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { analyzeConditionals, type MacroDiagnostic } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";
import { loadProfileFile } from "./profile.js";
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
  const directory = profilesDirectory(projectRoot);
  const names = await discoverProfileNames(projectRoot);
  if (names.length === 0) {
    throw new Error(`No JSON profiles found in '${directory}'.`);
  }
  return Promise.all(names.map(async (name) => ({
    name,
    definitions: await loadProfileFile(join(directory, `${name}.json`)),
  })));
}

/** Discover `Build/macros/*.json` profile names in deterministic order. */
export async function discoverProfileNames(projectRoot: string): Promise<readonly string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(profilesDirectory(projectRoot), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name.slice(0, -5))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function profilesDirectory(projectRoot: string): string {
  return join(resolve(projectRoot), "Build", "macros");
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
