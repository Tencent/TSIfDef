# Changelog

## v1.1.8 - 2026-09-11

First public release.

- `#if` / `#elif` / `#else` / `#endif` conditional compilation for TypeScript,
  driven by a Profile: a JSON array of enabled macro names referenced from
  `package.json`.
- `tsifdef build` compiles through TypeScript with inactive branches masked at
  equal length, so emitted `.js`, `.js.map` sources, `.d.ts`, and error paths
  point at the original files. Incremental builds and `--watch` are supported.
- VSCode extension that dims and folds inactive branches and shows the active
  Profile in the status bar.
- tsserver plugin, shipped in the same VSIX, so the language service reports no
  errors on inactive code and treats unknown macros as `false`.
- ESLint processor and parser wrapper in the same npm package. Diagnostics keep
  their real line and column, autofix and quick fixes keep working, and
  formatting rules such as `prettier/prettier` can stay enabled.
- Flat config via `tsifdef.configs["flat/recommended"]`, and legacy `.eslintrc`
  via `extends: ["plugin:tsifdef/recommended"]`.
- Supports ESLint 8.57 and 9 with `@typescript-eslint/parser` 5 through 8, both
  as optional peer dependencies.
- Portable specification and implementation-neutral conformance fixtures under
  `spec/`.
