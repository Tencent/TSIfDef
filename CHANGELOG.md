# Changelog

## v1.1.5 - 2026-09-09

- Add GitHub Actions workflows for tests, builds, and verified GitHub Releases.
- Generate bilingual release notes for GitHub Releases.
- Publish the installable npm tarball and VSIX together on the Releases page.
- Add the public product documentation, contribution guide, security policy,
  and neutral macro examples.
- Render Profile file names consistently across Windows and POSIX hosts.
- Add a TSIfDef-aware ESLint parser wrapper for rules such as
  `import/no-cycle` that read dependency files directly and bypass processors.
- Keep processor-based synthetic-diagnostic filtering while sharing Profile
  resolution and source projection with the parser wrapper.
- Keep `@typescript-eslint/parser` as the top-level parser so VSCode ESLint's
  default TypeScript probe recognizes the file. The TSIfDef parser wrapper is
  configured only through `settings.import/parsers` for dependency parsing.
- Consolidate the npm distribution into one tarball. Installing it under the
  `eslint-plugin-tsifdef` dependency name provides the CLI, core API, ESLint
  processor, and parser from the same package.

## v1.1.4 - 2026-09-07

- Ship `eslint-plugin-tsifdef` as a real companion package instead of creating
  it during `postinstall`; npm could remove the generated forwarder as an
  extraneous package after lifecycle scripts completed.

## v1.1.3 - 2026-09-07

- Add a portable TSIfDef specification and implementation-neutral conformance
  fixtures.
- Prevent ESLint rules from reporting diagnostics caused solely by synthetic
  whitespace in projected directive and inactive-branch ranges.

## v1.1.2 - 2026-09-03

- Do not interpret TypeScript private fields, private methods, or private-brand
  checks that begin a line with `#name` as TSIfDef directives.

## v1.1.1 - 2026-09-02

- Refresh the TypeScript server when the first valid Profile is loaded, so
  documents restored during VSCode startup do not retain diagnostics produced
  before the TSIfDef plugin received its configuration.

## v1.0.5 - 2026-09-01

- After a Profile change, restart tsserver, reapply the plugin configuration,
  and reload projects. This forces a second diagnostic pass for already-open
  documents after the restarted server has activated TSIfDef.

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
