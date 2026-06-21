import type { ActiveProfile } from "./host-projection.js";

/**
 * Hooks the controller depends on. Injecting them keeps Profile reload and
 * project invalidation testable without a live tsserver project.
 */
export interface ProjectControllerHooks {
  /** Re-resolve the active Profile (load + version), or `undefined` if none. */
  resolve: () => ActiveProfile | undefined;
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
    this.current = hooks.resolve();
    this.hooks.log?.(`[tsifdef] initial profile ${describe(this.current)}.`);
  }

  /** The active Profile read live by the host wrapper. */
  public getProfile(): ActiveProfile | undefined {
    return this.current;
  }

  /**
   * Re-resolve the Profile. If its version (or its presence) changed, swap it in
   * and mark the project dirty. Returns whether anything changed.
   */
  public reload(): boolean {
    const next = this.hooks.resolve();
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
