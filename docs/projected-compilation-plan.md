# Development Plan: Projected Compilation (`tsifdef build`)

This plan corresponds to SPEC §8, §8.1–8.3, §11, and §13. Its goal was to
replace on-disk projection plus stock `tsc` with intercepted CompilerHost reads
and TSIfDef-driven emit. That design makes source maps, declarations, and
diagnostics refer to original source files while supporting incremental and
watch builds.

Every stage includes automated `node:test` coverage in its definition of done.

## 0. Baseline

- Tests use `node:test` and `node:assert/strict`. TypeScript tests below
  `test/` compile to `.test-dist/` and run through `scripts/run-tests.cjs`.
- The original build entry points were `src/cli/precompile.ts`,
  `src/cli/main.ts`, and `src/cli/config.ts`.
- `projectSource(text, definitions)` in `src/core/projection.ts` already
  returned projected text and diagnostics. Build, tsserver, VSCode, and ESLint
  had to reuse it without implementing separate masking rules.
- Existing temporary-project test patterns in `test/precompile.test.ts` were
  suitable for the new integration tests.
- The legacy projection command remained available while `tsifdef build` was
  introduced as a separate subcommand.

## Stage 1: One-shot projected compilation

Target: `createProgram`, wrapped CompilerHost reads, emit, diagnostics, and
correct exit codes, without incremental or watch behavior.

Implementation work:

- Add `src/cli/build.ts` with a `buildProject` entry point.
- Parse compiler options with `ts.parseJsonConfigFileContent`.
- Wrap `readFile` and `getSourceFile`. For macro-bearing source, read original
  disk text, call `projectSource`, and create the SourceFile under its original
  file name. Pass non-macro files such as `.d.ts` and files under
  `node_modules` through unchanged.
- Abort before emit when macro diagnostics exist.
- Run `getPreEmitDiagnostics`, respect `noEmitOnError`, and format TypeScript
  diagnostics through TypeScript's own APIs.
- Drive `program.emit()` and honor `noEmit`.
- Reject `outFile` and multi-project composite references with clear errors.
- Dispatch the new `build` subcommand from `src/cli/main.ts` while preserving
  legacy command behavior.

Required tests:

1. Emitted JavaScript matches the semantics of stock tsc given manually
   selected active branches.
2. `.js.map` source paths are relative, portable, and resolve to original files.
3. Maps emitted at different directory depths each use the correct relative path.
4. Active symbols retain their source-map line and column positions.
5. `inlineSources` embeds original disk source, not masked text.
6. Declarations omit inactive branches and declaration maps point to source.
7. Diagnostics report original source paths.
8. `noEmitOnError` suppresses artifacts and returns exit code 1.
9. `noEmit` performs checking without artifacts.
10. Macro-structure errors abort the build.
11. Unsupported configurations fail clearly.

Definition of done: all tests above and `npm run typecheck` pass.

## Stage 2: Incremental builds and Profile invalidation

Target: use `createIncrementalProgram` while ensuring a Profile switch never
reuses output produced for another Profile.

Implementation work:

- Use TypeScript incremental APIs when requested by `incremental`,
  `tsBuildInfoFile`, or `composite` options.
- Hash normalized Profile content and store it in `tsifdef.profilehash` beside
  build output.
- If the hash is missing or different, ignore old `.tsbuildinfo`, perform a
  full build, and write the new hash only after a successful build.
- Share the same invalidation behavior between CLI and future watch support.

Required tests:

1. Two builds with one Profile use incremental state on the second build.
2. An active-source change updates only relevant artifacts.
3. Switching only the Profile produces new-Profile output without reusing old
   results. This is the critical regression case.
4. A missing hash sidecar forces a full build.
5. A failed build does not record a successful Profile hash.

## Stage 3: Watch mode

Target: implement `tsifdef build --watch`, including separate Profile-file
monitoring and full reconstruction when the Profile changes.

Implementation work:

- Add `src/cli/watch.ts` using `ts.createWatchCompilerHost` and
  `ts.createWatchProgram`.
- Apply the same wrapped reads and `projectSource` behavior as one-shot builds.
- Watch the Profile separately because it is outside tsc's source graph.
- Dispose the current WatchProgram and create a new one after a Profile change.
- Serialize rebuild and disposal transitions to avoid overlapping programs.
- Keep watch diagnostics consistent with one-shot formatting.

Required tests use isolated child processes, artifact polling, and timeouts:

1. An active-branch edit rebuilds and updates output.
2. An inactive-branch edit leaves projected output unchanged.
3. A malformed directive reports a diagnostic and recovers after correction.
4. A Profile change rebuilds in full and updates output.
5. Adding or deleting source files is detected.

Rapid-edit stress coverage was considered optional because timing-sensitive
assertions are difficult to keep stable.

## Stage 4: Compiler-option matrix

Required coverage:

- `sourceMap`, `inlineSourceMap`, `inlineSources`, `declaration`, and
  `declarationMap` in representative combinations.
- `noEmitOnError` with TypeScript and macro diagnostics.
- `noEmit` with macro validation still enabled.
- Incremental behavior with explicit and default `tsBuildInfoFile` paths.
- Clear rejection of `outFile` and project references.
- Correct pass-through of representative CommonJS and ESM `module`/`target`
  combinations.
- Correct handling of `files`, `include`, and `exclude`.

## Stage 5: Audit dump and documentation

- Add optional `--emit-projection <dir>` output for debugging and auditing.
- Write projected files at their original project-relative paths without
  generating a tsconfig or manifest and without using them as compiler input.
- Document `tsifdef build`, `-p`, `--watch`, incremental invalidation, supported
  and unsupported options, and original-source path guarantees.
- Update the changelog and both English and Chinese integration guides.

## Stage 6: Downstream HOK integration

This stage belongs to the downstream HOK repository, not TSIfDef itself:

- Replace four `tsc` invocations in `compile.mjs` with `tsifdef build` while
  preserving existing compiler flags after `--`.
- Ensure the Babel/remap/source-map chain still resolves original sources.
- Run at least two regional Profiles and verify artifact differences.

Tracking moved to `HOK-Integration-Checklist.md` and roadmap item PC-006.

## Risk priorities

- Highest risk: Profile switching combined with incremental state. A failure
  can silently emit JavaScript for the wrong target, so the regression test is
  mandatory.
- High risk: source-map and declaration-map path correctness. Multiple directory
  depths must be tested.
- Medium risk: watch disposal and rebuild races.
- Lower risk: the optional audit dump, which is not a compiler input.

The implementation order was 1 → 2 → 3, followed by the option matrix,
documentation, and downstream integration.
