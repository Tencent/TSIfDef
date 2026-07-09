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

import { basename } from "node:path";

import type { Disposable, ExtensionHost, StatusBarItem } from "./host.js";

export const activeProfileCommand = "tsifdef.activeProfile" as const;

export interface EffectiveProfile {
  readonly profile: string | undefined;
  readonly source: "package.json" | undefined;
}

/** Presents the package-selected Profile; package.json remains the only state source. */
export class ProfileStateController {
  private statusItem: StatusBarItem | undefined;
  private profile: string | undefined;
  private loadError: string | undefined;
  private readonly disposables: Disposable[] = [];

  public constructor(private readonly host: ExtensionHost) {}

  public activate(): void {
    this.statusItem = this.host.createStatusBarItem();
    this.disposables.push(this.statusItem);
    this.disposables.push(this.host.registerCommand(activeProfileCommand, () => this.activeProfilePath()));
    this.refresh();
    this.statusItem.show();
  }

  public dispose(): void {
    for (const disposable of this.disposables.splice(0).reverse()) disposable.dispose();
    this.statusItem = undefined;
  }

  public effectiveProfile(): EffectiveProfile {
    return { profile: this.profile, source: this.profile === undefined ? undefined : "package.json" };
  }

  public setProfile(profile: string | undefined, error?: string): void {
    this.profile = profile;
    this.loadError = error;
    this.refresh();
  }

  public activeProfilePath(): string {
    if (this.profile === undefined) throw new Error("No TSIfDef Profile is selected in package.json.");
    return this.profile;
  }

  private refresh(): void {
    if (this.statusItem === undefined) return;
    if (this.profile === undefined) {
      this.statusItem.text = "$(versions) TSIfDef: none";
      this.statusItem.tooltip = this.loadError ?? "No package.json TSIfDef Profile is available.";
      return;
    }
    if (this.loadError !== undefined) {
      this.statusItem.text = `$(error) TSIfDef: ${basename(this.profile)} (unavailable)`;
      this.statusItem.tooltip = this.loadError;
      return;
    }
    this.statusItem.text = `$(versions) TSIfDef: ${basename(this.profile)}`;
    this.statusItem.tooltip = `TSIfDef Profile '${this.profile}' from package.json.`;
  }
}
