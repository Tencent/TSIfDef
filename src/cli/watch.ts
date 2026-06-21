import { watch as watchFs } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { emitProject, type EmitResult } from "./emit.js";
import { loadTsIfDefConfig, profileFromConfig } from "./config.js";

export interface WatchOptions {
  readonly projectRoot: string;
  readonly sourceRoot?: string;
  readonly profileName: string;
  readonly configPath: string;
  readonly macroConfigVersion: string;
  readonly onResult?: (error: unknown, result?: EmitResult) => void;
  readonly subscribe?: WatchSubscribe;
}

export interface WatchSubscription {
  close(): void;
}

export type WatchSubscribe = (
  path: string,
  recursive: boolean,
  onChange: (fileName?: string) => void,
) => WatchSubscription;

export interface WatchHandle {
  readonly rebuilder: WatchRebuilder;
  close(): void;
}

/** Serialize rebuilds and collapse any number of changes received while busy. */
export class WatchRebuilder {
  private pending = false;
  private running = false;
  private readonly idleWaiters: Array<() => void> = [];

  public constructor(
    private readonly task: () => Promise<void>,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  public trigger(): void {
    this.pending = true;
    if (!this.running) {
      void this.drain();
    }
  }

  public async waitForIdle(): Promise<void> {
    if (!this.running && !this.pending) {
      return;
    }
    await new Promise<void>((resolveIdle) => this.idleWaiters.push(resolveIdle));
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.pending) {
      this.pending = false;
      try {
        await this.task();
      } catch (error) {
        this.onError(error);
      }
    }
    this.running = false;
    for (const resolveIdle of this.idleWaiters.splice(0)) {
      resolveIdle();
    }
  }
}

/** Perform an initial cached emit, then watch source and profile changes. */
export async function watchProfile(options: WatchOptions): Promise<WatchHandle> {
  const projectRoot = resolve(options.projectRoot);
  const sourceRoot = resolve(projectRoot, options.sourceRoot ?? ".");
  const rebuild = async (): Promise<void> => {
    const definitions = profileFromConfig(
      await loadTsIfDefConfig(projectRoot),
      options.profileName,
    ).definitions;
    const result = await emitProject({
      projectRoot,
      ...(options.sourceRoot === undefined ? {} : { sourceRoot: options.sourceRoot }),
      profileName: options.profileName,
      definitions,
      cache: { macroConfigVersion: options.macroConfigVersion },
    });
    options.onResult?.(undefined, result);
  };
  await rebuild();

  const rebuilder = new WatchRebuilder(rebuild, (error) => options.onResult?.(error));
  const subscribe = options.subscribe ?? defaultSubscribe;
  const watchers: WatchSubscription[] = [];
  watchers.push(subscribe(sourceRoot, true, (fileName) => {
    const changed = fileName?.replace(/\\/g, "/");
    const generated = relative(sourceRoot, resolve(projectRoot, "Build", ".macrobuild"))
      .replace(/\\/g, "/");
    if (changed !== undefined && (changed === generated || changed.startsWith(`${generated}/`))) {
      return;
    }
    rebuilder.trigger();
  }));
  const profileRelative = relative(sourceRoot, resolve(options.configPath));
  const profileIsInsideSource =
    profileRelative === "" || (!profileRelative.startsWith("..") && !isAbsolute(profileRelative));
  if (!profileIsInsideSource) {
    watchers.push(subscribe(dirname(options.configPath), false, () => rebuilder.trigger()));
  }

  return {
    rebuilder,
    close: () => watchers.forEach((watcher) => watcher.close()),
  };
}

function defaultSubscribe(
  path: string,
  recursive: boolean,
  onChange: (fileName?: string) => void,
): WatchSubscription {
  return watchFs(path, { recursive }, (_event, fileName) =>
    onChange(fileName?.toString()));
}
