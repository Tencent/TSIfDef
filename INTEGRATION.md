# Integrating TSIfDef into a Project

Language file: [`INTEGRATION.zh-CN.md`](./INTEGRATION.zh-CN.md)

This guide explains how to adopt TSIfDef in a TypeScript project: build,
editor experience, and linting. TSIfDef is generic — it only needs a Profile
that lists the enabled macros. How that Profile is produced (by hand, by a
script, or by another toolchain) is up to your project.

## 1. Concepts

- A **macro** is a plain identifier such as `BROWSER` or `EXPERIMENTAL`.
- A **Profile** is a JSON array of the macro names that are enabled, e.g.
  `["BROWSER", "EXPERIMENTAL"]`. Any name not listed evaluates to `false`;
  unknown names are not an error.
- `package.json` holds the single pointer to the active Profile via the
  `tsifdef` field. Build, VSCode, tsserver, and ESLint all read it.

```jsonc
// package.json
{
  "tsifdef": "./Profiles/browser.json",
  "scripts": {
    "compile": "tsifdef build"
  }
}
```

```jsonc
// Profiles/browser.json
["BROWSER", "EXPERIMENTAL"]
```

The Profile file is an input to the build. If it is a generated artifact, keep
it out of source control and make the build fail when it is missing rather than
committing a fallback — a stale or wrong Profile silently produces wrong output.

## 2. Build

Install the CLI package and compile with `tsifdef build` instead of `tsc`:

```bash
npm install -D tsifdef
```

```jsonc
"scripts": {
  "compile": "tsifdef build",
  "watch": "tsifdef build --watch"
}
```

`tsifdef build` reads `package.json`'s `tsifdef` pointer and the project
`tsconfig.json`, applies equal-length masking to inactive `#if` branches, and
drives the TypeScript compiler itself. Because the compiler sees the original
file names, emitted `.js.map` `sources`, `.d.ts`, and error paths point at your
original sources — no post-processing, no shadow source tree to ignore. See
the examples below for project and compiler-option overrides:

```bash
tsifdef build -p ./custom.tsconfig.json
tsifdef build -p ./tsconfig.json -- --module commonjs --outDir dist
tsifdef build --watch --emit-projection .projection
```

`-p`/`--project` selects a tsconfig. Arguments after `--` are parsed as tsc
options and override that tsconfig. `--emit-projection` writes an equal-length
debug dump in both one-shot and watch mode. `outFile` and multi-project
composite references (`tsc -b`) are not supported.

Switching Profiles (editing `package.json`'s `tsifdef` pointer or the Profile
file) triggers a full rebuild automatically.

## 3. Editor experience (VSCode)

Two pieces make `#if` gray out and stop erroring in the editor:

1. **VSCode extension** — install the TSIfDef VSIX. It grays out and folds
   inactive branches, shows the active Profile in the status bar, and pushes the
   resolved Profile to the tsserver plugin.
2. **tsserver plugin** — makes the language service see only the projected
   (masked) source, so inactive code does not produce type errors and unknown
   macros are not flagged. It loads through the workspace TypeScript version.

Configure the workspace to use its local TypeScript so the plugin loads:

```jsonc
// .vscode/settings.json  (or the *.code-workspace settings)
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

After installing the extension and setting the tsdk, run
`TypeScript: Restart TS Server`. Then `#if`/`#else` blocks gray out, inactive
code does not error, and `#if UNKNOWN_MACRO` is treated as `false` rather than
"unknown macro".

## 4. ESLint

If the project uses ESLint, raw `#if` lines would otherwise be reported as parse
errors. TSIfDef ships an ESLint processor that lints the equal-length projection
instead of the raw text (positions are unchanged, so diagnostics map back
directly). Install the package under ESLint's conventional plugin name:

```bash
npm install -D eslint-plugin-tsifdef@npm:tsifdef
```

When consuming an offline release artifact, use the single tarball as that
dependency:

```bash
npm install -D eslint-plugin-tsifdef@file:./tsifdef-<version>.tgz
```

Then enable the processor in the project's ESLint config:

```jsonc
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["tsifdef"],
  "overrides": [
    {
      "files": ["*.ts", "*.mts", "*.cts", "*.tsx"],
      "processor": "tsifdef/macros"
    }
  ],
  "settings": {
    "import/parsers": {
      "eslint-plugin-tsifdef/parser": [".ts", ".tsx", ".mts", ".cts"]
    }
  }
}
```

Keep `@typescript-eslint/parser` as the top-level parser. VSCode ESLint's
default TypeScript probe recognizes that parser and will therefore validate the
file. Register the TSIfDef parser wrapper only in `settings.import/parsers`; it
is required for rules such as `import/no-cycle` that read dependency files from
disk and invoke a parser directly, bypassing ESLint processors. Keep the
processor enabled as well so the primary file is projected and synthetic
masking diagnostics can be filtered in `postprocess`.

The processor resolves the Profile the same way the CLI does (the `tsifdef`
pointer in the nearest `package.json`). The one installed package also provides
the CLI, core API, ESLint processor, and parser, so there is no companion
package version to synchronize.

### Prettier and other text rules

Equal-length masking replaces directive and inactive-branch text with spaces.
The processor removes diagnostics whose complete reported range comes only from
those synthetic masked characters. Diagnostics touching any real source text,
including real trailing whitespace, remain visible. Therefore
`prettier/prettier` and similar text rules should stay enabled.

## 5. Separation of concerns

The build path (`tsifdef build`) and the editor/lint paths are independent. Each
reads the same Profile but does its own masking:

- The build masks inactive code before emit, so output JavaScript never contains
  inactive branches.
- The tsserver plugin and ESLint processor mask what the editor and linter see,
  so tooling never reports inactive code.

They do not depend on each other; adopt only the pieces you need.
