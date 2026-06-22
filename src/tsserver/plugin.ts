import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type * as ts from "typescript";

import { parseProfileFile } from "../cli/config.js";
import { wrapHostWithProjection, type ActiveProfile } from "./host-projection.js";
import { ProfileProjectionController } from "./project-controller.js";

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
 * When the Profile file changes, the project is invalidated so tsserver
 * re-projects affected files.
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
        markDirty: () => invalidateProject(info.project),
        log,
      });
      reloaders.add(() => controller.reload());

      wrapHostWithProjection(typescript, info.languageServiceHost, {
        getProfile: () => controller.getProfile(),
      });

      // Reload the Profile when its directory changes so a switch or edit
      // re-projects without restarting the server. If cache refresh proves
      // unstable in practice, the documented fallback is the
      // `TypeScript: Restart TS Server` command.
      const selectedPath = profilePath();
      if (selectedPath !== undefined) watchConfigDirectory(info, selectedPath, () => controller.reload());

      return info.languageService;
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
): ActiveProfile | undefined {
  if (profilePath === undefined) return undefined;
  try {
    const text = readFileSync(profilePath, "utf8");
    const definitions = parseProfileFile(text, profilePath).definitions;
    // The version ties the AST cache to the Profile name and its content, so
    // editing or switching the Profile produces a new version and invalidation.
    return { definitions, version: `${profilePath}:${text.length}:${hashText(text)}` };
  } catch (error) {
    log(
      `[tsifdef] failed to load Profile '${profilePath}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

/** Best-effort project invalidation across tsserver versions. */
function invalidateProject(project: ts.server.Project): void {
  const dirtyable = project as ts.server.Project & { markAsDirty?: () => void };
  dirtyable.markAsDirty?.();
  project.updateGraph();
  project.refreshDiagnostics();
}

function watchConfigDirectory(
  info: ts.server.PluginCreateInfo,
  configPath: string,
  onChange: () => void,
): void {
  const serverHost = info.serverHost;
  if (typeof serverHost.watchDirectory !== "function") {
    return;
  }
  serverHost.watchDirectory(dirname(configPath), () => onChange(), /* recursive */ false);
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
