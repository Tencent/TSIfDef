# Development Status

Last updated: 2026-06-21

## Current Task

`CORE-005 - Equal-length projection`

Mask all directive lines and inactive ranges with spaces while preserving every
CR/LF code unit, total UTF-16 length, and source offset. Add golden tests for
CRLF, Chinese text, surrogate pairs, and analysis/projection consistency.

## Completed This Session

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
- `npm test`: passed; 21 tests.
- `npm pack --dry-run`: passed (`CORE-001`); package contains only `dist` and package
  metadata.

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
complete `CORE-005`. Projection must consume `analyzeConditionals` output rather
than rescan or reevaluate macro rules. After verification and push, continue
automatically only if the context rule in `AGENTS.md` permits it.
