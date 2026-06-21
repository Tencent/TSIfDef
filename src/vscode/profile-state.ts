import { selectProfile, ProfileSelectionError, type ProfileSelectionSource } from "../cli/profile.js";
import { discoverProfileNames } from "../cli/check.js";
import type { Disposable, ExtensionHost, StatusBarItem } from "./host.js";

/** Configuration section and command identifiers contributed by the extension. */
export const configurationSection = "tsifdef" as const;
export const profileConfigurationKey = "profile" as const;
export const switchProfileCommand = "tsifdef.switchProfile" as const;

/** Human-readable label for each selection source, shown in the status-bar tooltip. */
const sourceLabels: Readonly<Record<ProfileSelectionSource, string>> = {
  cli: "CLI",
  environment: "HOK_TS_PROFILE",
  vscode: "VSCode setting",
  junction: "Junction inference",
};

export interface EffectiveProfile {
  readonly profile: string | undefined;
  readonly source: ProfileSelectionSource | undefined;
}

/**
 * Owns the status-bar Profile indicator and the switch-Profile flow.
 *
 * It resolves the effective Profile through the shared core `selectProfile`
 * precedence so the editor, CLI, and CI agree, and never reads the real
 * `vscode` module directly.
 */
export class ProfileStateController {
  private statusItem: StatusBarItem | undefined;
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly host: ExtensionHost,
    private readonly environment: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  /** Create the status-bar item, register the switch command, and render once. */
  public activate(): void {
    this.statusItem = this.host.createStatusBarItem();
    this.statusItem.command = switchProfileCommand;
    this.disposables.push(this.statusItem);
    this.disposables.push(
      this.host.registerCommand(switchProfileCommand, () => this.switchProfile()),
    );
    this.refresh();
    this.statusItem.show();
  }

  /** Dispose the status-bar item and the registered command. */
  public dispose(): void {
    for (const disposable of this.disposables.splice(0).reverse()) {
      disposable.dispose();
    }
    this.statusItem = undefined;
  }

  /** Resolve the effective Profile without throwing when none is selected. */
  public effectiveProfile(): EffectiveProfile {
    const configured = this.host.getConfiguration(configurationSection).get<string>(profileConfigurationKey);
    try {
      const selection = selectProfile({
        environment: this.environment,
        ...(configured === undefined ? {} : { vscodeProfile: configured }),
      });
      return { profile: selection.profile, source: selection.source };
    } catch (error) {
      if (error instanceof ProfileSelectionError) {
        return { profile: undefined, source: undefined };
      }
      throw error;
    }
  }

  /** Recompute and render the status-bar text and tooltip. */
  public refresh(): void {
    if (this.statusItem === undefined) {
      return;
    }
    const { profile, source } = this.effectiveProfile();
    if (profile === undefined) {
      this.statusItem.text = "$(versions) TSIfDef: none";
      this.statusItem.tooltip = "No TSIfDef profile selected. Click to choose one.";
      return;
    }
    this.statusItem.text = `$(versions) TSIfDef: ${profile}`;
    this.statusItem.tooltip = `TSIfDef profile '${profile}' from ${sourceLabels[source ?? "vscode"]}. Click to switch.`;
  }

  /** Offer discovered profiles and persist the chosen one to VSCode configuration. */
  public async switchProfile(): Promise<void> {
    const root = this.host.workspaceRoot();
    const names = root === undefined ? [] : await discoverProfileNames(root);
    if (names.length === 0) {
      this.host.showInformationMessage("No TSIfDef profiles found under Build/macros.");
      return;
    }
    const current = this.effectiveProfile().profile;
    const picked = await this.host.showQuickPick(
      names.map((name) => ({
        label: name,
        ...(name === current ? { description: "current" } : {}),
      })),
      { placeHolder: "Select a TSIfDef profile" },
    );
    if (picked === undefined) {
      return;
    }
    await this.host.getConfiguration(configurationSection).update(profileConfigurationKey, picked.label);
    this.refresh();
  }
}
