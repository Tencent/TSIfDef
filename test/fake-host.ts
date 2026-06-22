import {
  type DecorationType,
  type DiagnosticCollection,
  type Disposable,
  type DocumentDiagnostic,
  type DocumentRange,
  type DocumentSnapshot,
  type ExtensionHost,
  type FoldingRangeProvider,
  type StatusBarItem,
} from "../src/vscode/index.js";

export interface FakeHostOptions {
  readonly root?: string;
  readonly documents?: readonly DocumentSnapshot[];
}

export interface RecordedDecoration {
  ranges: readonly DocumentRange[];
}

/** In-memory ExtensionHost for testing the VSCode shell without the editor. */
export class FakeHost implements ExtensionHost {
  public readonly statusItem: StatusBarItem & { disposed: boolean; shown: boolean };
  public readonly commands = new Map<string, () => unknown | Promise<unknown>>();
  public readonly informationMessages: string[] = [];
  public readonly diagnostics = new Map<string, readonly DocumentDiagnostic[]>();
  public readonly decorations = new Map<string, RecordedDecoration>();
  public readonly errorMessages: string[] = [];
  public readonly typeScriptPluginConfigurations: Array<{
    readonly name: string;
    readonly configuration: Readonly<Record<string, unknown>>;
  }> = [];
  public foldingProvider: FoldingRangeProvider | undefined;
  public diagnosticsCleared = 0;
  public documents: readonly DocumentSnapshot[];
  public projectConfigurationWatcher: (() => void) | undefined;
  private readonly root: string | undefined;
  private diagnosticCollection: (DiagnosticCollection & { disposed: boolean }) | undefined;
  private decorationType: (DecorationType & { disposed: boolean }) | undefined;
  private decorationSequence = 0;

  public constructor(options: FakeHostOptions = {}) {
    this.root = options.root;
    this.documents = options.documents ?? [];
    this.statusItem = {
      text: "",
      tooltip: undefined,
      command: undefined,
      disposed: false,
      shown: false,
      show() {
        this.shown = true;
      },
      hide() {
        this.shown = false;
      },
      dispose() {
        this.disposed = true;
      },
    };
  }

  public createStatusBarItem(): StatusBarItem {
    return this.statusItem;
  }

  public registerCommand(command: string, handler: () => unknown | Promise<unknown>): Disposable {
    this.commands.set(command, handler);
    return { dispose: () => this.commands.delete(command) };
  }

  public showInformationMessage(message: string): void {
    this.informationMessages.push(message);
  }

  public workspaceRoot(): string | undefined {
    return this.root;
  }

  public createDiagnosticCollection(): DiagnosticCollection {
    const self = this;
    this.diagnosticCollection = {
      disposed: false,
      set(uri, diagnostics) {
        self.diagnostics.set(uri, diagnostics);
      },
      delete(uri) {
        self.diagnostics.delete(uri);
      },
      clear() {
        self.diagnostics.clear();
        self.diagnosticsCleared += 1;
      },
      dispose() {
        this.disposed = true;
      },
    };
    return this.diagnosticCollection;
  }

  public createInactiveDecorationType(): DecorationType {
    this.decorationType = {
      key: `inactive-${(this.decorationSequence += 1)}`,
      disposed: false,
      dispose() {
        this.disposed = true;
      },
    };
    return this.decorationType;
  }

  public setDecorations(
    uri: string,
    _decoration: DecorationType,
    ranges: readonly DocumentRange[],
  ): void {
    this.decorations.set(uri, { ranges });
  }

  public macroDocuments(): readonly DocumentSnapshot[] {
    return this.documents;
  }

  public registerFoldingRangeProvider(provider: FoldingRangeProvider): Disposable {
    this.foldingProvider = provider;
    return {
      dispose: () => {
        this.foldingProvider = undefined;
      },
    };
  }

  public showErrorMessage(message: string): void {
    this.errorMessages.push(message);
  }

  public configureTypeScriptPlugin(
    name: string,
    configuration: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    this.typeScriptPluginConfigurations.push({ name, configuration });
    return Promise.resolve();
  }

  public get diagnosticCollectionDisposed(): boolean {
    return this.diagnosticCollection?.disposed ?? false;
  }

  public get decorationTypeDisposed(): boolean {
    return this.decorationType?.disposed ?? false;
  }

  public watchProjectConfiguration(onChange: () => void): Disposable {
    this.projectConfigurationWatcher = onChange;
    return { dispose: () => { this.projectConfigurationWatcher = undefined; } };
  }
}

/** Build a macro DocumentSnapshot from static text. */
export function macroDocument(uri: string, text: string): DocumentSnapshot {
  return { uri, isMacroDocument: true, getText: () => text };
}
