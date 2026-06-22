# Development Status

Last updated: 2026-06-22

## Current Task

No active task. `REL-001 - Version-matched VSIX and tgz artifacts` is complete.

## Completed This Session

- Added `src/version.ts` as the canonical release version source and synced
  package manifests from it.
- Added a root release flow that produces `release/tsifdef-1.0.0.tgz`,
  `release/tsifdef-1.0.0.vsix`, and `release/manifest.json` from the same
  version and Git revision.
- Added `scripts/release.cjs`, `scripts/sync-version.cjs`, and npm scripts for
  syncing, packaging, and release.
- Added root `README.md`, `CHANGELOG.md`, and Apache 2.0 `LICENSE`.
- Added bilingual `README.en-US.md` / `README.zh-CN.md` and
  `CHANGELOG.en-US.md` / `CHANGELOG.zh-CN.md`.
- Renamed the demo macros and sample files to neutral `TEST_A`, `TEST_B`, and
  `TEST_SHARED` identifiers and removed business-specific naming from the demo
  README.
- Switched the root packaging filter from `files` to `.npmignore` so npm pack
  and VSCE can coexist, and excluded `release/` from both packagers.
- Moved `typescript` to production dependencies so the installed tgz can run
  the CLI without relying on dev-only installs.
- Installed `@vscode/vsce` as a dev dependency and regenerated
  `package-lock.json`.

## Verification

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed.
- `npm run release`: passed; emitted `release/manifest.json`,
  `release/tsifdef-1.0.0.tgz`, and `release/tsifdef-1.0.0.vsix`, installed the
  VSIX into a temporary VSCode extension directory, and installed plus executed
  the tgz CLI in a temporary npm project.

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata;
  packaging succeeds, but the warning remains.
- Project references and uncommon path-valued compiler options do not yet have
  explicit integration coverage.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  must consume `.tsifdef/Output`.

## Next Task

No next task is defined in the roadmap.
