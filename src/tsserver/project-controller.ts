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

import type { ActiveProfile } from "./host-projection.js";

/** Outcome of resolving the Profile: a value, none configured, or a transient failure. */
export type ProfileResolution =
  | { readonly kind: "profile"; readonly profile: ActiveProfile }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" };

/** Hooks used to resolve and log Profile changes. */
export interface ProjectControllerHooks {
  /**
   * Re-resolve the active Profile. Return `{kind:"profile"}` with the loaded
   * Profile, `{kind:"none"}` when no Profile is configured, or
   * `{kind:"unavailable"}` when the file could not be read this instant (an
   * atomic write may briefly hide it). On `unavailable` the controller keeps the
   * current Profile rather than flapping to none.
  */
  resolve: () => ProfileResolution;
  log?: (message: string) => void;
}

/**
 * Owns the current Profile for one project.
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
   * Re-resolve the Profile. A transient read failure keeps the current value.
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
      `[tsifdef] profile changed ${describe(this.current)} -> ${describe(next)}.`,
    );
    this.current = next;
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
