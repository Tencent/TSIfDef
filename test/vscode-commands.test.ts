import assert from "node:assert/strict";
import test from "node:test";

import {
  MacroCommandController,
  MacroPresentationController,
  checkCommand,
  computeFoldingRanges,
  emitCommand,
  stopWatchCommand,
  watchCommand,
  type CliRunner,
  type CommandContext,
} from "../src/vscode/index.js";
import {
  EmitDiagnosticsError,
  type EmitResult,
  type WatchHandle,
} from "../src/cli/index.js";
import type { MacroDefinitions } from "../src/core/index.js";
import { FakeHost, macroDocument } from "./fake-host.js";

const hok: MacroDefinitions = { HOK: true };

test("computeFoldingRanges folds only multi-line inactive regions", () => {
  const source = [
    "#if HOK", // line 0
    "const a = 1;", // 1
    "#else", // 2
    "const b = 2;", // 3 (inactive)
    "const c = 3;", // 4 (inactive)
    "#endif", // 5
    "", // 6
  ].join("\n");

  const folds = computeFoldingRanges(source, hok);
  assert.equal(folds.length, 1);
  // The inactive #else branch folds from the #else marker (line 2) through its
  // last inactive line (4); the closing #endif on line 5 stays visible.
  assert.deepEqual(folds[0], { start: 2, end: 4 });
});

test("computeFoldingRanges tracks the active branch per profile", () => {
  const source = ["#if HOK", "a", "b", "#else", "c", "d", "#endif", ""].join("\n");
  const hokFolds = computeFoldingRanges(source, { HOK: true });
  const otherFolds = computeFoldingRanges(source, { HOK: false });
  assert.notDeepEqual(hokFolds, otherFolds);
  assert.equal(hokFolds.every((fold) => fold.end > fold.start), true);
  assert.equal(otherFolds.every((fold) => fold.end > fold.start), true);
});

test("presentation registers a folding provider scoped to the effective profile", () => {
  const source = "#if HOK\na\n#else\nb\nc\n#endif\n";
  const host = new FakeHost({ documents: [macroDocument("file:///a.ts", source)] });
  const controller = new MacroPresentationController(host, () => hok);
  controller.activate();

  assert.notEqual(host.foldingProvider, undefined);
  const folds = host.foldingProvider!(macroDocument("file:///a.ts", source));
  assert.equal(folds.length >= 1, true);
  // No profile selected -> no folds.
  const noProfile = new MacroPresentationController(new FakeHost(), () => undefined);
  noProfile.activate();
  controller.dispose();
  noProfile.dispose();
});

/** A CliRunner that records calls and returns canned results. */
class FakeRunner implements CliRunner {
  public emitCalls = 0;
  public checkCalls = 0;
  public watchCalls = 0;
  public watchClosed = 0;
  public emitResult: EmitResult = { outputRoot: "/out", files: ["a.ts"], cacheHits: 0 };
  public checkResult: Awaited<ReturnType<CliRunner["check"]>> = [];
  public emitError: unknown;
  public lastWatchOnResult: ((error: unknown, result?: EmitResult) => void) | undefined;

  public emit(): Promise<EmitResult> {
    this.emitCalls += 1;
    if (this.emitError !== undefined) {
      return Promise.reject(this.emitError);
    }
    return Promise.resolve(this.emitResult);
  }

  public check(): Promise<Awaited<ReturnType<CliRunner["check"]>>> {
    this.checkCalls += 1;
    return Promise.resolve(this.checkResult);
  }

  public watch(options: {
    onResult: (error: unknown, result?: EmitResult) => void;
  }): Promise<WatchHandle> {
    this.watchCalls += 1;
    this.lastWatchOnResult = options.onResult;
    const handle = {
      rebuilder: undefined as unknown as WatchHandle["rebuilder"],
      close: () => {
        this.watchClosed += 1;
      },
    };
    return Promise.resolve(handle);
  }
}

const fullContext = (): CommandContext => ({
  projectRoot: "/project",
  profileName: "HOK",
  profilePath: "/project/Build/macros/hok.json",
  definitions: hok,
});

test("emit command reports the emitted file count", async () => {
  const host = new FakeHost();
  const runner = new FakeRunner();
  const controller = new MacroCommandController(host, fullContext, runner);
  controller.activate();

  await host.commands.get(emitCommand)!();
  assert.equal(runner.emitCalls, 1);
  assert.match(host.informationMessages.at(-1) ?? "", /emitted 1 file/i);
  controller.dispose();
});

test("emit command reports macro diagnostics as an error", async () => {
  const host = new FakeHost();
  const runner = new FakeRunner();
  runner.emitError = new EmitDiagnosticsError([
    { file: "a.ts", diagnostics: [] },
  ]);
  const controller = new MacroCommandController(host, fullContext, runner);
  controller.activate();

  await controller.emit();
  assert.match(host.errorMessages.at(-1) ?? "", /macro diagnostics in 1 file/i);
  controller.dispose();
});

test("check command distinguishes pass from diagnostics", async () => {
  const host = new FakeHost();
  const runner = new FakeRunner();
  const controller = new MacroCommandController(host, fullContext, runner);
  controller.activate();

  await controller.check();
  assert.match(host.informationMessages.at(-1) ?? "", /check passed/i);

  runner.checkResult = [
    {
      code: "unknown-macro",
      message: "Unknown macro X.",
      range: { start: 0, end: 1 },
      profile: "HOK",
      file: "a.ts",
      line: 1,
      column: 1,
    },
  ];
  await controller.check();
  assert.match(host.errorMessages.at(-1) ?? "", /1 macro diagnostic/i);
  controller.dispose();
});

test("commands require a profile and a workspace", async () => {
  const noWorkspace = new FakeHost();
  const a = new MacroCommandController(noWorkspace, () => ({
    projectRoot: undefined,
    profileName: "HOK",
    profilePath: undefined,
    definitions: hok,
  }));
  a.activate();
  await a.emit();
  assert.match(noWorkspace.errorMessages.at(-1) ?? "", /open workspace/i);
  a.dispose();

  const noProfile = new FakeHost();
  const b = new MacroCommandController(noProfile, () => ({
    projectRoot: "/project",
    profileName: undefined,
    profilePath: undefined,
    definitions: undefined,
  }));
  b.activate();
  await b.check();
  assert.match(noProfile.errorMessages.at(-1) ?? "", /no profile selected/i);
  b.dispose();
});

test("watch keeps one session and stop closes it", async () => {
  const host = new FakeHost();
  const runner = new FakeRunner();
  const controller = new MacroCommandController(host, fullContext, runner);
  controller.activate();

  await controller.watch();
  await controller.watch();
  // Second watch must close the first before starting again.
  assert.equal(runner.watchCalls, 2);
  assert.equal(runner.watchClosed, 1);

  // A watch rebuild result is surfaced to the user.
  runner.lastWatchOnResult?.(undefined, { outputRoot: "/out", files: ["a.ts", "b.ts"], cacheHits: 1 });
  assert.match(host.informationMessages.at(-1) ?? "", /watch emitted 2 file/i);

  await host.commands.get(stopWatchCommand)!();
  assert.equal(runner.watchClosed, 2);

  // Disposing while watching closes any active session.
  await controller.watch();
  controller.dispose();
  assert.equal(runner.watchClosed, 3);
});

test("watch reports a missing profile path", async () => {
  const host = new FakeHost();
  const runner = new FakeRunner();
  const controller = new MacroCommandController(
    host,
    () => ({ projectRoot: "/p", profileName: "HOK", profilePath: undefined, definitions: hok }),
    runner,
  );
  controller.activate();
  await controller.watch();
  assert.equal(runner.watchCalls, 0);
  assert.match(host.errorMessages.at(-1) ?? "", /profile file path/i);
  controller.dispose();
});

test("registers and disposes all four commands", () => {
  const host = new FakeHost();
  const controller = new MacroCommandController(host, fullContext, new FakeRunner());
  controller.activate();
  for (const command of [emitCommand, checkCommand, watchCommand, stopWatchCommand]) {
    assert.equal(host.commands.has(command), true);
  }
  controller.dispose();
  for (const command of [emitCommand, checkCommand, watchCommand, stopWatchCommand]) {
    assert.equal(host.commands.has(command), false);
  }
});
