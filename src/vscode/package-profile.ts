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

import { discoverProjectConfiguration, loadProfileFile } from "../cli/config.js";
import type { MacroDefinitions } from "../core/expression.js";
import type { Disposable, ExtensionHost } from "./host.js";
import { ProfileStateController } from "./profile-state.js";

/** Coalesce watcher bursts (atomic writes fire several events) into one reload. */
const RELOAD_DEBOUNCE_MS = 150;
/** Retries for a transient read miss while an atomic write swaps the file in. */
const READ_RETRIES = 5;
const READ_RETRY_DELAY_MS = 60;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Watches the package-owned Profile pointer and synchronizes all editor consumers. */
export class PackageProfileController implements Disposable {
  private watcher: Disposable | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly host: ExtensionHost,
    private readonly state: ProfileStateController,
    private readonly onDefinitions: (definitions: MacroDefinitions | undefined) => void,
  ) {}

  public activate(): void {
    // Debounce watcher events: an atomic write (temp file + rename) emits a
    // burst, and reacting to each one caused a reload/refresh storm.
    this.watcher = this.host.watchProjectConfiguration(() => this.scheduleReload());
    void this.reload();
  }

  public dispose(): void {
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.watcher?.dispose();
    this.watcher = undefined;
  }

  private scheduleReload(): void {
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.reload();
    }, RELOAD_DEBOUNCE_MS);
  }

  public async reload(): Promise<void> {
    const root = this.host.workspaceRoot();
    if (root === undefined) {
      this.onDefinitions(undefined);
      this.state.setProfile(undefined);
      await this.host.configureTypeScriptPlugin("tsifdef-tsserver", {});
      return;
    }
    let profilePath: string | undefined;
    try {
      const configuration = await discoverProjectConfiguration(root);
      if (configuration === undefined) {
        this.onDefinitions(undefined);
        this.state.setProfile(undefined);
        await this.host.configureTypeScriptPlugin("tsifdef-tsserver", {});
        return;
      }
      profilePath = configuration.profilePath;
      const profile = await this.loadProfileWithRetry(profilePath);
      this.onDefinitions(profile.definitions);
      this.state.setProfile(profilePath);
      // A token that changes with the Profile's content. The pointer path is
      // stable across edits, so without it the TypeScript extension may treat
      // successive configurePlugin calls as identical and never forward them to
      // the plugin. The plugin re-reads and re-versions on every such call, so
      // the projection follows the Profile; open files refresh on next focus.
      await this.host.configureTypeScriptPlugin("tsifdef-tsserver", {
        profileFile: profilePath,
        profileToken: profileToken(profile.definitions),
      });
    } catch (error) {
      this.onDefinitions(undefined);
      const message = `Failed to load TSIfDef project configuration${profilePath === undefined ? "" : ` '${profilePath}'`}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.state.setProfile(profilePath, message);
      await this.host.configureTypeScriptPlugin("tsifdef-tsserver", {});
      this.host.showErrorMessage(message);
    }
  }

  /**
   * Load the Profile, retrying a few times on a transient failure. An atomic
   * writer (temp file + rename) briefly leaves the path missing; reacting to
   * that momentary miss made the Profile flap to "none" and back, restarting
   * the server in a loop.
   */
  private async loadProfileWithRetry(profilePath: string): Promise<{ definitions: MacroDefinitions }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= READ_RETRIES; attempt += 1) {
      try {
        return await loadProfileFile(profilePath);
      } catch (error) {
        lastError = error;
        if (attempt < READ_RETRIES) await delay(READ_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }
}

/** A stable token that changes whenever the enabled macro set changes. */
function profileToken(definitions: MacroDefinitions): string {
  const names = Object.keys(definitions).sort().join(",");
  let hash = 2166136261;
  for (let index = 0; index < names.length; index += 1) {
    hash ^= names.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
