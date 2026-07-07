# Development Status

Last updated: 2026-07-07

## Current Task

No active task in this repository. The projected-compilation milestone (M6,
`PC-001..005`) is complete. `PC-006` (HOK end-to-end wiring) lives in the HOK
repository and is tracked in `HOK-Integration-Checklist.md`.

## Completed This Session

- **PC-001..004 done**: one-shot `tsifdef build`, incremental + Profile
  invalidation, watch mode, and option-matrix tests.
- **PC-005 done**: optional audit dump and docs.
  - `build.ts` gains `emitProjectionDir`; `tsifdef build --emit-projection <dir>`
    writes the equal-length masked projection under `<dir>` at each file's
    original relative path. Debug artifact only; never fed to the compiler.
  - `test/build-options.test.ts`: added an emit-projection case (dump is
    equal-length masked text; normal emit still happens).
  - README / README.zh-CN rewritten to `tsifdef build` (build/watch/incremental/
    emit-projection; dropped precompile + `tsc -p .tsifdef/Output`).
  - CHANGELOG / CHANGELOG.zh-CN Unreleased section documents projected
    compilation. (The historical v1.0.0 entry keeps its original wording.)

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed; 103 tests.

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

None in this repository. When ready, cut a release (`npm run release`) to ship
projected compilation, and do the HOK-side `PC-006` wiring in that repo.
