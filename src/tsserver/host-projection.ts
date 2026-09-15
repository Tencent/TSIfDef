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

import type * as ts from "typescript";

import { projectSource } from "../core/index.js";
import type { MacroDefinitions } from "../core/expression.js";
import type { SourceRange } from "../core/scanner.js";

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
 * A projected snapshot that keeps incremental reparsing working.
 *
 * tsserver asks a snapshot how it differs from the previous one via
 * `getChangeRange`. When that returns `undefined`, TypeScript cannot reuse any
 * of the previous AST and reparses the whole file on every keystroke, which is
 * catastrophic on large files. `ts.ScriptSnapshot.fromString` always returns
 * `undefined`, so wrapping the host with it silently disabled incremental
 * reparsing for every macro file.
 *
 * Equal-length masking is what makes delegation sound: a projected document has
 * exactly the same length and offsets as its source, so a change range computed
 * over the source is valid for the projection verbatim. The one exception is an
 * edit that changes macro structure (adding, removing, or flipping a directive),
 * which can rewrite text far from the edit. That case is detected by comparing
 * masked ranges and reported as a full change so TypeScript reparses.
 */
class ProjectedSnapshot implements ts.IScriptSnapshot {
  public constructor(
    private readonly projectedText: string,
    /** Masked ranges of this projection, used to detect macro-structure edits. */
    public readonly maskedRanges: readonly SourceRange[],
    /** The host snapshot this projection was derived from. */
    public readonly sourceSnapshot: ts.IScriptSnapshot,
  ) {}

  public getText(start: number, end: number): string {
    return this.projectedText.slice(start, end);
  }

  public getLength(): number {
    return this.projectedText.length;
  }

  public getChangeRange(oldSnapshot: ts.IScriptSnapshot): ts.TextChangeRange | undefined {
    if (!(oldSnapshot instanceof ProjectedSnapshot)) {
      return undefined;
    }
    // A macro-structure edit can alter text anywhere, so the source delta no
    // longer describes the projection. Force a full reparse.
    if (!sameMaskedRanges(oldSnapshot.maskedRanges, this.maskedRanges)) {
      return undefined;
    }
    // Offsets are identical between source and projection, so the host's own
    // change range applies to the projected text unchanged.
    return this.sourceSnapshot.getChangeRange(oldSnapshot.sourceSnapshot);
  }
}

function sameMaskedRanges(
  left: readonly SourceRange[],
  right: readonly SourceRange[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]!.start !== right[index]!.start || left[index]!.end !== right[index]!.end) {
      return false;
    }
  }
  return true;
}

interface ProjectionCacheEntry {
  readonly sourceSnapshot: ts.IScriptSnapshot;
  readonly sourceText: string;
  readonly profileVersion: string;
  /**
   * The projected snapshot, or `undefined` when the file contains no directives
   * and is passed through. Caching that verdict matters: generated `.d.ts` files
   * can be tens of megabytes, and re-scanning one on every request costs far
   * more than the projection it would produce.
   */
  readonly snapshot: ProjectedSnapshot | undefined;
}

interface HostProjectionState {
  options: HostProjectionOptions;
  readonly projectionCache: Map<string, ProjectionCacheEntry>;
}

/**
 * TypeScript can enable plugins again on the same configured-project host when
 * tsconfig.json is reloaded. Keep exactly one projection layer per host so
 * reloads do not nest wrappers or retain duplicate full-file caches.
 */
const wrappedHosts = new WeakMap<object, HostProjectionState>();

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
 * Projections are memoized per file against the host snapshot identity and the
 * Profile version, so repeated reads of an unchanged file do not re-scan it.
 * Files containing no directives are passed through untouched, which keeps
 * large generated `.d.ts` files on TypeScript's own fast paths.
 *
 * `getScriptVersion` gains the Profile version so tsserver never reuses an AST
 * built for a different Profile. Non-macro files, and all files while no Profile
 * is selected, pass through unchanged.
 *
 * The `ts` module is injected (tsserver supplies it to the plugin) so this
 * wrapper is testable without a global TypeScript dependency.
 */
export function wrapHostWithProjection<THost extends ts.LanguageServiceHost>(
  // Retained for API compatibility and future use; projection no longer needs
  // to build snapshots through the TypeScript module.
  _typescript: typeof ts,
  host: THost,
  options: HostProjectionOptions,
): THost {
  const existing = wrappedHosts.get(host);
  if (existing !== undefined) {
    existing.options = options;
    existing.projectionCache.clear();
    return host;
  }

  const originalGetScriptSnapshot = host.getScriptSnapshot.bind(host);
  const originalGetScriptVersion = host.getScriptVersion.bind(host);
  const state: HostProjectionState = {
    options,
    projectionCache: new Map<string, ProjectionCacheEntry>(),
  };
  wrappedHosts.set(host, state);

  host.getScriptSnapshot = (fileName: string): ts.IScriptSnapshot | undefined => {
    const snapshot = originalGetScriptSnapshot(fileName);
    const profile = state.options.getProfile();
    const isMacroFile =
      state.options.isMacroFile ?? ((candidate: string) => macroExtensionPattern.test(candidate));
    if (snapshot === undefined || profile === undefined || !isMacroFile(fileName)) {
      return snapshot;
    }

    // Reuse the previous projection when neither the file content nor the
    // Profile changed. tsserver requests the same snapshot repeatedly while
    // serving one request, and re-scanning a multi-megabyte file each time is
    // pure overhead. The snapshot identity check is the cheap path; hosts that
    // rebuild snapshot objects per call still hit the cache via content.
    const cached = state.projectionCache.get(fileName);
    if (cached !== undefined && cached.profileVersion === profile.version) {
      if (cached.sourceSnapshot === snapshot) {
        return cached.snapshot ?? snapshot;
      }
      if (
        snapshot.getLength() === cached.sourceText.length
        && snapshot.getText(0, snapshot.getLength()) === cached.sourceText
      ) {
        return cached.snapshot ?? snapshot;
      }
    }

    // Read the entire current file; directive pairing spans the whole file and
    // cannot be evaluated from an isolated slice.
    const source = snapshot.getText(0, snapshot.getLength());
    const projection = projectSource(source, profile.definitions);
    const projected = projection.maskedRanges.length === 0
      // Nothing is masked, so the projection is the source. Returning the host
      // snapshot preserves its change range and avoids copying the text.
      ? undefined
      : new ProjectedSnapshot(projection.projectedText, projection.maskedRanges, snapshot);
    state.projectionCache.set(fileName, {
      sourceSnapshot: snapshot,
      sourceText: source,
      profileVersion: profile.version,
      snapshot: projected,
    });
    return projected ?? snapshot;
  };

  host.getScriptVersion = (fileName: string): string => {
    const version = originalGetScriptVersion(fileName);
    const profile = state.options.getProfile();
    const isMacroFile =
      state.options.isMacroFile ?? ((candidate: string) => macroExtensionPattern.test(candidate));
    if (profile === undefined || !isMacroFile(fileName)) {
      return version;
    }
    return `${version}|tsifdef:${profile.version}`;
  };

  return host;
}

/** Release cached source text when the owning language service is disposed. */
export function releaseHostProjection(host: ts.LanguageServiceHost): void {
  const state = wrappedHosts.get(host);
  if (state === undefined) return;
  state.projectionCache.clear();
  state.options = { getProfile: () => undefined };
}
