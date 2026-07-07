# Development Status

Last updated: 2026-07-07

## Current Task

`PC-002 - Incremental and Profile invalidation`. See
`docs/projected-compilation-plan.md` stage 2.

## Completed This Session

- **PC-001 done**: implemented one-shot projected compilation `tsifdef build`.
  - `src/cli/build.ts`: `buildProject` hijacks `CompilerHost.readFile` /
    `getSourceFile` to feed equal-length masked text under original file names,
    reuses `parseJsonConfigFileContent` options verbatim, runs
    `getPreEmitDiagnostics`, respects `noEmit` / `noEmitOnError`, drives
    `program.emit()`, and formats diagnostics with exit codes.
  - Rejects `outFile` and project references (`tsc -b`) as unsupported.
  - `inlineSources`: rewrites embedded `sourcesContent` back to disk originals
    (external `.map` and inline base64 data URIs).
  - `src/cli/main.ts`: `runCli` dispatches the `build` subcommand (accepts
    `-p` / `--project`); legacy precompile behavior preserved.
  - `test/build.test.ts`: 11 cases covering SPEC §11.3 (JS equivalence, relative
    portable map sources, multi-depth, column stability, inlineSources,
    declaration/declarationMap, error paths, noEmitOnError, noEmit, macro
    structure errors, outFile unsupported).

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed; 85 tests (was 74; +11 for build).

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

`PC-002 - Incremental and Profile invalidation`: `createIncrementalProgram` +
`tsifdef.profilehash`. Core regression: switching Profile with unchanged sources
must not reuse the previous Profile's output. See dev plan stage 2 / SPEC §8.1.
