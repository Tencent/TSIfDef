# TSIfDef

Language file: [`README.zh-CN.md`](./README.zh-CN.md)

TSIfDef is source-level conditional compilation for TypeScript. The core macro
analysis is shared across the CLI, tsserver plugin, VSCode extension, and ESLint
processor — no environment reimplements the macro rules.

## Install

```bash
npm install
npm run build
```

## Use in a project

Add a `tsifdef` pointer plus the precompile/compile scripts to `package.json`,
for example:

```json
{
  "tsifdef": "./Profiles/TEST_A.json",
  "scripts": {
    "precompile": "tsifdef",
    "compile": "tsc -p .tsifdef/Output/tsconfig.json"
  }
}
```

Create the selected Profile as a JSON array of enabled macro names.

1. Run the precompile step to generate `.tsifdef/Output`:

```bash
npm run precompile
```

2. Compile the generated project from `.tsifdef/Output`:

```bash
npm run compile
```

Current-project `files`, `include`, and `exclude` are part of the precompile
contract. Separate subprojects keep their own `tsifdef` configuration and are
not rewritten implicitly.

## Use in VSCode

1. Install the VSIX release artifact.
2. Open a workspace with a `package.json` `tsifdef` pointer.
3. The status bar shows the active Profile file.
4. Gray ranges, folding, diagnostics, and tsserver projection all follow that
   Profile.

## Use with ESLint

ESLint parses the raw source with its own parser, so without integration a
`#if` line makes it fail with `Parsing error: ';' expected`. TSIfDef ships an
ESLint processor that projects the source (equal-length masking) before ESLint
sees it — the mirror of the tsserver `getScriptSnapshot` hook.

Installing the tgz runs a `postinstall` that drops a tiny forwarder package
`node_modules/eslint-plugin-tsifdef` (ESLint resolves `plugins: ["tsifdef"]` to
an `eslint-plugin-tsifdef` package, which npm aliases cannot satisfy). Then add
one override in the project's `.eslintrc`:

```json
{
  "plugins": ["tsifdef"],
  "overrides": [
    { "files": ["*.ts", "*.mts", "*.cts", "*.tsx"], "processor": "tsifdef/macros" }
  ]
}
```

Inactive branches are masked, so ESLint lints only the active view; diagnostics
keep their original line/column because masking preserves length.

Note on Prettier: equal-length masking turns directive lines (`#if`, `#endif`,
…) into runs of spaces. `tsc` ignores whitespace, but `prettier/prettier` flags
trailing-space lines. If that noise is unwanted, disable the rule in the
project's `.eslintrc`:

```json
"rules": { "prettier/prettier": "off" }
```

## Release

To produce the version-matched artifacts:

```bash
npm run release
```

That emits:

- `release/tsifdef-1.0.0.vsix`
- `release/tsifdef-1.0.0.tgz`
- `release/manifest.json`

The canonical version is stored in `src/version.ts`.
