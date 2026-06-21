import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadPipelineConfig,
  runProfilePipeline,
  tscTypecheckRunner,
  type ProfilePipelineEntry,
  type TypecheckRunner,
} from "../src/cli/index.js";

async function withProject(callback: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-pipeline-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const passingTypecheck: TypecheckRunner = () => Promise.resolve({ errors: [] });

test("pipeline emits then reports passed for a clean profile", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "main.ts"), "#if HOK\nconst ok = 1;\n#endif\n", "utf8");
    let typecheckedProfile: string | undefined;

    const results = await runProfilePipeline({
      projectRoot: root,
      sourceRoot: "src",
      entries: [{ profile: "HOK", tsconfig: "tsconfig.hok.json" }],
      definitionsFor: () => Promise.resolve({ HOK: true }),
      typecheck: (input) => {
        typecheckedProfile = input.profile;
        return Promise.resolve({ errors: [] });
      },
    });

    assert.equal(typecheckedProfile, "HOK");
    assert.deepEqual(results.map((result) => result.status), ["passed"]);
    assert.equal(results[0]!.emittedFiles, 1);
  });
});

test("pipeline reports macro diagnostics and skips typecheck", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "src"), { recursive: true });
    // Unterminated #if produces a macro diagnostic.
    await writeFile(join(root, "src", "broken.ts"), "#if HOK\nconst x = 1;\n", "utf8");
    let typecheckRan = false;

    const results = await runProfilePipeline({
      projectRoot: root,
      sourceRoot: "src",
      entries: [{ profile: "HOK", tsconfig: "tsconfig.hok.json" }],
      definitionsFor: () => Promise.resolve({ HOK: true }),
      typecheck: () => {
        typecheckRan = true;
        return Promise.resolve({ errors: [] });
      },
    });

    assert.equal(typecheckRan, false);
    assert.equal(results[0]!.status, "macro-diagnostics");
    assert.equal((results[0]!.diagnostics ?? []).length >= 1, true);
  });
});

test("pipeline reports type errors from the runner", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "main.ts"), "#if HOK\nconst ok = 1;\n#endif\n", "utf8");

    const results = await runProfilePipeline({
      projectRoot: root,
      sourceRoot: "src",
      entries: [{ profile: "HOK", tsconfig: "tsconfig.hok.json" }],
      definitionsFor: () => Promise.resolve({ HOK: true }),
      typecheck: () => Promise.resolve({ errors: ["main.ts:1:1 TS2322: bad"] }),
    });

    assert.equal(results[0]!.status, "type-errors");
    assert.deepEqual(results[0]!.diagnostics, ["main.ts:1:1 TS2322: bad"]);
  });
});

test("pipeline skips a profile whose declarations are missing", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "main.ts"), "const ok = 1;\n", "utf8");
    let emitAttempted = false;

    const entry: ProfilePipelineEntry = {
      profile: "DOMESTIC",
      tsconfig: "tsconfig.domestic.json",
      requireDeclarations: ["DevelopmentReference/Domestic"],
    };
    const results = await runProfilePipeline({
      projectRoot: root,
      sourceRoot: "src",
      entries: [entry],
      definitionsFor: () => {
        emitAttempted = true;
        return Promise.resolve({ DOMESTIC: true });
      },
      typecheck: passingTypecheck,
      directoryExists: () => Promise.resolve(false),
    });

    assert.equal(emitAttempted, false);
    assert.equal(results[0]!.status, "skipped-missing-declarations");
    assert.deepEqual(results[0]!.missingDeclarations, ["DevelopmentReference/Domestic"]);
  });
});

test("loadPipelineConfig validates and reads profile entries", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await writeFile(
      join(root, "Build", "macros", "pipeline.json"),
      JSON.stringify({
        profiles: [
          { profile: "HOK", tsconfig: "SystemScripts/tsconfig.hok.json" },
          {
            profile: "DOMESTIC",
            tsconfig: "SystemScripts/tsconfig.domestic.json",
            requireDeclarations: ["DevelopmentReference/Domestic"],
          },
        ],
      }),
      "utf8",
    );
    const config = await loadPipelineConfig(root);
    assert.deepEqual(config.profiles.map((entry) => entry.profile), ["HOK", "DOMESTIC"]);
    assert.deepEqual(config.profiles[1]!.requireDeclarations, ["DevelopmentReference/Domestic"]);
  });

  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await writeFile(join(root, "Build", "macros", "pipeline.json"), "{\"profiles\":[]}", "utf8");
    await assert.rejects(loadPipelineConfig(root), /at least one profile/);
  });
});

test("tscTypecheckRunner passes a clean projected tree and reports a type error (TS 5.5.4)", async () => {
  await withProject(async (root) => {
    const projected = join(root, "Build", ".macrobuild", "HOK");
    await mkdir(projected, { recursive: true });
    await writeFile(join(projected, "main.ts"), "export const region: string = 'hok';\n", "utf8");
    const tsconfigPath = join(root, "tsconfig.hok.json");
    await writeFile(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, target: "ES2022", skipLibCheck: true },
        include: ["Build/.macrobuild/HOK/**/*.ts"],
      }),
      "utf8",
    );

    const clean = await tscTypecheckRunner({ projectRoot: root, tsconfigPath, profile: "HOK" });
    assert.deepEqual(clean.errors, []);

    await writeFile(join(projected, "main.ts"), "export const region: string = 123;\n", "utf8");
    const broken = await tscTypecheckRunner({ projectRoot: root, tsconfigPath, profile: "HOK" });
    assert.equal(broken.errors.length >= 1, true);
    assert.match(broken.errors.join("\n"), /TS2322/);
  });
});

test("packaged pipeline command prints a per-profile summary", async () => {
  await withProject(async (root) => {
    await mkdir(join(root, "Build", "macros"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "Build", "macros", "hok.json"), "{\"HOK\":true}", "utf8");
    await writeFile(
      join(root, "Build", "macros", "pipeline.json"),
      JSON.stringify({
        profiles: [
          { profile: "HOK", tsconfig: "tsconfig.hok.json" },
          {
            profile: "DOMESTIC",
            tsconfig: "tsconfig.domestic.json",
            requireDeclarations: ["DevelopmentReference/Domestic"],
          },
        ],
      }),
      "utf8",
    );
    await writeFile(join(root, "src", "main.ts"), "#if HOK\nexport const ok = 1;\n#endif\n", "utf8");
    await writeFile(
      join(root, "tsconfig.hok.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, target: "ES2022", skipLibCheck: true },
        include: ["Build/.macrobuild/HOK/**/*.ts"],
      }),
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "cli", "main.js"), "pipeline", "--source", "src"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[HOK\] passed/);
    assert.match(result.stdout, /\[DOMESTIC\] skipped: missing declarations/);
  });
});
