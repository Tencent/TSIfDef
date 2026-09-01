# Changelog

Language file: [`CHANGELOG.zh-CN.md`](./CHANGELOG.zh-CN.md)

## Unreleased

## v1.0.4 - 2026-09-01

- Package the `tsifdef-tsserver` module shim as real files in the VSIX so a
  clean or forced extension install can always load the TypeScript plugin.
- Verify during release that the installed shim contains only its manifest and
  one forwarding entry, and that it loads the packaged plugin.
- Gracefully keep decorations and folding available when VSCode's built-in
  TypeScript language service is absent or unavailable.

## v1.0.3 - 2026-09-01

- Restart the TypeScript server when the selected Profile path or effective
  macro set changes. Reloading projects alone could leave stale diagnostics in
  open files.
- Keep the existing guard against restarts during initial activation and when a
  Profile is saved without changing its effective macro set.

## v1.0.2 - 2026-08-31

- Reload TypeScript projects when the selected Profile path or enabled macro
  set changes, so open-file language-service diagnostics follow Profile edits.
- Avoid reloads for initial activation and saves that do not change the
  effective macro set.
- Remove reliance on private tsserver project invalidation methods.

- Projected compilation `tsifdef build`: hijacks the TypeScript CompilerHost to
  feed equal-length masked text under the original file names and drives
  `program.emit()`, so emitted `.js.map` sources, `.d.ts`, and error paths point
  at the original sources with no post-processing and no on-disk shadow tree.
- Incremental builds (`createIncrementalProgram`) with a `tsifdef.profilehash`
  sidecar that forces a full rebuild when the Profile changes.
- Watch mode (`tsifdef build --watch`) via `createWatchCompilerHost`, with a
  separate Profile-file watcher that rebuilds in full on Profile change.
- `inlineSources` restores embedded `sourcesContent` to disk originals; `outFile`
  and project references (`tsc -b`) report a clear unsupported error.
- Optional `--emit-projection <dir>` debug dump of the masked projection.
- ESLint processor (`tsifdef/macros`): projects macro files with equal-length
  masking before ESLint parses them, so `#if` no longer causes
  `Parsing error`. Exported as `tsifdef/eslint-plugin`.
- `postinstall` auto-creates a `node_modules/eslint-plugin-tsifdef` forwarder in
  the host project so `plugins: ["tsifdef"]` resolves without manual setup.

## v1.0.0 - 2026-06-22

Initial release of TSIfDef.

- Shared core directive scanning, expression parsing, conditional evaluation,
  and equal-length projection.
- CLI precompile flow that emits `.tsifdef/Output` from the active Profile.
- tsserver plugin that projects macro files before language-service analysis.
- VSCode extension with Profile display, decorations, folding, and diagnostics.
- Version-matched VSIX and tgz release artifacts with installation smoke tests.
