# Development Status

Last updated: 2026-06-24

## Current Task

No active task. `REL-001 - Version-matched VSIX and tgz artifacts` is complete.

## Completed This Session

- Documented that the current project's `files`, `include`, and `exclude` are
  part of the precompile contract, while independent subprojects keep their
  own `tsifdef` configuration.
- Documented the generated-project path contract: source-bearing inputs stay in
  `.tsifdef/Output/project`, sourcemaps keep original project-relative source
  paths, `mapRoot` is normalized, and incremental build info is relocated into
  `.tsifdef/Output`.
- Clarified the root and demo README usage examples so they show the
  `precompile` and `compile` package scripts explicitly, with `compile`
  targeting `.tsifdef/Output/tsconfig.json`.
- Added include/exclude/files test coverage for the current project, including
  `.d.ts` input files and transitive imports.
- Added an integration test that compiles the generated project and verifies
  sourcemap source paths, `sourceMappingURL`, and relocated incremental build
  info files.

## Verification

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed; 72 tests.
- `npm run release`: passed; emitted `release/manifest.json`,
  `release/tsifdef-1.0.0.tgz`, and `release/tsifdef-1.0.0.vsix`, installed the
  VSIX into a temporary VSCode extension directory, and installed plus executed
  the tgz CLI in a temporary npm project.

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata;
  packaging succeeds, but the warning remains.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  must consume `.tsifdef/Output`.

## Next Task

No next task is defined in the roadmap.
