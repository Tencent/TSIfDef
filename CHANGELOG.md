# Changelog

Language file: [`CHANGELOG.zh-CN.md`](./CHANGELOG.zh-CN.md)

## Unreleased

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
