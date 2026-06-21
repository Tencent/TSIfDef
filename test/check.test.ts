import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkProject, loadAllProfiles } from "../src/cli/index.js";

async function withProject(callback: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-check-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("checks profiles with stable file and one-based locations without writing", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(
      join(root, "source", "main.ts"),
      "const shared = true;\r\n#if HOK\r\n#error HOK blocked\r\n#endif\r\n#if MISSING\r\n#endif\r\n",
      "utf8",
    );
    const diagnostics = await checkProject({
      projectRoot: root,
      sourceRoot: "source",
      profiles: [
        { name: "HOK", definitions: { HOK: true } },
        { name: "domestic", definitions: { HOK: false } },
      ],
    });

    assert.deepEqual(
      diagnostics.map(({ profile, file, line, column, code }) => ({ profile, file, line, column, code })),
      [
        { profile: "HOK", file: "main.ts", line: 3, column: 8, code: "active-error" },
        { profile: "HOK", file: "main.ts", line: 5, column: 5, code: "unknown-macro" },
        { profile: "domestic", file: "main.ts", line: 5, column: 5, code: "unknown-macro" },
      ],
    );
    await assert.rejects(stat(join(root, "Build", ".macrobuild")));
  });
});

test("discovers all JSON profiles deterministically and rejects an empty set", async () => {
  await withProject(async (root) => {
    const profiles = join(root, "Build", "macros");
    await mkdir(profiles, { recursive: true });
    await writeFile(join(profiles, "zeta.json"), "{\"ZETA\":true}", "utf8");
    await writeFile(join(profiles, "Alpha.JSON"), "{\"ALPHA\":true}", "utf8");
    await writeFile(join(profiles, "notes.txt"), "ignored", "utf8");
    assert.deepEqual((await loadAllProfiles(root)).map((profile) => profile.name), ["Alpha", "zeta"]);
  });
  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await assert.rejects(loadAllProfiles(root), /No JSON profiles/);
  });
});

test("packaged check uses stable diagnostic and configuration exit codes", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await mkdir(join(root, "source"), { recursive: true });
    await writeFile(join(root, "Build", "macros", "hok.json"), "{\"HOK\":true}", "utf8");
    await writeFile(join(root, "source", "main.ts"), "#if UNKNOWN\n#endif\n", "utf8");
    const cli = join(process.cwd(), "dist", "cli", "main.js");
    const diagnostics = spawnSync(process.execPath, [cli, "check", "--all", "--source", "source"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(diagnostics.status, 1);
    assert.match(diagnostics.stderr, /\[hok\] main\.ts:1:5 unknown-macro:/);

    const usage = spawnSync(process.execPath, [cli, "check", "--all", "--profile", "HOK"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /mutually exclusive/);

    await writeFile(join(root, "source", "main.ts"), "#if HOK\nconst ok = true;\n#endif\n", "utf8");
    const success = spawnSync(process.execPath, [cli, "check", "--profile", "HOK", "--source", "source"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /Checked 1 profile/);
  });
});
