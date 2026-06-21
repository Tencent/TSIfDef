# Development Status

Last updated: 2026-06-21

## Current Task

`INT-002 - Existing build-pipeline integration`

Insert the macro emit step ahead of the existing `init.mjs -> compile.mjs ->
build.mjs` pipeline so projected source feeds `tsc`, Babel, and downstream
stages, reusing the CLI rather than adding macro semantics.

## Completed This Session

- Fixed the VS Code tsserver plugin integration after the live server log showed
  `Couldn't find tsifdef`: the extension now contributes a resolvable
  `tsifdef-tsserver` package through `typescriptServerPlugins`, the demo
  `tsconfig.json` uses that package name, and both bundled and workspace
  TypeScript versions are enabled. The prior demo-local shim was ineffective
  because VS Code did not add workspace `node_modules` to plugin probe paths.
- Fixed the misleading VS Code state where the status bar showed a selected
  Profile even when its `Build/macros/<profile>.json` could not be loaded (for
  example, when testing in the repository window instead of the demo Extension
  Development Host). The status bar now shows `<profile> (unavailable)` and the
  extension reports the attempted path and load error; added a regression test.
- Made the manual VS Code demo actually run end to end (outside the numbered
  roadmap):
  - Fixed the extension entry: `package.json` `main` now points at
    `dist/vscode/extension.js` so VS Code activates the extension (the status bar
    and commands previously never appeared because `main` was the core entry);
    the core npm entry is preserved via `exports["."]`/`["./core"]` and the CLI
    via `bin`.
  - Fixed a tsserver plugin bug: a relative plugin `macrosDir` resolved against
    the process cwd instead of the project root, so the profile failed to load
    and `#if` lines still produced errors. It now resolves against the project;
    added plugin tests.
  - Wired the demo's `tsconfig.json` to load the plugin by name through a
    committed `examples/demo/node_modules/tsifdef` shim (un-ignored in
    `.gitignore`) that re-exports `dist/tsserver/plugin.js`. Verified against a
    real `tsserver` that `src/region.ts` reports 0 diagnostics under HOK.
  - Added the root `package.json` extension manifest (`engines.vscode`,
    `activationEvents`, `contributes` commands and `tsifdef.profile`), `.vscode`
    launch/build tasks, `.vscodeignore`, and the `examples/demo` workspace with
    HOK/Domestic profiles, single and nested directives, per-profile tsconfigs,
    and a README. Self-contained VSIX packaging remains REL-001.
- Fixed `discoverProfileNames` to exclude the reserved `pipeline.json` so
  `check --all` and the VS Code profile switcher no longer treat the pipeline
  config as a macro profile; added a regression test.
- Completed `INT-001`.
- Added `runProfilePipeline` (`src/cli/pipeline.ts`) that emits each Profile
  through the shared `emitProject` and then typechecks its `tsconfig`, resolving
  one stable status per Profile: `passed`, `macro-diagnostics` (typecheck
  skipped), `type-errors`, or `skipped-missing-declarations`.
- Loaded per-Profile build configuration (tsconfig path and required declaration
  directories) from a versioned `Build/macros/pipeline.json`.
- Reported a Profile with absent required declaration directories as a skippable
  configuration status rather than a failure, matching the TsScripts workspace
  that lacks Domestic declarations.
- Added a default `tscTypecheckRunner` (`src/cli/tsc-runner.ts`) that lazily
  loads the workspace TypeScript so `dist` keeps no static TypeScript dependency,
  and injected the typecheck and directory-existence steps for testability.
- Added the packaged `tsifdef pipeline` command with a per-Profile summary and
  stable exit codes: `0` success including skips, `1` diagnostics, `2` config/IO.
- Added programmatic tests for passed, macro-diagnostics, type-errors, and
  skipped-missing-declarations, config loading, a TypeScript 5.5.4 typecheck of a
  projected tree, and a packaged pipeline run.
- Completed `TSS-003`, finishing milestone M4.
- Added a TypeScript 5.5.4 language-service integration suite over the
  projection-wrapping host covering completion, definition, find-all-references,
  rename, and quick fix, asserting original-document offsets and that
  inactive-branch code never participates.
- Extracted the in-memory host into a shared `test/tsserver-fixtures.ts`.
- Completed `TSS-002`.
- Converted the host wrapper to read the active Profile through a live
  `getProfile()` callback, and added a `ProfileProjectionController` that marks
  the project dirty only when the resolved Profile version changes.
- Wired the controller into the plugin with a macros-directory watch and
  `markAsDirty`/`updateGraph`/`refreshDiagnostics` invalidation.
- Completed `TSS-001`.
- Added `wrapHostWithProjection` that returns an equal-length projected snapshot
  per whole file and a Profile-versioned `getScriptVersion`, plus the plugin
  entry resolving one external read-only Profile; the injected `typescript` keeps
  `dist` dependency-free.
- Added unit tests for equal-length projection, version suffixing, non-macro and
  missing-snapshot passthrough, and unsaved in-memory edits, plus two TypeScript
  5.5.4 language-service integrations confirming inactive-branch symbols are
  absent while active-branch types resolve under each Profile.
- Completed `VSC-003`, finishing milestone M3.
- Added a `vscode`-free `computeFoldingRanges` reusing `analyzeDocument` inactive
  ranges and emitting only inclusive multi-line line folds, plus a folding
  provider registered through the host for the effective Profile.
- Added a `MacroCommandController` (`src/vscode/macro-commands.ts`) with emit,
  check, watch, and stop-watch commands that drive the existing
  `emitProject`/`checkProject`/`watchProfile` entry points through an injected
  `CliRunner`, keep a single watch session, and report outcomes via the host.
- Extended `ExtensionHost` with folding-provider registration and error
  messaging and wired the real `vscode` folding API and command context in
  `extension.ts`.
- Added folding and command tests with the shared fake host and a fake runner
  covering folding scope, profile dependence, command success and diagnostics,
  missing profile/workspace, single-watch lifecycle, and disposal.
- Completed `VSC-002`.
- Added a `vscode`-free `analyzeDocument`/`PositionMapper`
  (`src/vscode/document-analysis.ts`) that reuses `analyzeConditionals` and maps
  UTF-16 offsets to zero-based positions, counting CRLF/CR/LF as one line each
  and preserving surrogate pairs.
- Added a `MacroPresentationController` (`src/vscode/macro-presentation.ts`) that
  publishes diagnostics and applies an inactive-range decoration per open macro
  document, clears everything when no Profile is selected, and refreshes on
  document, editor, and Profile changes.
- Extended `ExtensionHost` with diagnostic-collection, decoration, and
  open-document capabilities, and wired the real `vscode` API plus document and
  configuration change events in `extension.ts`, caching loaded Profile
  definitions and reloading them on switch.
- Extracted the test `FakeHost` into `test/fake-host.ts` and added document
  analysis, position-mapping, and presentation tests covering profiles,
  no-selection clearing, non-macro skipping, document close, and profile change.
- Completed `VSC-001`.
- Added a `vscode`-free `ProfileStateController` (`src/vscode/profile-state.ts`)
  that resolves the effective Profile through the shared core `selectProfile`
  precedence, renders status-bar text and a source-naming tooltip, and exposes a
  no-selection state without throwing.
- Added an injectable `ExtensionHost` interface (`src/vscode/host.ts`) and a thin
  `extension.ts` entry that resolves the real `vscode` module lazily at
  activation, adapts it to the host, registers the switch command and status-bar
  item, and disposes every resource on deactivation.
- Shared `Build/macros/*.json` discovery between the switcher and `check` through
  a new `discoverProfileNames`; the extension reimplements no macro semantics.
- Added fake-host tests covering status text/tooltip, environment-over-VSCode
  precedence, the no-selection state, persisted and cancelled switches, the
  empty-profile message, and command registration/disposal.
- Built and tested with no `@types/vscode` or `vscode` dependency, so CI runs
  without the extension host.
- Completed `CLI-006`.
- Added a shared `readSourceText` loader using a fatal, BOM-preserving UTF-8
  `TextDecoder` so malformed bytes raise `SourceEncodingError` instead of
  silently becoming `U+FFFD`.
- Routed check and emit source reads through the loader, identifying the
  relative source file; emit reads and analyzes every file before any output
  replacement, so encoding failures cannot expose partial output.
- Confirmed the loader rejects exactly the four known non-UTF-8 TsScripts files
  and accepts the remaining 578, and that a correctly encoded literal `U+FFFD`
  remains valid source.
- Added programmatic and packaged CLI tests covering invalid UTF-8 for check and
  emit, exit code `2` with file context, and output preservation on failure.

- Completed `CLI-005` and documented the exact experiment in
  `docs/TSSCRIPTS_PILOT.md`.
- Inspected the real 582-file `SystemScripts/src` tree without modifying
  tracked HOK source or build configuration.
- Passed uncached check and emit for HOK and Domestic profiles using a pilot
  root wholly contained under `Build/.macrobuild`.
- Passed the original and projected HOK TypeScript 5.5.4 typechecks with real
  HOK declarations and matching build compiler options.
- Confirmed Domestic typecheck is unavailable in this workspace because five
  required Domestic declaration packages are absent.
- Found four non-UTF-8 source files whose no-directive projection changed
  bytes through decoder replacement, and defined `CLI-006` to prevent silent
  source corruption.
- Clarified that macros are external, project-global Profile inputs which
  source files, imports, and file order cannot define or mutate.
- Required future tsserver integration to analyze each complete in-memory
  snapshot before returning a complete equal-length projected snapshot.
- Made packaged one-shot emit/check uncached and retained caching only for
  watch or explicit programmatic incremental emission.
- Completed `CLI-004`.
- Added SHA-256 incremental cache keys covering source content, sorted profile
  definitions, core preprocessor version, and macro-config version.
- Added validated, corruption-tolerant per-profile cache manifests containing
  successful projected text.
- Preserved complete staged output replacement on cache hits, including source
  deletion and stale cache cleanup.
- Added `watch --profile` with Profile reloads, generated-output filtering, and
  serialized/coalesced rebuild scheduling.
- Added deterministic cache invalidation and injected-subscription watch tests
  without timing-sensitive sleeps.
- Completed `CLI-003`.
- Added read-only one-profile and `--all` check flows using shared source
  discovery and conditional analysis.
- Added deterministic JSON profile discovery with invalid/empty profile-set
  failures.
- Added profile/file diagnostic context, stable diagnostic codes, and one-based
  CRLF-aware line/column locations.
- Added stable CLI exit codes: success `0`, macro diagnostics `1`, and
  usage/profile/I/O failure `2`.
- Added programmatic and packaged CLI tests for success, diagnostics,
  configuration failures, ordering, and no-write behavior.
- Completed `CLI-002`.
- Added the packaged `tsifdef emit --profile <PROFILE>` command with optional
  project and source roots.
- Added deterministic TypeScript-family source discovery while excluding
  generated output, `.git`, and `node_modules`.
- Added preflight analysis so macro diagnostics preserve existing output and
  identify their source file.
- Added staged whole-directory replacement, stale output cleanup, safe profile
  path segments, and source-tree immutability coverage.
- Added programmatic emit and packaged-command integration tests.
- Completed `CLI-001`.
- Added UTF-8 JSON profile loading with immutable null-prototype definition
  maps, BOM support, macro schema validation, and stable load error codes.
- Added fixed CLI, environment, VSCode, and development Junction selection
  precedence with clear missing/blank selection errors.
- Kept selection, profile loading, Junction inference, and future command-line
  parsing as separate concerns.
- Added focused profile loading, failure, precedence, and inference-gating
  tests.
- Completed `CORE-006`.
- Defined explicit robustness acceptance criteria before implementation.
- Added malformed-nesting recovery and source-ordered diagnostic coverage.
- Added malformed-expression recovery and bounded UTF-16 diagnostic coverage.
- Added lexical-boundary golden coverage across comments, strings, templates,
  template expressions, and regular expressions.
- Added a deterministic 100-sample projection corpus covering mixed line
  endings, Chinese text, surrogate pairs, malformed directives, masking,
  bounded ranges, length/newline preservation, and idempotence.
- Confirmed the existing core APIs satisfy the new suite without semantic
  changes.
- Completed `CORE-005`.
- Added the shared `projectSource` entry point and reusable range masking.
- Merged overlapping directive/inactive ranges and rejected invalid ranges.
- Verified equal UTF-16 length, identical CR/LF offsets, Chinese text, surrogate
  pairs, unknown directive masking, and analysis/projection consistency.
- Verified projected C-style macro source parses with TypeScript 5.5.4.
- Completed `CORE-004`.
- Added nested conditional evaluation and inactive source ranges.
- Added unified scanner, expression, active `#error`, and unexpected-argument
  diagnostics.
- Added directive ranges for supported, unknown, and malformed directive lines
  so every raw `#` line can be masked before TypeScript parsing.
- Kept expression validation active inside inactive parent branches.
- Completed `CORE-003`.
- Added expression tokenization, AST generation, parsing, and Profile-based
  evaluation for identifiers, `defined(NAME)`, `!`, `&&`, `||`, and grouping.
- Added UTF-16 `baseOffset` mapping for syntax and unknown-macro diagnostics.
- Evaluated both sides for diagnostics while preserving boolean precedence.
- Completed `CORE-002`.
- Added C/C++-style directive scanning with exact line, keyword, and argument
  UTF-16 ranges.
- Added structural diagnostics for unmatched, duplicate, out-of-order, unknown,
  and unterminated directives.
- Prevented false directives in strings, continued strings, template text,
  comments, and regular-expression literals while supporting template
  expressions.
- Persisted automatic next-task continuation when estimated free context is
  above 50% in `AGENTS.md`.
- Changed the macro syntax from TypeScript comment directives to C/C++-style
  directive lines such as `#if HOK`.
- Updated the specification to require projection to mask every directive line.
- Completed `CORE-001`.
- Created the npm package, TypeScript build, typecheck, and test configurations.
- Pinned TypeScript 5.5.4 and generated `package-lock.json`.
- Added a minimal `core` export without implementing macro behavior.
- Added cross-platform compiled-test discovery and a smoke test.

## Verification

- `npm install`: passed; 0 vulnerabilities (`CORE-001`).
- `require.resolve('tsifdef-tsserver')`: passed; resolves to
  `dist/tsserver/plugin.js` from the extension root.
- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed; 99 tests.
- `npm pack --dry-run`: passed; package contains the core, CLI, VSCode shell,
  tsserver plugin, executable bin, source maps, declarations, and package
  metadata.
- TsScripts original HOK typecheck: passed.
- TsScripts `check --all`: passed for 2 profiles and 582 source files.
- TsScripts HOK and Domestic emit: passed; 582 files each.
- TsScripts projected HOK typecheck: passed.
- TsScripts projected Domestic typecheck: blocked by missing Domestic
  declaration packages.
- TsScripts encoding scan: `readSourceText` rejected exactly the four known
  non-UTF-8 files and accepted the remaining 578.

## Known Issues

- The conversation referred to `E:\HOK_Trunk\Programe\TsProject`; this path is
  absent. Use `E:\HOK_Trunk\Program\TsScripts` unless the user provides a
  different path.
- PowerShell's default output encoding displayed `SPEC.md` as mojibake. Read it
  explicitly as UTF-8 when needed; do not rewrite the specification merely to
  change encoding.
- Raw macro source is intentionally not valid TypeScript. Any tool invoking the
  TypeScript parser or ESLint must consume the projected view, not raw source.
- Macro definitions are external and immutable for a selected Profile. Source
  `#define`, import order, and cross-file conditional pairing are unsupported.
- The future tsserver plugin must analyze each complete current snapshot before
  returning a complete projected snapshot; slice reads cannot be projected in
  isolation, and unsaved text must not be replaced by disk content.
- Incremental caching is optional optimization only. Full uncached projection
  remains the reference behavior; cache failure must degrade to a miss and
  cached output must equal uncached output byte-for-byte. Packaged one-shot
  emit/check are uncached; packaged watch enables the cache.
- Four TsScripts source files contain invalid UTF-8 byte sequences
  (`CChampionshipSelectTicketLogic.mts`, `CChampionshipSelectTicketView.mts`,
  `CChampionshipTicketItemView.mts`, `Kernel/shortcuts_all.ts`). Check and emit
  now reject them with `SourceEncodingError` and exit code `2`; they must be
  re-encoded as UTF-8 before they can be processed. Supporting legacy encodings
  would require an explicit future configuration and byte/offset design.

## Handoff

Start by reading the files listed in `AGENTS.md`, inspect the working tree, and
begin `INT-002`. Insert `tsifdef emit`/`pipeline` ahead of the existing
`init.mjs -> compile.mjs -> build.mjs` flow so `tsc` and Babel consume the
projected tree under `Build/.macrobuild/<PROFILE>`, not raw macro source. Keep
the integration a thin wrapper over the CLI; do not duplicate macro semantics,
and preserve the no-partial-tree and encoding-safety guarantees.
