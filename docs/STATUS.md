# Development Status

Last updated: 2026-07-09

## Current Task

No active task in this repository.

## Completed This Session

- **VS-001 done**: ordinary TypeScript workspaces no longer produce a TSIfDef
  configuration error merely because the extension is installed.
  - Added optional VSCode configuration discovery for workspaces with no
    package.json or no `tsifdef` property.
  - Kept explicit malformed `tsifdef` values and invalid Profiles visible as
    errors.
  - Hidden the TSIfDef status item while the workspace is not opted in and
    cleared the tsserver plugin configuration.
  - Preserved strict missing-configuration failures for CLI builds.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed; 109 tests.

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

None in this repository. When ready, cut an open-source release.
