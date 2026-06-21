# TSIfDef Demo Workspace

A small project for trying TSIfDef in VS Code and on the command line.

## Layout

```
examples/demo/
  Build/macros/hok.json         HOK profile (HOK on, DOMESTIC off)
  Build/macros/domestic.json    Domestic profile (DOMESTIC on, HOK off)
  Build/macros/pipeline.json    emit+typecheck pipeline config
  src/region.ts                 #if / #elif / #else / #error
  src/player.ts                 nested #if (GLOBAL_GENERAL inside HOK)
  src/main.ts                   plain consumer
  tsconfig.hok.json             typechecks the projected HOK tree
  tsconfig.domestic.json        typechecks the projected DOMESTIC tree
```

Raw `src/*.ts` is intentionally **not** valid TypeScript: the `#if` lines are
macro directives. TSIfDef projects them away (masked to spaces) before `tsc` or
the language service sees the code.

## Try it in VS Code (extension UI)

From the repository root (`E:\TsIfDef`):

1. `npm install` then `npm run build`.
2. Press **F5** (or Run and Debug -> "Run TSIfDef Extension"). This launches an
   Extension Development Host with `examples/demo` already open.
3. In the dev host:
   - The status bar shows `TSIfDef: HOK` (the demo sets `tsifdef.profile` to
     `HOK` in `.vscode/settings.json`).
   - Open `src/region.ts`: the `#elif DOMESTIC` branch is **grayed** and
     **foldable**; macro structure diagnostics (if any) appear in Problems.
   - Run **TSIfDef: Switch Profile** from the Command Palette and pick
     `domestic`: the gray/fold flips to the `#if HOK` branch.
   - Run **TSIfDef: Check Macros**, **TSIfDef: Emit Projected Sources**, and
     **TSIfDef: Watch and Emit** / **Stop Watch** to drive the local CLI.

The status bar, profile switch, graying, folding, diagnostics, and the local
commands all work in the Extension Development Host without any extra setup.

## Try it on the command line

From the repository root, after `npm run build`:

```bash
# Validate macro structure for every profile (no writes).
node dist/cli/main.js check --all --root examples/demo --source src

# Project one profile into Build/.macrobuild/<PROFILE> (source is never changed).
node dist/cli/main.js emit --profile HOK      --root examples/demo --source src
node dist/cli/main.js emit --profile DOMESTIC --root examples/demo --source src

# Emit + typecheck every profile against its own tsconfig.
node dist/cli/main.js pipeline --root examples/demo --source src
```

`emit` writes the equal-length projected source under
`examples/demo/Build/.macrobuild/<PROFILE>`; open those files to see the inactive
branches replaced by spaces while line numbers and offsets are preserved.

## tsserver plugin (editor type-checking ignores inactive code)

The extension layer above only grays and folds; the native TypeScript language
service still parses the raw `#` lines. Making tsserver itself project the
source (so inactive branches never produce type errors or completions) uses the
plugin in `dist/tsserver/plugin.js`. Wiring that plugin into the packaged VSIX so
the workspace TypeScript loads it is handled by REL-001; until then, use the
`pipeline` command above to verify that each profile type-checks against its own
projected tree and declarations.
