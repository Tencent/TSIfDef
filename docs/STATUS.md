# Development Status

Last updated: 2026-07-07

## Current Task

`PC-003 - Watch`. See `docs/projected-compilation-plan.md` stage 3.

## Completed This Session

- **PC-001 done**: one-shot projected compilation `tsifdef build`
  (`src/cli/build.ts`, `src/cli/main.ts`, `test/build.test.ts`, 11 cases).
- **PC-002 done**: incremental compilation + Profile invalidation.
  - `build.ts` uses `createIncrementalProgram` when `incremental`/`composite`
    is set, via `createIncrementalCompilerHost`.
  - Each projected SourceFile gets a `version` = hash of its projected text, so
    a Profile switch (same disk bytes, different masking) is detected as a change
    by the builder.
  - A `tsifdef.profilehash` sidecar next to `.tsbuildinfo` records the Profile
    hash; a mismatch/absence discards `.tsbuildinfo` and forces a full rebuild
    (SPEC §8.1, second line of defense).
  - `test/build-incremental.test.ts`: 4 cases including the CORE REGRESSION
    (switch Profile, unchanged sources → new-Profile output, not stale reuse).

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed; 89 tests (was 85; +4 for incremental).

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

`PC-003 - Watch`: `tsifdef build --watch` via `createWatchCompilerHost` with the
same masking, plus a Profile-file watcher that rebuilds the WatchProgram in full
on Profile change (SPEC §8.2). See dev plan stage 3 for the test matrix.
