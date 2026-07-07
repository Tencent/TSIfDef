# Development Status

Last updated: 2026-07-07

## Current Task

`PC-005 - Optional audit dump and docs`. See
`docs/projected-compilation-plan.md` stage 5.

## Completed This Session

- **PC-001 done**: one-shot projected compilation `tsifdef build`.
- **PC-002 done**: incremental compilation + Profile invalidation.
- **PC-003 done**: watch mode.
- **PC-004 done**: option-matrix tests. `test/build-options.test.ts`: 8 cases
  (module commonjs/esnext, paths+baseUrl aliases under projection, emitBOM,
  newLine crlf, emitDeclarationOnly, outFile + project-reference unsupported
  messages). No code changes needed — projected compilation handled the whole
  matrix correctly.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed; 102 tests (was 94; +8 for options).

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

`PC-005 - Optional audit dump and docs`: add `--emit-projection <dir>` (debug
dump of the masked projection, off by default) and update README / CHANGELOG /
INTEGRATION to `tsifdef build`. See dev plan stage 5.
