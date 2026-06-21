# Development Status

Last updated: 2026-06-21

## Current Task

`CLI-006 - Source encoding safety`

Reject malformed UTF-8 source input before analysis or projection, preserve
existing emit output on failure, and report the relative source file through
stable programmatic and packaged CLI failures.

## Completed This Session

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
- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed; 45 tests.
- `npm pack --dry-run`: passed; package contains the core, CLI, executable bin,
  source maps, declarations, and package metadata.
- TsScripts original HOK typecheck: passed.
- TsScripts `check --all`: passed for 2 profiles and 582 source files.
- TsScripts HOK and Domestic emit: passed; 582 files each.
- TsScripts projected HOK typecheck: passed.
- TsScripts projected Domestic typecheck: blocked by missing Domestic
  declaration packages.

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
- Four TsScripts source files contain invalid UTF-8 byte sequences. Current
  source loading silently produces replacement characters and changes emitted
  bytes; one-shot emit is not safe for those files until `CLI-006` is complete.

## Handoff

Start by reading the files listed in `AGENTS.md`, inspect the working tree, and
complete `CLI-006`. Add shared validated UTF-8 source loading for check and
emit, retain a correctly encoded literal `U+FFFD`, fail before output
replacement, and cover both programmatic and packaged CLI behavior.
