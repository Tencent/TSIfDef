# TSIfDef

Chinese documentation: [README.zh-CN.md](https://github.com/Tencent/TsIfDef/blob/main/README.zh-CN.md)

TSIfDef is source-level conditional compilation for TypeScript. The core macro
analysis is shared across the CLI, tsserver plugin, VSCode extension, and ESLint
processor — no environment reimplements the macro rules.

## Install

```bash
npm install
npm run build
```

## Use in a project

Add a `tsifdef` pointer and a `tsifdef build` compile script to `package.json`,
for example:

```json
{
  "tsifdef": "./Profiles/TEST_A.json",
  "scripts": {
    "compile": "tsifdef build",
    "watch": "tsifdef build --watch"
  }
}
```

Create the selected Profile as a JSON array of enabled macro names.

Compile with projected compilation:

```bash
npm run compile
```

`tsifdef build` hijacks the TypeScript CompilerHost to feed equal-length masked
text under the original file names and drives `program.emit()` itself. Because
the compiler sees the original paths, emitted `.js.map` sources, `.d.ts`, and
error messages point at the original sources — no post-processing and no shadow
source tree to ignore. Incremental builds and `--watch` are supported; switching
the Profile forces a full rebuild.

Current-project `files`, `include`, and `exclude` are honored. Separate
subprojects keep their own `tsifdef` configuration and are not rewritten
implicitly. `outFile` and project references (`tsc -b`) are not supported.

For auditing, `tsifdef build --emit-projection <dir>` also writes the masked
projection under `<dir>` at each file's original relative path; the same flag is
available in `--watch` mode. The dump is a debug artifact and is never fed to
the compiler.

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
# Set the next version once; npm also refreshes package-lock.json.
npm version <patch|minor|major|x.y.z> --no-git-tag-version
npm run release
```

That emits:

- `release/tsifdef-<version>.vsix`
- `release/tsifdef-<version>.tgz`
- `release/manifest.json`

The only manually configured version is `package.json` `version`. Build and
release synchronize generated source and helper-package metadata from it before
compilation; do not edit `src/version.ts`, `package-lock.json`, or helper
manifests to change the product version.
