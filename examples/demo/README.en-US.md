# TSIfDef Demo Workspace

This demo shows TSIfDef with neutral sample macros only:

- `TEST_A`
- `TEST_B`
- `TEST_SHARED`

## How to run

```bash
cd examples/demo
npm install
npm run precompile
npm run compile
```

Demo `package.json`:

```json
{
  "tsifdef": "./profiles/TEST_A.json",
  "scripts": {
    "precompile": "tsifdef",
    "compile": "tsc -p .tsifdef/Output/tsconfig.json"
  }
}
```

`npm run precompile` generates `.tsifdef/Output`, and `npm run compile` runs
stock `tsc` against `.tsifdef/Output/tsconfig.json`.

Current-project `files`, `include`, and `exclude` are part of the precompile
contract. Separate subprojects keep their own `tsifdef` configuration and are
not rewritten implicitly.

## What to look for

- The active Profile comes from `package.json`.
- Inactive branches are grayed and folded in VSCode.
- tsserver ignores inactive code for completions, references, rename, and quick
  fixes.
- The debug launch uses the projected build output.

No business-specific names are used in the demo.
