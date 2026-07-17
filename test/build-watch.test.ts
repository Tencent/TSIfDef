// Copyright (C) 2026 Tencent. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  BuildUnsupportedError,
  watchProject,
  type WatchBuildInfo,
  type WatchHandle,
} from "../src/cli/index.js";

/** Collects build events and lets tests await the next one matching a predicate. */
class BuildEvents {
  private readonly seen: WatchBuildInfo[] = [];
  private waiter: { predicate: (info: WatchBuildInfo) => boolean; resolve: (info: WatchBuildInfo) => void } | undefined;

  public push(info: WatchBuildInfo): void {
    if (this.waiter !== undefined && this.waiter.predicate(info)) {
      const { resolve: settle } = this.waiter;
      this.waiter = undefined;
      settle(info);
      return;
    }
    this.seen.push(info);
  }

  public async next(
    predicate: (info: WatchBuildInfo) => boolean = () => true,
    timeoutMs = 15000,
  ): Promise<WatchBuildInfo> {
    const index = this.seen.findIndex(predicate);
    if (index >= 0) return this.seen.splice(index, 1)[0]!;
    return new Promise<WatchBuildInfo>((settle, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for build event")), timeoutMs);
      this.waiter = {
        predicate,
        resolve: (info) => {
          clearTimeout(timer);
          settle(info);
        },
      };
    });
  }
}

interface Fixture {
  readonly root: string;
  readonly events: BuildEvents;
  readonly handle: WatchHandle;
}

async function startWatch(
  files: Readonly<Record<string, string>>,
  profile: readonly string[],
  options: { readonly emitProjectionDir?: string } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-watch-"));
  await writeFile(join(root, "Profile.json"), JSON.stringify(profile), "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }), "utf8");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020", sourceMap: true },
      include: ["src/**/*.ts"],
    }),
    "utf8",
  );
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  const events = new BuildEvents();
  const handle = await watchProject({
    projectRoot: root,
    project: "tsconfig.json",
    profilePath: join(root, "Profile.json"),
    ...(options.emitProjectionDir === undefined ? {} : { emitProjectionDir: options.emitProjectionDir }),
    onBuild: (info) => events.push(info),
  });
  return { root, events, handle };
}

async function cleanup(fixture: Fixture): Promise<void> {
  fixture.handle.close();
  await rm(fixture.root, { recursive: true, force: true });
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test("editing an active branch triggers a rebuild with updated output", async () => {
  const fixture = await startWatch(
    { "src/main.ts": "#if BROWSER\nexport const runtime = 'browser';\n#endif\n" },
    ["BROWSER"],
  );
  try {
    await fixture.events.next(); // initial build
    await writeFile(
      join(fixture.root, "src", "main.ts"),
      "#if BROWSER\nexport const runtime = 'browser-2';\n#endif\n",
      "utf8",
    );
    await fixture.events.next((info) => info.outputFiles.some((f) => f.endsWith("main.js")));
    const js = await readFile(join(fixture.root, "dist", "main.js"), "utf8");
    assert.match(js, /browser-2/);
    // Sourcemap sources still point at the original source.
    const map = JSON.parse(await readFile(join(fixture.root, "dist", "main.js.map"), "utf8")) as {
      sources: string[];
      sourceRoot?: string;
    };
    const resolved = resolve(join(fixture.root, "dist"), map.sourceRoot ?? "", map.sources[0]!);
    assert.equal(resolve(resolved), resolve(join(fixture.root, "src", "main.ts")));
  } finally {
    await cleanup(fixture);
  }
});

test("editing an inactive branch does not change output", async () => {
  const fixture = await startWatch(
    { "src/main.ts": "#if BROWSER\nexport const only = 'x';\n#else\nexport const only = 'a';\n#endif\n" },
    ["BROWSER"],
  );
  try {
    await fixture.events.next();
    const before = await readFile(join(fixture.root, "dist", "main.js"), "utf8");
    // Change only the inactive #else branch; the projection is identical.
    await writeFile(
      join(fixture.root, "src", "main.ts"),
      "#if BROWSER\nexport const only = 'x';\n#else\nexport const only = 'b';\n#endif\n",
      "utf8",
    );
    // The projected text is unchanged, so the incremental builder should not
    // re-emit. Wait briefly for any (unexpected) rebuild, then assert stability.
    await assert.rejects(
      fixture.events.next((info) => info.outputFiles.length > 0, 2000),
      /timed out/,
    );
    const after = await readFile(join(fixture.root, "dist", "main.js"), "utf8");
    assert.equal(after, before);
    assert.doesNotMatch(after, /'a'|'b'/);
  } finally {
    await cleanup(fixture);
  }
});

test("breaking macro structure reports a diagnostic and recovers", async () => {
  const fixture = await startWatch(
    { "src/main.ts": "#if BROWSER\nexport const runtime = 'browser';\n#endif\n" },
    ["BROWSER"],
  );
  try {
    await fixture.events.next();
    // Remove the #endif.
    await writeFile(join(fixture.root, "src", "main.ts"), "#if BROWSER\nexport const runtime = 'browser';\n", "utf8");
    const broken = await fixture.events.next((info) => info.hasErrors);
    assert.ok(broken.macroDiagnostics.size > 0);
    // Repair it; watch must still be alive and rebuild cleanly.
    await writeFile(join(fixture.root, "src", "main.ts"), "#if BROWSER\nexport const runtime = 'ok';\n#endif\n", "utf8");
    await fixture.events.next((info) => !info.hasErrors && info.outputFiles.some((f) => f.endsWith("main.js")));
    const js = await readFile(join(fixture.root, "dist", "main.js"), "utf8");
    assert.match(js, /ok/);
  } finally {
    await cleanup(fixture);
  }
});

test("changing the Profile file rebuilds with the new Profile", async () => {
  const fixture = await startWatch(
    { "src/main.ts": "#if BROWSER\nexport const runtime = 'browser';\n#else\nexport const runtime = 'node';\n#endif\n" },
    ["BROWSER"],
  );
  try {
    await fixture.events.next();
    let js = await readFile(join(fixture.root, "dist", "main.js"), "utf8");
    assert.match(js, /browser/);
    // Switch Profile to NODE; sources are unchanged.
    await writeFile(join(fixture.root, "Profile.json"), JSON.stringify(["NODE"]), "utf8");
    await fixture.events.next((info) => info.outputFiles.some((f) => f.endsWith("main.js")));
    js = await readFile(join(fixture.root, "dist", "main.js"), "utf8");
    assert.match(js, /node/);
    assert.doesNotMatch(js, /browser/);
  } finally {
    await cleanup(fixture);
  }
});

test("watch mode dumps projections when emitProjectionDir is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "tsifdef-watch-"));
  const projectionDir = join(root, ".projection");
  await writeFile(join(root, "Profile.json"), JSON.stringify(["BROWSER"]), "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }), "utf8");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020" },
      include: ["src/**/*.ts"],
    }),
    "utf8",
  );
  await mkdir(join(root, "src"), { recursive: true });
  const source = "#if BROWSER\nexport const only = 'browser';\n#else\nexport const only = 'node';\n#endif\n";
  await writeFile(join(root, "src", "main.ts"), source, "utf8");
  const events = new BuildEvents();
  const handle = await watchProject({
    projectRoot: root,
    project: "tsconfig.json",
    profilePath: join(root, "Profile.json"),
    emitProjectionDir: projectionDir,
    onBuild: (info) => events.push(info),
  });
  try {
    await events.next();
    const dumped = await readFile(join(projectionDir, "src", "main.ts"), "utf8");
    assert.equal(dumped.length, source.length);
    assert.match(dumped, /only = 'browser'/);
    assert.doesNotMatch(dumped, /only = 'node'/);
  } finally {
    handle.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("watch mode rejects unsupported outFile and project references", async () => {
  const outFileRoot = await mkdtemp(join(tmpdir(), "tsifdef-watch-outfile-"));
  try {
    await writeFile(join(outFileRoot, "Profile.json"), "[]", "utf8");
    await writeFile(join(outFileRoot, "package.json"), JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }), "utf8");
    await mkdir(join(outFileRoot, "src"), { recursive: true });
    await writeFile(join(outFileRoot, "src", "main.ts"), "export const value = 1;\n", "utf8");
    await writeFile(
      join(outFileRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, outFile: "bundle.js", module: "system", target: "ES2020" },
        include: ["src/**/*.ts"],
      }),
      "utf8",
    );
    await assert.rejects(
      watchProject({
        projectRoot: outFileRoot,
        project: "tsconfig.json",
        profilePath: join(outFileRoot, "Profile.json"),
      }),
      (error: unknown) => {
        assert.ok(error instanceof BuildUnsupportedError);
        assert.match(error.message, /outFile/);
        return true;
      },
    );
  } finally {
    await rm(outFileRoot, { recursive: true, force: true });
  }

  const refsRoot = await mkdtemp(join(tmpdir(), "tsifdef-watch-refs-"));
  try {
    await writeFile(join(refsRoot, "Profile.json"), "[]", "utf8");
    await writeFile(join(refsRoot, "package.json"), JSON.stringify({ name: "fixture", tsifdef: "./Profile.json" }), "utf8");
    await mkdir(join(refsRoot, "lib"), { recursive: true });
    await writeFile(
      join(refsRoot, "lib", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { composite: true, outDir: "dist", module: "commonjs", target: "ES2020" },
        files: [],
      }),
      "utf8",
    );
    await mkdir(join(refsRoot, "src"), { recursive: true });
    await writeFile(join(refsRoot, "src", "main.ts"), "export const value = 1;\n", "utf8");
    await writeFile(
      join(refsRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, outDir: "dist", module: "commonjs", target: "ES2020" },
        include: ["src/**/*.ts"],
        references: [{ path: "./lib" }],
      }),
      "utf8",
    );
    await assert.rejects(
      watchProject({
        projectRoot: refsRoot,
        project: "tsconfig.json",
        profilePath: join(refsRoot, "Profile.json"),
      }),
      (error: unknown) => {
        assert.ok(error instanceof BuildUnsupportedError);
        assert.match(error.message, /project references|tsc -b|composite/);
        return true;
      },
    );
  } finally {
    await rm(refsRoot, { recursive: true, force: true });
  }
});

test("adding a new source file is picked up", async () => {
  const fixture = await startWatch({ "src/main.ts": "export const a = 1;\n" }, []);
  try {
    await fixture.events.next();
    await writeFile(join(fixture.root, "src", "extra.ts"), "export const b = 2;\n", "utf8");
    await fixture.events.next((info) => info.outputFiles.some((f) => f.endsWith("extra.js")));
    assert.equal(await exists(join(fixture.root, "dist", "extra.js")), true);
  } finally {
    await cleanup(fixture);
  }
});
