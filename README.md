# TSIfDef

Chinese documentation: [README.zh-CN.md](https://github.com/Tencent/TsIfDef/blob/main/README.zh-CN.md)

TSIfDef is source-level conditional compilation for TypeScript. The core macro
analysis is shared across the CLI, tsserver plugin, VSCode extension, and ESLint
processor — no environment reimplements the macro rules.

The portable syntax specification and implementation-neutral conformance
fixtures live in [`spec/`](./spec/README.md). They can be used independently to
verify compatible implementations.

## Install

Add TSIfDef to a TypeScript project:

```bash
npm install --save-dev tsifdef
```

To build this repository from source instead:

```bash
npm install
npm run build
```

Requirements: Node.js 18.17 or newer, TypeScript 5.5, and VSCode 1.85 or
newer when using the editor extension.

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

The VSIX contains the small module shim required by VSCode's built-in
TypeScript language service; it does not bundle another copy of TypeScript or
add runtime dependencies to the host project. If the built-in TypeScript
language service is unavailable or disabled, TSIfDef skips language-service
integration without reporting an extension error. Its independent editor
features, such as inactive-code decorations and folding, remain available.

## Use with ESLint

ESLint parses the raw source with its own parser, so without integration a
`#if` line makes it fail with `Parsing error: ';' expected`. TSIfDef ships an
ESLint processor that projects the source (equal-length masking) before ESLint
sees it — the mirror of the tsserver `getScriptSnapshot` hook.

Install the single TSIfDef package under ESLint's conventional plugin name.
The package still exposes the `tsifdef` CLI:

```bash
npm install --save-dev eslint-plugin-tsifdef@npm:tsifdef
```

For file-based or offline integration, point that one dependency at the release
tarball:

```bash
npm install --save-dev eslint-plugin-tsifdef@file:./tsifdef-<version>.tgz
```

The unified package exposes its processor at the package root and its parser at
`eslint-plugin-tsifdef/parser`. Add one override in the project's `.eslintrc`:

```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["tsifdef"],
  "overrides": [
    { "files": ["*.ts", "*.mts", "*.cts", "*.tsx"], "processor": "tsifdef/macros" }
  ],
  "settings": {
    "import/parsers": {
      "eslint-plugin-tsifdef/parser": [".ts", ".tsx", ".mts", ".cts"]
    }
  }
}
```

Keep `@typescript-eslint/parser` as the top-level parser. VSCode ESLint's default
TypeScript probe recognizes that parser and will therefore validate the file.
The TSIfDef parser wrapper is registered only in `settings.import/parsers`; it
projects dependency files for rules such as `import/no-cycle` that read them
directly and bypass processors. Keep the processor as well: it projects the
primary file and filters diagnostics caused by synthetic masking.

Inactive branches are masked, so ESLint lints only the active view; diagnostics
keep their original line/column because masking preserves length. Diagnostics
caused solely by the synthetic masked ranges are removed in `postprocess`, while
diagnostics touching real source text are preserved. This includes text-based
rules such as `prettier/prettier`, so projects can keep their formatting rules
enabled.

## Release

To produce the version-matched artifacts:

```bash
# Set the next version once; npm also refreshes package-lock.json.
npm version <patch|minor|major|x.y.z> --no-git-tag-version
npm run release
```

That emits and smoke-tests:

- `release/tsifdef-<version>.vsix`
- `release/tsifdef-<version>.tgz`
- `release/manifest.json`

The release check installs the tarball under the ESLint plugin alias in a clean
temporary project, loads the ESLint processor and parser, runs the CLI, and
installs the VSIX into an isolated VSCode extensions directory.

The only manually configured version is `package.json` `version`. Build and
release synchronize generated source and helper-package metadata from it before
compilation; do not edit `src/version.ts`, `package-lock.json`, or helper
manifests to change the product version.
