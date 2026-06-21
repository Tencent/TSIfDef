import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ProfileStateController,
  profileConfigurationKey,
  switchProfileCommand,
  type Disposable,
  type ExtensionHost,
  type QuickPickItem,
  type StatusBarItem,
  type WorkspaceConfiguration,
} from "../src/vscode/index.js";

interface FakeHostOptions {
  readonly root?: string;
  readonly configuredProfile?: string;
  readonly pick?: (items: readonly QuickPickItem[]) => QuickPickItem | undefined;
}

class FakeHost implements ExtensionHost {
  public readonly statusItem: StatusBarItem & { disposed: boolean; shown: boolean };
  public readonly commands = new Map<string, () => void | Promise<void>>();
  public readonly informationMessages: string[] = [];
  public quickPickItems: readonly QuickPickItem[] = [];
  private configured: string | undefined;
  private readonly root: string | undefined;
  private readonly pick: (items: readonly QuickPickItem[]) => QuickPickItem | undefined;

  public constructor(options: FakeHostOptions = {}) {
    this.configured = options.configuredProfile;
    this.root = options.root;
    this.pick = options.pick ?? ((items) => items[0]);
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

  public getConfiguration(): WorkspaceConfiguration {
    return {
      get: <T,>(key: string) =>
        (key === profileConfigurationKey ? this.configured : undefined) as T | undefined,
      update: (key: string, value: unknown) => {
        if (key === profileConfigurationKey) {
          this.configured = value as string;
        }
        return Promise.resolve();
      },
    };
  }

  public createStatusBarItem(): StatusBarItem {
    return this.statusItem;
  }

  public registerCommand(command: string, handler: () => void | Promise<void>): Disposable {
    this.commands.set(command, handler);
    return { dispose: () => this.commands.delete(command) };
  }

  public showQuickPick(items: readonly QuickPickItem[]): Promise<QuickPickItem | undefined> {
    this.quickPickItems = items;
    return Promise.resolve(this.pick(items));
  }

  public showInformationMessage(message: string): void {
    this.informationMessages.push(message);
  }

  public workspaceRoot(): string | undefined {
    return this.root;
  }
}

async function withProfiles(
  names: readonly string[],
  callback: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-vscode-"));
  try {
    if (names.length > 0) {
      await mkdir(join(root, "Build", "macros"), { recursive: true });
      for (const name of names) {
        await writeFile(join(root, "Build", "macros", `${name}.json`), "{}", "utf8");
      }
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("renders the VSCode-configured profile and its source in the status bar", () => {
  const host = new FakeHost({ configuredProfile: "HOK" });
  const controller = new ProfileStateController(host, {});
  controller.activate();

  assert.equal(host.statusItem.text, "$(versions) TSIfDef: HOK");
  assert.match(host.statusItem.tooltip ?? "", /VSCode setting/);
  assert.equal(host.statusItem.command, switchProfileCommand);
  assert.equal(host.statusItem.shown, true);
  controller.dispose();
});

test("prefers HOK_TS_PROFILE over the VSCode setting", () => {
  const host = new FakeHost({ configuredProfile: "HOK" });
  const controller = new ProfileStateController(host, { HOK_TS_PROFILE: "DOMESTIC" });
  controller.activate();

  assert.equal(host.statusItem.text, "$(versions) TSIfDef: DOMESTIC");
  assert.match(host.statusItem.tooltip ?? "", /HOK_TS_PROFILE/);
  assert.deepEqual(controller.effectiveProfile(), { profile: "DOMESTIC", source: "environment" });
  controller.dispose();
});

test("shows a no-selection state without throwing", () => {
  const host = new FakeHost();
  const controller = new ProfileStateController(host, {});
  controller.activate();

  assert.deepEqual(controller.effectiveProfile(), { profile: undefined, source: undefined });
  assert.equal(host.statusItem.text, "$(versions) TSIfDef: none");
  assert.match(host.statusItem.tooltip ?? "", /No TSIfDef profile selected/);
  controller.dispose();
});

test("switching persists the chosen profile and refreshes the status bar", async () => {
  await withProfiles(["domestic", "hok"], async (root) => {
    const host = new FakeHost({
      root,
      configuredProfile: "hok",
      pick: (items) => items.find((item) => item.label === "domestic"),
    });
    const controller = new ProfileStateController(host, {});
    controller.activate();

    await controller.switchProfile();

    assert.deepEqual(host.quickPickItems.map((item) => item.label), ["domestic", "hok"]);
    assert.equal(host.quickPickItems.find((item) => item.label === "hok")?.description, "current");
    assert.equal(host.statusItem.text, "$(versions) TSIfDef: domestic");
    assert.deepEqual(controller.effectiveProfile(), { profile: "domestic", source: "vscode" });
    controller.dispose();
  });
});

test("a cancelled switch changes nothing", async () => {
  await withProfiles(["hok"], async (root) => {
    const host = new FakeHost({ root, configuredProfile: "hok", pick: () => undefined });
    const controller = new ProfileStateController(host, {});
    controller.activate();

    await controller.switchProfile();

    assert.equal(controller.effectiveProfile().profile, "hok");
    controller.dispose();
  });
});

test("switching reports when no profiles are discovered", async () => {
  await withProfiles([], async (root) => {
    const host = new FakeHost({ root });
    const controller = new ProfileStateController(host, {});
    controller.activate();

    await controller.switchProfile();

    assert.deepEqual(host.informationMessages, ["No TSIfDef profiles found under Build/macros."]);
    controller.dispose();
  });
});

test("registers the switch command and disposes every resource", () => {
  const host = new FakeHost({ configuredProfile: "HOK" });
  const controller = new ProfileStateController(host, {});
  controller.activate();

  assert.equal(host.commands.has(switchProfileCommand), true);
  controller.dispose();
  assert.equal(host.commands.has(switchProfileCommand), false);
  assert.equal(host.statusItem.disposed, true);
});
