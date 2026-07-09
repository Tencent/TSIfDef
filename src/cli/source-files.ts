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

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const sourceExtensionPattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;
const ignoredDirectories = new Set([".git", "node_modules"]);

/**
 * Read source with the pinned TypeScript 5.5.4 `ts.sys.readFile` semantics.
 * BOM-marked UTF-16/UTF-8 is recognized; every other byte stream is decoded as
 * non-fatal UTF-8, including the same U+FFFD replacement behavior as stock tsc.
 */
export async function readSourceText(file: string, _displayPath = file): Promise<string> {
  return decodeTypeScriptText(await readFile(file));
}

export function decodeTypeScriptText(input: Uint8Array): string {
  const bytes = Buffer.from(input);
  const length = bytes.length;
  if (length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const evenLength = length & ~1;
    const swapped = Buffer.from(bytes.subarray(0, evenLength));
    for (let index = 0; index < evenLength; index += 2) {
      const value = swapped[index]!;
      swapped[index] = swapped[index + 1]!;
      swapped[index + 1] = value;
    }
    return swapped.toString("utf16le", 2);
  }
  if (length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString("utf16le", 2);
  }
  if (length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.toString("utf8", 3);
  }
  return bytes.toString("utf8");
}

/** Discover TypeScript-family files in deterministic relative-path order. */
export async function discoverSourceFiles(
  root: string,
  excludedRoot?: string,
): Promise<string[]> {
  const files: string[] = [];
  const resolvedExcludedRoot = excludedRoot === undefined ? undefined : resolve(excludedRoot);
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name) || resolve(path) === resolvedExcludedRoot) {
          continue;
        }
        await visit(path);
      } else if (entry.isFile() && sourceExtensionPattern.test(entry.name)) {
        files.push(path);
      }
    }
  };
  await visit(resolve(root));
  return files;
}
