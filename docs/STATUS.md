# Development Status

Last updated: 2026-06-21

## Current Task

`CLI-005 - TsScripts pilot integration`

Inspect `E:\HOK_Trunk\Program\TsScripts` non-destructively, identify its source,
profile, tsconfig, and build constraints, run safe check/emit pilot commands
with generated output only under `Build/.macrobuild`, and document results.

## Completed This Session

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

## Known Issues

- The conversation referred to `E:\HOK_Trunk\Programe\TsProject`; this path is
  absent. Use `E:\HOK_Trunk\Program\TsScripts` unless the user provides a
  different path.
- PowerShell's default output encoding displayed `SPEC.md` as mojibake. Read it
  explicitly as UTF-8 when needed; do not rewrite the specification merely to
  change encoding.
- Raw macro source is intentionally not valid TypeScript. Any tool invoking the
  TypeScript parser or ESLint must consume the projected view, not raw source.

## Handoff

Start by reading the files listed in `AGENTS.md`, inspect the working tree, and
complete `CLI-005`. Inspect the external project before choosing command roots;
do not modify tracked source or existing build configuration. Record exact
commands, output locations, diagnostics, and any blockers for later integration.
