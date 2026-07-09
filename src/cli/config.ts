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

import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import type { MacroDefinitions } from "../core/expression.js";

export type TsIfDefConfigErrorCode =
  | "config-read-failed"
  | "config-invalid-json"
  | "config-invalid-shape"
  | "config-invalid-name";

export class TsIfDefConfigError extends Error {
  public constructor(
    public readonly code: TsIfDefConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TsIfDefConfigError";
  }
}

export interface ProfileFile {
  readonly path: string;
  readonly fileName: string;
  readonly definitions: MacroDefinitions;
}

export interface ProjectConfiguration {
  readonly packagePath: string;
  readonly profilePath: string;
}

const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Load the single Profile pointer from the current project's package.json. */
export async function loadProjectConfiguration(projectRoot: string): Promise<ProjectConfiguration> {
  const packagePath = resolve(projectRoot, "package.json");
  let value: unknown;
  try {
    value = JSON.parse((await readFile(packagePath, "utf8")).replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    throw new TsIfDefConfigError(
      "config-invalid-json",
      `Cannot read a valid package.json at '${packagePath}'.`,
      { cause: error },
    );
  }
  const pointer = value !== null && typeof value === "object"
    ? (value as Record<string, unknown>).tsifdef
    : undefined;
  if (typeof pointer !== "string" || pointer.trim() === "") {
    throw new TsIfDefConfigError(
      "config-invalid-shape",
      `package.json at '${packagePath}' must contain a non-empty string 'tsifdef' Profile path.`,
    );
  }
  return Object.freeze({
    packagePath,
    profilePath: resolve(dirname(packagePath), pointer),
  });
}

/** Load one explicitly selected Profile file containing enabled macro names. */
export async function loadProfileFile(path: string): Promise<ProfileFile> {
  const resolvedPath = resolve(path);
  let text: string;
  try {
    text = await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new TsIfDefConfigError(
      "config-read-failed",
      `Cannot read TSIfDef Profile '${resolvedPath}'.`,
      { cause: error },
    );
  }
  return parseProfileFile(text, resolvedPath);
}

/** Parse the D029 schema: a JSON array of enabled macro names. */
export function parseProfileFile(text: string, path: string): ProfileFile {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    throw new TsIfDefConfigError(
      "config-invalid-json",
      `TSIfDef Profile '${path}' is not valid JSON.`,
      { cause: error },
    );
  }
  if (!Array.isArray(value)) {
    throw new TsIfDefConfigError(
      "config-invalid-shape",
      `TSIfDef Profile '${path}' must be an array of enabled macro names.`,
    );
  }

  const definitions: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
  for (const macro of value as unknown[]) {
    if (typeof macro !== "string" || !namePattern.test(macro)) {
      throw new TsIfDefConfigError(
        "config-invalid-name",
        `TSIfDef Profile '${path}' contains invalid macro name '${String(macro)}'.`,
      );
    }
    // A repeated macro name is semantically harmless (enabling X twice is
    // enabling X). Tolerate it by de-duplicating rather than rejecting the whole
    // Profile — a generated Profile with an accidental duplicate must not
    // collapse projection and break every editor diagnostic.
    definitions[macro] = true;
  }
  const resolvedPath = resolve(path);
  return Object.freeze({
    path: resolvedPath,
    fileName: basename(resolvedPath),
    definitions: Object.freeze(definitions),
  });
}
