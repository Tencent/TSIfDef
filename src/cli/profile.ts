import { readFile } from "node:fs/promises";

import type { MacroDefinitions } from "../core/expression.js";

export type ProfileSelectionSource =
  | "cli"
  | "environment"
  | "vscode"
  | "junction";

export interface ProfileSelection {
  readonly profile: string;
  readonly source: ProfileSelectionSource;
}

export interface ProfileSelectionOptions {
  readonly cliProfile?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly vscodeProfile?: string;
  readonly allowDevelopmentInference?: boolean;
  readonly inferFromJunction?: () => string | undefined;
}

export type ProfileLoadErrorCode =
  | "profile-read-failed"
  | "profile-invalid-json"
  | "profile-invalid-shape"
  | "profile-invalid-macro-name"
  | "profile-invalid-macro-value";

export class ProfileLoadError extends Error {
  public constructor(
    public readonly code: ProfileLoadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProfileLoadError";
  }
}

export class ProfileSelectionError extends Error {
  public readonly code = "profile-selection-missing" as const;

  public constructor(message: string) {
    super(message);
    this.name = "ProfileSelectionError";
  }
}

const macroNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Load and validate one UTF-8 JSON profile file. */
export async function loadProfileFile(path: string): Promise<MacroDefinitions> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new ProfileLoadError(
      "profile-read-failed",
      `Cannot read profile '${path}'.`,
      { cause: error },
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    throw new ProfileLoadError(
      "profile-invalid-json",
      `Profile '${path}' is not valid JSON.`,
      { cause: error },
    );
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProfileLoadError(
      "profile-invalid-shape",
      `Profile '${path}' must be a JSON object.`,
    );
  }

  const definitions: Record<string, boolean> = Object.create(null) as Record<
    string,
    boolean
  >;
  for (const [name, macroValue] of Object.entries(value)) {
    if (!macroNamePattern.test(name)) {
      throw new ProfileLoadError(
        "profile-invalid-macro-name",
        `Profile '${path}' contains invalid macro name '${name}'.`,
      );
    }
    if (typeof macroValue !== "boolean") {
      throw new ProfileLoadError(
        "profile-invalid-macro-value",
        `Macro '${name}' in profile '${path}' must be boolean.`,
      );
    }
    definitions[name] = macroValue;
  }

  return Object.freeze(definitions);
}

/** Select a profile name without loading it or parsing command-line arguments. */
export function selectProfile(
  options: ProfileSelectionOptions = {},
): ProfileSelection {
  if (options.cliProfile !== undefined) {
    return selection("cli", options.cliProfile);
  }

  const environmentProfile = (options.environment ?? process.env).HOK_TS_PROFILE;
  if (environmentProfile !== undefined && environmentProfile.trim() !== "") {
    return selection("environment", environmentProfile);
  }

  if (options.vscodeProfile !== undefined) {
    return selection("vscode", options.vscodeProfile);
  }

  if (options.allowDevelopmentInference === true) {
    const inferred = options.inferFromJunction?.();
    if (inferred !== undefined) {
      return selection("junction", inferred);
    }
  }

  throw new ProfileSelectionError(
    "No profile selected. Pass --profile or set HOK_TS_PROFILE.",
  );
}

function selection(
  source: ProfileSelectionSource,
  profile: string,
): ProfileSelection {
  const trimmed = profile.trim();
  if (trimmed === "") {
    throw new ProfileSelectionError(`The ${source} profile selection is blank.`);
  }
  return { profile: trimmed, source };
}
