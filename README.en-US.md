# TSIfDef

TSIfDef is source-level conditional compilation for TypeScript.

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

## Use in VSCode

1. Install the VSIX release artifact.
2. Open a workspace with a `package.json` `tsifdef` pointer.
3. The status bar shows the active Profile file.
4. Gray ranges, folding, diagnostics, and tsserver projection all follow that
   Profile.

## Release

```bash
npm run release
```

This emits:

- `release/tsifdef-1.0.0.vsix`
- `release/tsifdef-1.0.0.tgz`
- `release/manifest.json`

The canonical version is stored in `src/version.ts`.
