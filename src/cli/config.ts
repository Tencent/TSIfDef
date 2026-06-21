import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

export const tsIfDefConfigFileName = "tsifdef" as const;

export interface TsIfDefProfile {
  readonly name: string;
  readonly definitions: MacroDefinitions;
}

export interface TsIfDefConfig {
  readonly path: string;
  readonly profiles: readonly TsIfDefProfile[];
}

const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Load the one fixed macro-only configuration beside the project's package.json. */
export async function loadTsIfDefConfig(projectRoot: string): Promise<TsIfDefConfig> {
  const path = join(resolve(projectRoot), tsIfDefConfigFileName);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new TsIfDefConfigError(
      "config-read-failed",
      `Cannot read TSIfDef configuration '${path}'.`,
      { cause: error },
    );
  }
  return parseTsIfDefConfig(text, path);
}

/** Parse Profile-to-enabled-macro JSON without accepting build graph fields. */
export function parseTsIfDefConfig(
  text: string,
  path: string = tsIfDefConfigFileName,
): TsIfDefConfig {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    throw new TsIfDefConfigError(
      "config-invalid-json",
      `TSIfDef configuration '${path}' is not valid JSON.`,
      { cause: error },
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TsIfDefConfigError(
      "config-invalid-shape",
      `TSIfDef configuration '${path}' must map Profile names to enabled-macro arrays.`,
    );
  }

  const profiles: TsIfDefProfile[] = [];
  const normalizedNames = new Set<string>();
  for (const [name, enabled] of Object.entries(value)) {
    if (!namePattern.test(name)) {
      throw new TsIfDefConfigError(
        "config-invalid-name",
        `TSIfDef configuration '${path}' contains invalid Profile name '${name}'.`,
      );
    }
    const normalized = name.toLowerCase();
    if (normalizedNames.has(normalized)) {
      throw new TsIfDefConfigError(
        "config-invalid-shape",
        `TSIfDef configuration '${path}' contains ambiguous Profile name '${name}'.`,
      );
    }
    normalizedNames.add(normalized);
    if (!Array.isArray(enabled)) {
      throw new TsIfDefConfigError(
        "config-invalid-shape",
        `Profile '${name}' in '${path}' must be an array of enabled macro names.`,
      );
    }

    const definitions: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
    for (const macro of enabled as unknown[]) {
      if (typeof macro !== "string" || !namePattern.test(macro)) {
        throw new TsIfDefConfigError(
          "config-invalid-name",
          `Profile '${name}' in '${path}' contains invalid macro name '${String(macro)}'.`,
        );
      }
      if (Object.hasOwn(definitions, macro)) {
        throw new TsIfDefConfigError(
          "config-invalid-shape",
          `Profile '${name}' in '${path}' lists macro '${macro}' more than once.`,
        );
      }
      definitions[macro] = true;
    }
    profiles.push({ name, definitions: Object.freeze(definitions) });
  }
  if (profiles.length === 0) {
    throw new TsIfDefConfigError(
      "config-invalid-shape",
      `TSIfDef configuration '${path}' must define at least one Profile.`,
    );
  }
  profiles.sort((left, right) => left.name.localeCompare(right.name, "en"));
  return Object.freeze({ path, profiles: Object.freeze(profiles) });
}

/** Resolve a Profile case-insensitively while retaining its canonical configured name. */
export function profileFromConfig(config: TsIfDefConfig, requestedName: string): TsIfDefProfile {
  const profile = config.profiles.find(
    (candidate) => candidate.name.toLowerCase() === requestedName.toLowerCase(),
  );
  if (profile === undefined) {
    throw new TsIfDefConfigError(
      "config-invalid-shape",
      `Profile '${requestedName}' is not defined in '${config.path}'.`,
    );
  }
  return profile;
}
