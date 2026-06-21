import {
  checkProject,
  emitProject,
  watchProfile,
  EmitDiagnosticsError,
  type CheckDiagnostic,
  type EmitResult,
  type WatchHandle,
} from "../cli/index.js";
import type { MacroDefinitions } from "../core/expression.js";
import type { Disposable, ExtensionHost } from "./host.js";

/** Command identifiers contributed by the extension for local CLI actions. */
export const emitCommand = "tsifdef.emit" as const;
export const checkCommand = "tsifdef.check" as const;
export const watchCommand = "tsifdef.watch" as const;
export const stopWatchCommand = "tsifdef.stopWatch" as const;

/**
 * The CLI surface the command controller drives. Defaults bind to the real
 * `emitProject`/`checkProject`/`watchProfile`; tests inject fakes so the
 * controller logic runs without touching the filesystem.
 */
export interface CliRunner {
  emit(options: {
    projectRoot: string;
    profileName: string;
    definitions: MacroDefinitions;
  }): Promise<EmitResult>;
  check(options: {
    projectRoot: string;
    profileName: string;
    definitions: MacroDefinitions;
  }): Promise<readonly CheckDiagnostic[]>;
  watch(options: {
    projectRoot: string;
    profileName: string;
    configPath: string;
    onResult: (error: unknown, result?: EmitResult) => void;
  }): Promise<WatchHandle>;
}

/** The workspace and Profile context a command runs against. */
export interface CommandContext {
  readonly projectRoot: string | undefined;
  readonly profileName: string | undefined;
  readonly configPath: string | undefined;
  readonly definitions: MacroDefinitions | undefined;
}

export type CommandContextProvider = () => CommandContext;

const defaultRunner: CliRunner = {
  emit: (options) =>
    emitProject({
      projectRoot: options.projectRoot,
      profileName: options.profileName,
      definitions: options.definitions,
    }),
  check: (options) =>
    checkProject({
      projectRoot: options.projectRoot,
      profiles: [{ name: options.profileName, definitions: options.definitions }],
    }),
  watch: (options) =>
    watchProfile({
      projectRoot: options.projectRoot,
      profileName: options.profileName,
      configPath: options.configPath,
      macroConfigVersion: "1",
      onResult: options.onResult,
    }),
};

/**
 * Registers the local emit/check/watch commands and drives the existing CLI
 * entry points. It depends only on the injected host and CLI runner, so its
 * behavior is testable without the VSCode extension host.
 */
export class MacroCommandController {
  private readonly disposables: Disposable[] = [];
  private watchHandle: WatchHandle | undefined;

  public constructor(
    private readonly host: ExtensionHost,
    private readonly context: CommandContextProvider,
    private readonly runner: CliRunner = defaultRunner,
  ) {}

  public activate(): void {
    this.disposables.push(
      this.host.registerCommand(emitCommand, () => this.emit()),
      this.host.registerCommand(checkCommand, () => this.check()),
      this.host.registerCommand(watchCommand, () => this.watch()),
      this.host.registerCommand(stopWatchCommand, () => this.stopWatch()),
    );
  }

  public dispose(): void {
    this.stopWatch();
    for (const disposable of this.disposables.splice(0).reverse()) {
      disposable.dispose();
    }
  }

  public async emit(): Promise<void> {
    const ready = this.requireContext();
    if (ready === undefined) {
      return;
    }
    try {
      const result = await this.runner.emit({
        projectRoot: ready.projectRoot,
        profileName: ready.profileName,
        definitions: ready.definitions,
      });
      this.host.showInformationMessage(
        `TSIfDef emitted ${result.files.length} file(s) for ${ready.profileName}.`,
      );
    } catch (error) {
      this.reportFailure("emit", error);
    }
  }

  public async check(): Promise<void> {
    const ready = this.requireContext();
    if (ready === undefined) {
      return;
    }
    try {
      const diagnostics = await this.runner.check({
        projectRoot: ready.projectRoot,
        profileName: ready.profileName,
        definitions: ready.definitions,
      });
      if (diagnostics.length === 0) {
        this.host.showInformationMessage(`TSIfDef check passed for ${ready.profileName}.`);
      } else {
        this.host.showErrorMessage(
          `TSIfDef check found ${diagnostics.length} macro diagnostic(s) for ${ready.profileName}.`,
        );
      }
    } catch (error) {
      this.reportFailure("check", error);
    }
  }

  public async watch(): Promise<void> {
    const ready = this.requireContext();
    if (ready === undefined || ready.configPath === undefined) {
      if (ready !== undefined) {
        this.host.showErrorMessage("TSIfDef watch needs the project tsifdef configuration path.");
      }
      return;
    }
    this.stopWatch();
    try {
      this.watchHandle = await this.runner.watch({
        projectRoot: ready.projectRoot,
        profileName: ready.profileName,
        configPath: ready.configPath,
        onResult: (error, result) => {
          if (error !== undefined) {
            this.reportFailure("watch", error);
          } else if (result !== undefined) {
            this.host.showInformationMessage(
              `TSIfDef watch emitted ${result.files.length} file(s).`,
            );
          }
        },
      });
      this.host.showInformationMessage(`TSIfDef watching ${ready.profileName}.`);
    } catch (error) {
      this.reportFailure("watch", error);
    }
  }

  public stopWatch(): void {
    if (this.watchHandle !== undefined) {
      this.watchHandle.close();
      this.watchHandle = undefined;
      this.host.showInformationMessage("TSIfDef watch stopped.");
    }
  }

  /** Resolve a fully-specified context or report what is missing. */
  private requireContext():
    | { projectRoot: string; profileName: string; configPath: string | undefined; definitions: MacroDefinitions }
    | undefined {
    const { projectRoot, profileName, configPath, definitions } = this.context();
    if (projectRoot === undefined) {
      this.host.showErrorMessage("TSIfDef needs an open workspace folder.");
      return undefined;
    }
    if (profileName === undefined || definitions === undefined) {
      this.host.showErrorMessage("TSIfDef has no profile selected. Switch a profile first.");
      return undefined;
    }
    return { projectRoot, profileName, configPath, definitions };
  }

  private reportFailure(action: string, error: unknown): void {
    if (error instanceof EmitDiagnosticsError) {
      this.host.showErrorMessage(
        `TSIfDef ${action} found macro diagnostics in ${error.files.length} file(s).`,
      );
      return;
    }
    this.host.showErrorMessage(
      `TSIfDef ${action} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
