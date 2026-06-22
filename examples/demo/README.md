# TSIfDef Demo Workspace

Language files: `README.en-US.md` and `README.zh-CN.md`

This demo shows TSIfDef with neutral sample macros only:

- `TEST_A`
- `TEST_B`
- `TEST_SHARED`

## How to run

```bash
cd examples/demo
npm install
npm run compile
```

`npm run precompile` generates `.tsifdef/Output`, and `npm run compile` runs
stock `tsc` against `.tsifdef/Output/tsconfig.json`.

## What to look for

- The active Profile comes from `package.json`.
- Inactive branches are grayed and folded in VSCode.
- tsserver ignores inactive code for completions, references, rename, and quick
  fixes.
- The debug launch uses the projected build output.

No business-specific names are used in the demo.
