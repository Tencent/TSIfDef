import { type FSWatcher, readFileSync, watch as fsWatch } from "node:fs";
import { resolve } from "node:path";

import { projectSource, type MacroDiagnostic } from "../core/index.js";
import { restoreInlineSourcesFor } from "./build.js";
import { loadProfileFile, type ProfileFile } from "./config.js";
import { decodeTypeScriptText } from "./source-files.js";

export interface WatchBuildInfo {
  /** Absolute paths written by the latest emit, sorted. */
  readonly outputFiles: readonly string[];
  /** Files whose macro structure is invalid this build; emit is skipped for them. */
  readonly macroDiagnostics: ReadonlyMap<string, readonly MacroDiagnostic[]>;
  readonly hasErrors: boolean;
}

export interface WatchOptions {
  readonly projectRoot: string;
  readonly project: string;
  /** Path to the Profile file (already resolved from the package pointer). */
  readonly profilePath: string;
  /** Called after each compilation finishes (initial build and every rebuild). */
  readonly onBuild?: (info: WatchBuildInfo) => void;
  /** Called after the Profile file changes and the WatchProgram is rebuilt. */
  readonly onProfileReload?: (profile: ProfileFile) => void;
}

export interface WatchHandle {
  close(): void;
}

const macroFilePattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;

/**
 * Watch mode for projected compilation. A `createWatchCompilerHost` drives
 * incremental rebuilds with the same equal-length masking as one-shot builds.
 * The Profile file is watched separately; any change tears down the current
 * WatchProgram and rebuilds it in full under the new Profile (SPEC §8.2).
 */
export async function watchProject(options: WatchOptions): Promise<WatchHandle> {
  const ts = (await import("typescript")).default;
  const projectRoot = resolve(options.projectRoot);
  const configPath = resolve(projectRoot, options.project);

  let currentWatch: { close(): void } | undefined;
  let profileWatcher: FSWatcher | undefined;
  let reloadTimer: NodeJS.Timeout | undefined;
  let closed = false;

  const startWatchProgram = (definitions: ProfileFile["definitions"]): { close(): void } => {
    const macroDiagnostics = new Map<string, readonly MacroDiagnostic[]>();
    const readProjected = (fileName: string): string | undefined => {
      if (!macroFilePattern.test(fileName)) return ts.sys.readFile(fileName);
      const absolute = resolve(fileName);
      let bytes: Buffer;
      try {
        bytes = readFileSync(absolute);
      } catch {
        macroDiagnostics.delete(absolute);
        return undefined;
      }
      const result = projectSource(decodeTypeScriptText(bytes), definitions);
      if (result.diagnostics.length > 0) macroDiagnostics.set(absolute, result.diagnostics);
      else macroDiagnostics.delete(absolute);
      return result.projectedText;
    };

    const host = ts.createWatchCompilerHost(
      configPath,
      undefined,
      ts.sys,
      ts.createEmitAndSemanticDiagnosticsBuilderProgram,
      (diagnostic) => {
        process.stderr.write(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine)}${ts.sys.newLine}`);
      },
      () => {
        // Suppress the periodic "watching for changes" status lines.
      },
    );

    const originalRead = host.readFile?.bind(host);
    host.readFile = (fileName, encoding) => {
      const projected = readProjected(fileName);
      if (projected !== undefined) return projected;
      return originalRead?.(fileName, encoding);
    };

    // Take over emit so we can restore inlineSources, collect outputs, and skip
    // emit for files with macro-structure errors without killing the watcher.
    host.afterProgramCreate = (builderProgram) => {
      const compilerOptions = builderProgram.getCompilerOptions();
      const restoreSources = compilerOptions.inlineSources === true;
      const outputFiles: string[] = [];
      const preEmit = ts.getPreEmitDiagnostics(builderProgram.getProgram());
      const hasTypeErrors = preEmit.some((d) => d.category === ts.DiagnosticCategory.Error);
      for (const diagnostic of preEmit) {
        process.stderr.write(ts.formatDiagnosticsWithColorAndContext([diagnostic], diagnosticHost(ts, projectRoot)));
      }
      for (const [file, diagnostics] of macroDiagnostics) {
        for (const diagnostic of diagnostics) {
          process.stderr.write(`${file}:${diagnostic.range.start}: ${diagnostic.message}${ts.sys.newLine}`);
        }
      }

      const blockEmit = macroDiagnostics.size > 0 || (hasTypeErrors && compilerOptions.noEmitOnError === true);
      if (!blockEmit && compilerOptions.noEmit !== true) {
        builderProgram.emit(undefined, (fileName, text, writeByteOrderMark) => {
          const output = restoreSources ? restoreInlineSourcesFor(fileName, text) : text;
          ts.sys.writeFile(fileName, output, writeByteOrderMark);
          outputFiles.push(resolve(fileName));
        });
      }

      outputFiles.sort((left, right) => left.localeCompare(right, "en"));
      options.onBuild?.({
        outputFiles,
        macroDiagnostics: new Map(macroDiagnostics),
        hasErrors: hasTypeErrors || macroDiagnostics.size > 0,
      });
    };

    const watch = ts.createWatchProgram(host);
    return { close: () => watch.close() };
  };

  const reloadProfile = (): void => {
    if (closed) return;
    void loadProfileFile(options.profilePath)
      .then((profile) => {
        if (closed) return;
        currentWatch?.close();
        currentWatch = startWatchProgram(profile.definitions);
        options.onProfileReload?.(profile);
      })
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}${ts.sys.newLine}`);
      });
  };

  const initialProfile = await loadProfileFile(options.profilePath);
  currentWatch = startWatchProgram(initialProfile.definitions);

  // Watch the Profile file itself; tsc never watches non-TypeScript inputs.
  try {
    profileWatcher = fsWatch(options.profilePath, () => {
      if (reloadTimer !== undefined) clearTimeout(reloadTimer);
      // Debounce editor save bursts (write + rename can fire several events).
      reloadTimer = setTimeout(reloadProfile, 50);
    });
  } catch {
    // If the Profile file cannot be watched (e.g. on some platforms), the CLI
    // still watches sources; the user can restart to pick up a Profile change.
  }

  return {
    close: () => {
      closed = true;
      if (reloadTimer !== undefined) clearTimeout(reloadTimer);
      profileWatcher?.close();
      currentWatch?.close();
    },
  };
}

function diagnosticHost(
  ts: typeof import("typescript"),
  projectRoot: string,
): import("typescript").FormatDiagnosticsHost {
  return {
    getCurrentDirectory: () => projectRoot,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => ts.sys.newLine,
  };
}
