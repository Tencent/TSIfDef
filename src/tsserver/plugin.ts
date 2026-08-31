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

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type * as ts from "typescript";

import { parseProfileFile } from "../cli/config.js";
import { wrapHostWithProjection } from "./host-projection.js";
import { ProfileProjectionController, type ProfileResolution } from "./project-controller.js";

/** Plugin configuration accepted from the `tsconfig.json` plugins entry. */
interface PluginConfig {
  readonly profileFile?: string;
}

/**
 * tsserver plugin entry. tsserver calls this with the live `typescript` module
 * and, per project, invokes `create(info)` to let the plugin wrap the language
 * service host.
 *
 * The plugin resolves one externally selected, read-only Profile and projects
 * every macro file's snapshot through the shared core. It returns the original
 * language service unchanged; only the host's view of the source is altered.
 */
function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const typescript = modules.typescript;
  let externalConfig: PluginConfig = {};
  const reloaders = new Set<() => void>();
  return {
    create(info: ts.server.PluginCreateInfo): ts.LanguageService {
      const projectConfig = (info.config ?? {}) as PluginConfig;
      const config = (): PluginConfig => ({ ...projectConfig, ...externalConfig });
      const profilePath = (): string | undefined => resolveProfilePath(config(), info);
      const log = (message: string): void => info.project.projectService.logger.info(message);

      const controller = new ProfileProjectionController({
        resolve: () => resolveProfile(profilePath(), log),
        log,
      });
      const reloader = (): void => {
        controller.reload();
      };
      reloaders.add(reloader);

      wrapHostWithProjection(typescript, info.languageServiceHost, {
        getProfile: () => controller.getProfile(),
      });

      // Keep the in-process Profile current. The VSCode extension reloads
      // TypeScript projects after a semantic Profile change.
      const selectedPath = profilePath();
      const configWatcher =
        selectedPath === undefined
          ? undefined
          : watchConfigDirectory(info, selectedPath, reloader);

      // Drop this project's reloader when its language service is disposed so
      // stale controllers/watchers do not accumulate and reload on every change.
      const languageService = info.languageService;
      const originalDispose = languageService.dispose.bind(languageService);
      languageService.dispose = (): void => {
        reloaders.delete(reloader);
        configWatcher?.close();
        originalDispose();
      };

      return languageService;
    },
    onConfigurationChanged(config: PluginConfig): void {
      externalConfig = config ?? {};
      for (const reload of reloaders) {
        reload();
      }
    },
  };
}

function resolveProfilePath(config: PluginConfig, info: ts.server.PluginCreateInfo): string | undefined {
  const projectName = info.project.getProjectName();
  const projectRoot = projectName ? dirname(projectName) : info.project.getCurrentDirectory();
  const selected = config.profileFile;
  if (selected === undefined || selected.trim() === "") return undefined;
  return isAbsolute(selected) ? selected : join(projectRoot, selected);
}

function resolveProfile(
  profilePath: string | undefined,
  log: (message: string) => void,
): ProfileResolution {
  if (profilePath === undefined) return { kind: "none" };
  let text: string;
  try {
    text = readFileSync(profilePath, "utf8");
  } catch {
    // The file could not be read this instant. An atomic writer (temp + rename)
    // briefly hides it; treat this as transient so the controller keeps the
    // current Profile instead of flapping to none and triggering a reload storm.
    return { kind: "unavailable" };
  }
  try {
    const definitions = parseProfileFile(text, profilePath).definitions;
    // The version ties the AST cache to the Profile name and its content, so
    // editing or switching the Profile produces a new version and invalidation.
    return { kind: "profile", profile: { definitions, version: `${profilePath}:${text.length}:${hashText(text)}` } };
  } catch (error) {
    // A parse failure during an external rewrite is almost always a half-written
    // file (the writer has not finished / renamed yet). Treat it as transient and
    // keep the current Profile rather than flapping to none; the next watcher
    // event re-reads the completed file. A genuinely malformed Profile simply
    // keeps the last good one until it is fixed, which is the safe behavior.
    log(
      `[tsifdef] Profile '${profilePath}' not parseable this read (likely mid-write); keeping current: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { kind: "unavailable" };
  }
}

function watchConfigDirectory(
  info: ts.server.PluginCreateInfo,
  configPath: string,
  onChange: () => void,
): ts.FileWatcher | undefined {
  const serverHost = info.serverHost;
  if (typeof serverHost.watchDirectory !== "function") {
    return undefined;
  }
  return serverHost.watchDirectory(dirname(configPath), () => onChange(), /* recursive */ false);
}

/** Small deterministic content hash; only used for AST-cache versioning. */
function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export = init;
