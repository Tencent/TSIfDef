import { loadProfileFile, loadProjectConfiguration } from "../cli/config.js";
import type { MacroDefinitions } from "../core/expression.js";
import type { Disposable, ExtensionHost } from "./host.js";
import { ProfileStateController } from "./profile-state.js";

/** Watches the package-owned Profile pointer and synchronizes all editor consumers. */
export class PackageProfileController implements Disposable {
  private watcher: Disposable | undefined;

  public constructor(
    private readonly host: ExtensionHost,
    private readonly state: ProfileStateController,
    private readonly onDefinitions: (definitions: MacroDefinitions | undefined) => void,
  ) {}

  public activate(): void {
    this.watcher = this.host.watchProjectConfiguration(() => void this.reload());
    void this.reload();
  }

  public dispose(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
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
      profilePath = (await loadProjectConfiguration(root)).profilePath;
      const definitions = (await loadProfileFile(profilePath)).definitions;
      this.onDefinitions(definitions);
      this.state.setProfile(profilePath);
      await this.host.configureTypeScriptPlugin("tsifdef-tsserver", { profileFile: profilePath });
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
}
