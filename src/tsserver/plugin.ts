import { readFileSync } from "node:fs";
import { join } from "node:path";
import type * as ts from "typescript";

import { parseProfileDefinitions, selectProfile } from "../cli/profile.js";
import type { MacroDefinitions } from "../core/expression.js";
import { wrapHostWithProjection } from "./host-projection.js";

/** Plugin configuration accepted from the `tsconfig.json` plugins entry. */
interface PluginConfig {
  readonly profile?: string;
  readonly macrosDir?: string;
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
  return {
    create(info: ts.server.PluginCreateInfo): ts.LanguageService {
      const config = (info.config ?? {}) as PluginConfig;
      const projectRoot = projectDirectory(info);
      const resolved = resolveProfile(config, projectRoot, info);
      if (resolved === undefined) {
        // No Profile selected: leave the language service untouched so the
        // editor still works rather than masking with an arbitrary Profile.
        info.project.projectService.logger.info(
          "[tsifdef] no profile selected; macro projection disabled.",
        );
        return info.languageService;
      }
      wrapHostWithProjection(typescript, info.languageServiceHost, {
        definitions: resolved.definitions,
        profileVersion: resolved.version,
      });
      info.project.projectService.logger.info(
        `[tsifdef] projecting macros for profile '${resolved.name}'.`,
      );
      return info.languageService;
    },
  };
}

function projectDirectory(info: ts.server.PluginCreateInfo): string {
  const configPath = info.project.getProjectName();
  return configPath ? join(configPath, "..") : info.project.getCurrentDirectory();
}

interface ResolvedProfile {
  readonly name: string;
  readonly version: string;
  readonly definitions: MacroDefinitions;
}

function resolveProfile(
  config: PluginConfig,
  projectRoot: string,
  info: ts.server.PluginCreateInfo,
): ResolvedProfile | undefined {
  let name: string;
  try {
    name = selectProfile({
      ...(config.profile === undefined ? {} : { cliProfile: config.profile }),
      environment: process.env,
    }).profile;
  } catch {
    return undefined;
  }
  const macrosDir = config.macrosDir ?? join(projectRoot, "Build", "macros");
  const profilePath = join(macrosDir, `${name.toLowerCase()}.json`);
  try {
    const text = readFileSync(profilePath, "utf8");
    const definitions = parseProfileDefinitions(text, profilePath);
    // The version ties the AST cache to both the Profile name and its content,
    // so editing the Profile file invalidates reuse.
    return { name, version: `${name}:${text.length}:${hashText(text)}`, definitions };
  } catch (error) {
    info.project.projectService.logger.info(
      `[tsifdef] failed to load profile '${name}' from ${profilePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
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
