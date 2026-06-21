import type * as ts from "typescript";

import { projectSource } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";

/** Default macro-file matcher: TypeScript-family extensions. */
const macroExtensionPattern = /\.(?:d\.)?(?:ts|tsx|mts|cts)$/i;

export interface HostProjectionOptions {
  /** The externally selected, read-only Profile applied to every macro file. */
  readonly definitions: MacroDefinitions;
  /** A version tag identifying the Profile, appended to each script version. */
  readonly profileVersion: string;
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
 * built for a different Profile. Non-macro files pass through unchanged.
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
    if (snapshot === undefined || !isMacroFile(fileName)) {
      return snapshot;
    }
    // Read the entire current file; directive pairing spans the whole file and
    // cannot be evaluated from an isolated slice.
    const source = snapshot.getText(0, snapshot.getLength());
    const projected = projectSource(source, options.definitions).projectedText;
    return typescript.ScriptSnapshot.fromString(projected);
  };

  host.getScriptVersion = (fileName: string): string => {
    const version = originalGetScriptVersion(fileName);
    if (!isMacroFile(fileName)) {
      return version;
    }
    return `${version}|tsifdef:${options.profileVersion}`;
  };

  return host;
}
