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
npm run build
```

`npm run build` uses the modern projected compiler path (`tsifdef build`) and
writes the active Profile output to `Build/.demorun/active`. `npm run watch`
keeps the same projected build alive in watch mode.

Legacy precompile is still available for comparison:

```bash
npm run legacy:compile
```

That path generates `.tsifdef/Output` first and then runs stock `tsc` against
`.tsifdef/Output/tsconfig.json`.

## What to look for

- The active Profile comes from `package.json`.
- Inactive branches are grayed and folded in VSCode.
- tsserver ignores inactive code for completions, references, rename, and quick
  fixes.
- The debug launch uses the projected build output.

No business-specific names are used in the demo.
