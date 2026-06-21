import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  activeProfileCommand,
  ProfileStateController,
  switchProfileCommand,
} from "../src/vscode/index.js";
import { FakeHost } from "./fake-host.js";

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

test("shows when the selected profile definitions failed to load", () => {
  const host = new FakeHost({ configuredProfile: "HOK" });
  const controller = new ProfileStateController(host, {});
  controller.activate();

  controller.reportProfileLoad("HOK", "Profile file was not found");

  assert.equal(host.statusItem.text, "$(error) TSIfDef: HOK (unavailable)");
  assert.equal(host.statusItem.tooltip, "Profile file was not found");

  controller.reportProfileLoad("HOK");
  assert.equal(host.statusItem.text, "$(versions) TSIfDef: HOK");
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

test("debug command resolves the selected profile to its canonical file name", async () => {
  await withProfiles(["domestic", "hok"], async (root) => {
    const host = new FakeHost({ root, configuredProfile: "HOK" });
    const controller = new ProfileStateController(host, {});
    controller.activate();

    assert.equal(await host.commands.get(activeProfileCommand)?.(), "hok");
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
