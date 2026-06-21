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

export class ProfileSelectionError extends Error {
  public readonly code = "profile-selection-missing" as const;

  public constructor(message: string) {
    super(message);
    this.name = "ProfileSelectionError";
  }
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
