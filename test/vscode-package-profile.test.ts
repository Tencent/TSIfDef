import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PackageProfileController, ProfileStateController } from "../src/vscode/index.js";
import type { MacroDefinitions } from "../src/core/index.js";
import { FakeHost } from "./fake-host.js";

test("package.json Profile changes update status, definitions, and tsserver", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-vscode-package-"));
  try {
    await mkdir(join(root, "Profiles"), { recursive: true });
    const hok = join(root, "Profiles", "HOK.json");
    const domestic = join(root, "Profiles", "Domestic.json");
    await writeFile(hok, "[\"HOK\"]", "utf8");
    await writeFile(domestic, "[\"DOMESTIC\"]", "utf8");
    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profiles/HOK.json" }), "utf8");

    const host = new FakeHost({ root });
    const state = new ProfileStateController(host);
    let definitions: MacroDefinitions | undefined;
    const controller = new PackageProfileController(host, state, (next) => { definitions = next; });
    state.activate();
    controller.activate();
    await controller.reload();
    assert.equal(host.statusItem.text, "$(versions) TSIfDef: HOK.json");
    assert.equal(definitions?.HOK, true);
    assert.deepEqual(host.typeScriptPluginConfigurations.at(-1), {
      name: "tsifdef-tsserver",
      configuration: { profileFile: hok },
    });

    await writeFile(join(root, "package.json"), JSON.stringify({ tsifdef: "./Profiles/Domestic.json" }), "utf8");
    await controller.reload();
    assert.equal(host.statusItem.text, "$(versions) TSIfDef: Domestic.json");
    assert.equal(definitions?.DOMESTIC, true);
    assert.equal(definitions?.HOK, undefined);
    assert.deepEqual(host.typeScriptPluginConfigurations.at(-1)?.configuration, { profileFile: domestic });
    controller.dispose();
    state.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
