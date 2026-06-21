import type * as ts from "typescript";

import { projectSource } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";

/** Default macro-file matcher: TypeScript-family extensions. */
const macroExtensionPattern = /\.(?:d\.)?(?:ts|tsx|mts|cts)$/i;

/** The active Profile applied to macro files, or `undefined` when none is selected. */
export interface ActiveProfile {
  /** The externally selected, read-only macro definitions. */
  readonly definitions: MacroDefinitions;
  /** A version tag identifying the Profile, appended to each script version. */
  readonly version: string;
}

export interface HostProjectionOptions {
  /**
   * Return the currently active Profile, read fresh on every snapshot and
   * version request. Returning `undefined` disables projection so raw snapshots
   * and versions pass through. Reading live (rather than capturing once) lets a
   * later Profile change take effect without recreating the language service.
   */
  readonly getProfile: () => ActiveProfile | undefined;
  /** Decide whether a file participates in macro projection. */
  readonly isMacroFile?: (fileName: string) => boolean;
}

/**
 * Wrap a `LanguageServiceHost` so the language service sees macro-projected
 * source.
 *
 * `getScriptSnapshot` reads the complete current snapshot via
 * `getText(0, getLength())`, analyzes every directive in that whole file, and
 * returns one equal-length projected snapshot. tsserver may then read any slice
 * of that projection; macro state is never inferred from a requested slice.
 * Unsaved edits are honored because the wrapper reads the host's in-memory
 * snapshot rather than the file on disk.
 *
 * `getScriptVersion` gains the Profile version so tsserver never reuses an AST
 * built for a different Profile. Non-macro files, and all files while no Profile
 * is selected, pass through unchanged.
 *
 * The `ts` module is injected (tsserver supplies it to the plugin) so this
 * wrapper is testable without a global TypeScript dependency.
 */
export function wrapHostWithProjection<THost extends ts.LanguageServiceHost>(
  typescript: typeof ts,
  host: THost,
  options: HostProjectionOptions,
): THost {
  const isMacroFile = options.isMacroFile ?? ((fileName) => macroExtensionPattern.test(fileName));
  const originalGetScriptSnapshot = host.getScriptSnapshot.bind(host);
  const originalGetScriptVersion = host.getScriptVersion.bind(host);

  host.getScriptSnapshot = (fileName: string): ts.IScriptSnapshot | undefined => {
    const snapshot = originalGetScriptSnapshot(fileName);
    const profile = options.getProfile();
    if (snapshot === undefined || profile === undefined || !isMacroFile(fileName)) {
      return snapshot;
    }
    // Read the entire current file; directive pairing spans the whole file and
    // cannot be evaluated from an isolated slice.
    const source = snapshot.getText(0, snapshot.getLength());
    const projected = projectSource(source, profile.definitions).projectedText;
    return typescript.ScriptSnapshot.fromString(projected);
  };

  host.getScriptVersion = (fileName: string): string => {
    const version = originalGetScriptVersion(fileName);
    const profile = options.getProfile();
    if (profile === undefined || !isMacroFile(fileName)) {
      return version;
    }
    return `${version}|tsifdef:${profile.version}`;
  };

  return host;
}
