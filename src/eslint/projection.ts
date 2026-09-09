// Copyright (C) 2026 Tencent. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parseProfileFile } from "../cli/config.js";
import { projectSource, type MacroDefinitions, type SourceRange } from "../core/index.js";

interface ProfileCacheEntry {
  readonly mtimeMs: number;
  readonly size: number;
  readonly definitions: MacroDefinitions;
}

interface PackagePointerCacheEntry {
  readonly mtimeMs: number;
  readonly size: number;
  /** `null` means a package.json boundary without a TSIfDef opt-in. */
  readonly profilePath: string | null;
}

type PackagePointerLookup =
  | { readonly kind: "continue" }
  | { readonly kind: "resolved"; readonly profilePath: string | null };

export interface EslintProjection {
  readonly projectedText: string;
  readonly maskedRanges: readonly SourceRange[];
}

const profileCache = new Map<string, ProfileCacheEntry>();
const packagePointerCache = new Map<string, PackagePointerCacheEntry>();
const macroFilePattern = /\.(?:d\.)?(?:ts|tsx|mts|cts)$/i;

/**
 * Resolve the nearest TSIfDef Profile and return an equal-length projection.
 * Any missing or transiently invalid configuration fails open to the raw text.
 */
export function projectSourceForEslint(source: string, filename: string | undefined): EslintProjection {
  if (filename === undefined || !macroFilePattern.test(filename)) {
    return { projectedText: source, maskedRanges: [] };
  }
  const profilePath = resolveProfilePath(filename);
  if (profilePath === undefined) {
    return { projectedText: source, maskedRanges: [] };
  }
  const definitions = loadDefinitions(profilePath);
  if (definitions === undefined) {
    return { projectedText: source, maskedRanges: [] };
  }
  const projection = projectSource(source, definitions);
  return {
    projectedText: projection.projectedText,
    maskedRanges: projection.maskedRanges,
  };
}

function resolveProfilePath(filename: string): string | undefined {
  let dir = dirname(resolve(filename));
  for (;;) {
    const lookup = readPackagePointer(join(dir, "package.json"), dir);
    if (lookup.kind === "resolved") {
      return lookup.profilePath ?? undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function readPackagePointer(packagePath: string, packageDir: string): PackagePointerLookup {
  let stat;
  try {
    stat = statSync(packagePath);
  } catch {
    return { kind: "continue" };
  }

  const cached = packagePointerCache.get(packagePath);
  if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return { kind: "resolved", profilePath: cached.profilePath };
  }

  try {
    const raw = JSON.parse(readFileSync(packagePath, "utf8").replace(/^\uFEFF/, "")) as unknown;
    if (raw !== null && typeof raw === "object") {
      const value = (raw as Record<string, unknown>).tsifdef;
      const profilePath =
        typeof value === "string" && value.trim() !== ""
          ? resolve(packageDir, value)
          : null;
      packagePointerCache.set(packagePath, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        profilePath,
      });
      return { kind: "resolved", profilePath };
    }
  } catch {
    // Keep lint permissive when a package.json is temporarily unreadable.
  }
  return { kind: "continue" };
}

function loadDefinitions(profilePath: string): MacroDefinitions | undefined {
  let mtimeMs: number;
  let size: number;
  try {
    const stat = statSync(profilePath);
    mtimeMs = stat.mtimeMs;
    size = stat.size;
  } catch {
    return undefined;
  }
  const cached = profileCache.get(profilePath);
  if (cached !== undefined && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.definitions;
  }
  try {
    const text = readFileSync(profilePath, "utf8");
    const definitions = parseProfileFile(text, profilePath).definitions;
    profileCache.set(profilePath, { mtimeMs, size, definitions });
    return definitions;
  } catch {
    return undefined;
  }
}
