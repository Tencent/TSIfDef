# Development Status

Last updated: 2026-07-07

## Current Task

`PC-004 - Option matrix`. See `docs/projected-compilation-plan.md` stage 4.

## Completed This Session

- **PC-001 done**: one-shot projected compilation `tsifdef build`.
- **PC-002 done**: incremental compilation + Profile invalidation.
- **PC-003 done**: watch mode.
  - `src/cli/watch.ts`: `watchProject` uses `createWatchCompilerHost` with the
    same equal-length masking (`readFile` override) and takes over
    `afterProgramCreate` to restore inlineSources, collect outputs, surface macro
    diagnostics, and skip emit for broken files without killing the watcher.
  - A separate `fs.watch` on the Profile file tears down and rebuilds the
    WatchProgram in full on any Profile change (SPEC §8.2), debounced 50ms.
  - Programmable API (`onBuild` / `onProfileReload` callbacks, `close()`) so
    tests are event-driven, not sleep-based.
  - `restoreInlineSourcesFor` exported from `build.ts` for reuse.
  - `src/cli/main.ts`: `build --watch` dispatch.
  - `test/build-watch.test.ts`: 5 cases (active edit, inactive edit no-op, broken
    macro + recover, Profile switch, new file). Stable across repeated runs.
  - Deferred: SPEC §11.5 "rapid successive edits" (timing-dependent).

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed; 94 tests (was 89; +5 for watch). Watch suite run 3x, stable.

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

`PC-004 - Option matrix`: cover the SPEC §8 option table "special-cased /
unsupported" rows with tests (module/target cjs+esm, paths/baseUrl aliases under
projection, emitBOM/newLine byte preservation, stable unsupported messages). See
dev plan stage 4.
