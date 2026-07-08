import type { ActiveProfile } from "./host-projection.js";

/** Outcome of resolving the Profile: a value, none configured, or a transient failure. */
export type ProfileResolution =
  | { readonly kind: "profile"; readonly profile: ActiveProfile }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" };

/**
 * Hooks the controller depends on. Injecting them keeps Profile reload and
 * project invalidation testable without a live tsserver project.
 */
export interface ProjectControllerHooks {
  /**
   * Re-resolve the active Profile. Return `{kind:"profile"}` with the loaded
   * Profile, `{kind:"none"}` when no Profile is configured, or
   * `{kind:"unavailable"}` when the file could not be read this instant (an
   * atomic write may briefly hide it). On `unavailable` the controller keeps the
   * current Profile rather than flapping to none.
   */
  resolve: () => ProfileResolution;
  /** Mark the project dirty so tsserver re-projects and rebuilds affected ASTs. */
  markDirty: () => void;
  /** Optional progress/diagnostic logging. */
  log?: (message: string) => void;
}

/**
 * Owns the current Profile for one project and invalidates the project only
 * when the resolved Profile version actually changes.
 *
 * The host wrapper reads `getProfile()` live on every snapshot/version request,
 * so a reload that changes the version makes tsserver observe new script
 * versions and rebuild. Reloading to the same version is a no-op, avoiding
 * needless rebuilds.
 */
export class ProfileProjectionController {
  private current: ActiveProfile | undefined;

  public constructor(private readonly hooks: ProjectControllerHooks) {
    const initial = hooks.resolve();
    this.current = initial.kind === "profile" ? initial.profile : undefined;
    this.hooks.log?.(`[tsifdef] initial profile ${describe(this.current)}.`);
  }

  /** The active Profile read live by the host wrapper. */
  public getProfile(): ActiveProfile | undefined {
    return this.current;
  }

  /**
   * Re-resolve the Profile. If its version (or its presence) changed, swap it in
   * and mark the project dirty. A transient read failure keeps the current
   * Profile so a momentary miss during an atomic write does not flap the state.
   * Returns whether anything changed.
   */
  public reload(): boolean {
    const resolution = this.hooks.resolve();
    if (resolution.kind === "unavailable") {
      return false;
    }
    const next = resolution.kind === "profile" ? resolution.profile : undefined;
    if (sameProfile(this.current, next)) {
      return false;
    }
    this.hooks.log?.(
      `[tsifdef] profile changed ${describe(this.current)} -> ${describe(next)}; invalidating project.`,
    );
    this.current = next;
    this.hooks.markDirty();
    return true;
  }
}

function sameProfile(left: ActiveProfile | undefined, right: ActiveProfile | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.version === right.version;
}

function describe(profile: ActiveProfile | undefined): string {
  return profile === undefined ? "(none)" : `'${profile.version}'`;
}
