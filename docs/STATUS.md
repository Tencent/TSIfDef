# Development Status

Last updated: 2026-06-21

## Current Task

`CORE-002 - Directive scanner`

The next session should implement only this task. It must recognize C/C++-style
directive lines without treating lookalikes in strings, template strings, or
comments as directives, and return UTF-16 ranges plus structural diagnostics.

## Completed This Session

- Changed the macro syntax from TypeScript comment directives to C/C++-style
  directive lines such as `#if HOK`.
- Updated the specification to require projection to mask every directive line.
- Completed `CORE-001`.
- Created the npm package, TypeScript build, typecheck, and test configurations.
- Pinned TypeScript 5.5.4 and generated `package-lock.json`.
- Added a minimal `core` export without implementing macro behavior.
- Added cross-platform compiled-test discovery and a smoke test.

## Verification

- `npm install`: passed; 0 vulnerabilities.
- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed; 1 test.
- `npm pack --dry-run`: passed; package contains only `dist` and package
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
complete `CORE-002`. Do not implement expression parsing or branch evaluation;
those belong to `CORE-003` and `CORE-004`. Update this file to point to
`CORE-003` only after scanner tests, build, and typecheck pass.
