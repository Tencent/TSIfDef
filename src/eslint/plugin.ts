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
import { projectSource, type MacroDefinitions } from "../core/index.js";

// TSIfDef ESLint processor
//
// This mirrors the tsserver plugin: tsserver intercepts getScriptSnapshot so
// the language service sees only projected source, while this processor uses
// preprocess so the ESLint parser also sees only projected source. Equal-length
// masking preserves line and column coordinates, so postprocess can return
// diagnostics without remapping their positions.
//
// Usage (in the project's .eslintrc):
//   { "plugins": ["tsifdef"],
//     "overrides": [{ "files": ["*.ts","*.mts"], "processor": "tsifdef/macros" }] }
//
// Profile resolution matches the CLI and tsserver: search upward from the
// checked file for a package.json with a "tsifdef" pointer to a JSON array of
// enabled macro names. If none is found, fall back to the original text so lint
// is not blocked.

interface ProfileCacheEntry {
  readonly mtimeMs: number;
  readonly definitions: MacroDefinitions;
}

// Cache by Profile path to avoid repeated reads and parsing; invalidate by mtime.
const profileCache = new Map<string, ProfileCacheEntry>();
// Cache upward Profile-path lookups by directory to avoid a search per file.
const pointerCache = new Map<string, string | null>();

const macroFilePattern = /\.(?:d\.)?(?:ts|tsx|mts|cts)$/i;

/** Find the nearest package.json with a tsifdef pointer and return its absolute Profile path. */
function resolveProfilePath(filename: string): string | undefined {
  let dir = dirname(resolve(filename));
  const chain: string[] = [];
  for (;;) {
    const cached = pointerCache.get(dir);
    if (cached !== undefined) {
      // Cache the resolved result for every directory traversed on this lookup.
      for (const d of chain) pointerCache.set(d, cached);
      return cached ?? undefined;
    }
    chain.push(dir);

    const packagePath = join(dir, "package.json");
    let pointer: string | undefined;
    try {
      const raw = JSON.parse(readFileSync(packagePath, "utf8").replace(/^﻿/, "")) as unknown;
      const value =
        raw !== null && typeof raw === "object"
          ? (raw as Record<string, unknown>).tsifdef
          : undefined;
      if (typeof value === "string" && value.trim() !== "") {
        pointer = resolve(dir, value);
      } else if (raw !== null && typeof raw === "object") {
        // A package.json without a tsifdef pointer is a package boundary.
        for (const d of chain) pointerCache.set(d, null);
        return undefined;
      }
    } catch {
      // No readable package.json in this directory; continue upward.
    }
    if (pointer !== undefined) {
      for (const d of chain) pointerCache.set(d, pointer);
      return pointer;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      // Reached the file-system root without finding a Profile.
      for (const d of chain) pointerCache.set(d, null);
      return undefined;
    }
    dir = parent;
  }
}

/** Read and parse a Profile with mtime caching; return undefined on failure. */
function loadDefinitions(profilePath: string): MacroDefinitions | undefined {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(profilePath).mtimeMs;
  } catch {
    return undefined;
  }
  const cached = profileCache.get(profilePath);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.definitions;
  }
  try {
    const text = readFileSync(profilePath, "utf8");
    const definitions = parseProfileFile(text, profilePath).definitions;
    profileCache.set(profilePath, { mtimeMs, definitions });
    return definitions;
  } catch {
    return undefined;
  }
}

interface LintMessage {
  readonly line?: number;
  readonly column?: number;
  [key: string]: unknown;
}

export const processors = {
  macros: {
    supportsAutofix: false,
    preprocess(text: string, filename: string): string[] {
      if (!macroFilePattern.test(filename)) {
        return [text];
      }
      const profilePath = resolveProfilePath(filename);
      if (profilePath === undefined) {
        return [text];
      }
      const definitions = loadDefinitions(profilePath);
      if (definitions === undefined) {
        return [text];
      }
      // Equal-length masking replaces inactive branches and directive lines
      // with spaces while preserving CR/LF characters and total length.
      return [projectSource(text, definitions).projectedText];
    },
    postprocess(messages: LintMessage[][]): LintMessage[] {
      // The equal-length projection preserves diagnostic line and column positions.
      return messages.flat();
    },
  },
};

export default { processors };
