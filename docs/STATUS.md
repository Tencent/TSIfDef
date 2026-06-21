# Development Status

Last updated: 2026-06-21

## Current Task

`CORE-003 - Expression parser`

Implement identifiers, `defined(NAME)`, `!`, `&&`, `||`, and parentheses with
the specified precedence. Report syntax and unknown-macro diagnostics using
UTF-16 source ranges. Do not evaluate conditional branch groups in this task.

## Completed This Session

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
- `npm test`: passed; 9 tests.
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
complete `CORE-003`. Reuse scanner argument offsets when mapping expression
diagnostics. Do not implement conditional branch evaluation; that belongs to
`CORE-004`. After verification and push, continue automatically only if the
context rule in `AGENTS.md` permits it.
