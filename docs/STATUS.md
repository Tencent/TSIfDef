# Development Status

Last updated: 2026-07-15

## Current Task

No active task in this repository.

## Completed This Session

- **CLI diagnostic compatibility fix**: redirected/piped CLI TypeScript
  diagnostics now use plain `file(line,column): error TSxxxx` formatting so
  downstream CI log scanners can match `error TS` in `tslog.txt`.
  - Interactive TTY output keeps colored context formatting.
  - One-shot build and watch diagnostics share the same formatter.
  - Added a regression assertion that captured diagnostics contain `error TS`
    and no ANSI escape codes.

## Verification

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed; 110 tests.
- Manual redirected CLI smoke: a temporary project with a TS2322 error wrote
  `src/main.ts(1,14): error TS2322: ...` to `tslog.txt`, and `error TS`
  matched successfully.

## Known Issues

- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

None in this repository. When ready, cut an open-source release.
