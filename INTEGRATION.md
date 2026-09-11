# Integrating TSIfDef into a Project

Language file: [`INTEGRATION.zh-CN.md`](./INTEGRATION.zh-CN.md)

How to adopt TSIfDef in a TypeScript project: build, editor, and lint. The three
are independent — adopt only the pieces you need. All three read the same
Profile.

## 1. Concepts

- A **macro** is a plain identifier such as `BROWSER` or `EXPERIMENTAL`.
- A **Profile** is a JSON array of the enabled macro names. Any name not listed
  evaluates to `false`; unknown names are not an error.
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

How the Profile is produced — by hand, by a script, or by another toolchain — is
up to your project. If it is generated, keep it out of source control and make
the build fail when it is missing: a stale Profile silently produces wrong
output.

## 2. Build

Install the package and compile with `tsifdef build` instead of `tsc`:

```bash
npm install -D tsifdef
```

```jsonc
"scripts": {
  "compile": "tsifdef build",
  "watch": "tsifdef build --watch"
}
```

Emitted `.js.map` sources, `.d.ts`, and error paths all point at your original
files, so nothing downstream needs to know TSIfDef ran.

```bash
tsifdef build -p ./custom.tsconfig.json
tsifdef build -p ./tsconfig.json -- --module commonjs --outDir dist
```

`-p`/`--project` selects a tsconfig; arguments after `--` are tsc options that
override it. Switching Profiles triggers a full rebuild automatically.
`outFile` and composite references (`tsc -b`) are not supported.

## 3. Editor (VSCode)

Two pieces make `#if` gray out and stop erroring:

1. **VSCode extension** — install the TSIfDef VSIX. It grays out and folds
   inactive branches and shows the active Profile in the status bar.
2. **tsserver plugin** — ships inside that VSIX and makes the language service
   ignore inactive code. It loads through the workspace TypeScript version, so
   point the workspace at its local TypeScript:

```jsonc
// .vscode/settings.json  (or the *.code-workspace settings)
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

Then run `TypeScript: Restart TS Server`. Inactive code no longer errors, and
`#if UNKNOWN_MACRO` is treated as `false` rather than "unknown macro".

Run `TypeScript: Restart TS Server` after upgrading the extension too — the
running server keeps the old plugin until it restarts.

## 4. ESLint

Without TSIfDef, raw `#if` lines are reported as parse errors. The ESLint
processor is already in the `tsifdef` package installed for the build; no second
package is required.

Add the recommended config after the project's existing TypeScript flat config:

```javascript
// eslint.config.mjs
import tsParser from "@typescript-eslint/parser";
import tsifdef from "tsifdef/eslint-plugin";

export default [
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: { parser: tsParser },
  },
  tsifdef.configs["flat/recommended"],
];
```

Keep the project's normal `@typescript-eslint/parser` as the top-level parser so
editor integrations still recognize TypeScript validation.

No rules need to be turned off. Diagnostics report at their real line and
column, autofix and editor quick fixes work, and formatting rules such as
`prettier/prettier` stay enabled: inactive branches never produce formatting
complaints, while real issues in active code are still reported normally. The
only thing TSIfDef withholds is a fix that would overwrite a `#if` line — that
diagnostic is still reported, just without the automatic repair.

TSIfDef supports ESLint 8.57 and 9 with `@typescript-eslint/parser` 5 through 8.
Both are optional peer dependencies, so the host project controls their versions.

### Legacy `.eslintrc`

The legacy config system resolves `tsifdef` as a package named
`eslint-plugin-tsifdef`, so install the same package under that alias:

```bash
npm install -D eslint-plugin-tsifdef@npm:tsifdef
# or, for an offline release artifact:
npm install -D eslint-plugin-tsifdef@file:./tsifdef-<version>.tgz
```

```jsonc
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "extends": ["plugin:tsifdef/recommended"]
}
```

That sets the plugin, the processor, and the `import/parsers` setting. Put it
**last** in `extends` if the project also extends `plugin:import/typescript`:
that config registers `@typescript-eslint/parser` for the same extensions, and
`eslint-plugin-import` uses whichever parser is listed first.

To wire the pieces up by hand instead:

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
