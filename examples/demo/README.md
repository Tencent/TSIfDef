# TSIfDef Demo Workspace

A small project for trying TSIfDef in VS Code and on the command line.

## Layout

```
examples/demo/
  Build/macros/hok.json         HOK profile (HOK on, DOMESTIC off)
  Build/macros/domestic.json    Domestic profile (DOMESTIC on, HOK off)
  Build/macros/pipeline.json    emit+typecheck pipeline config
  src/region.ts                 #if / #elif / #else / #error
  src/player.ts                 profile-specific conditional imports
  src/profiles/hok-player.ts    HOK-only global account data structure
  src/profiles/domestic-player.ts Domestic-only compliance data structure
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
3. Work in the **second** window whose title contains
   `[Extension Development Host]`, not the original repository window.
4. In the dev host:
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

The demo's `tsconfig.json` registers the TSIfDef tsserver plugin so the native
TypeScript language service projects the source before parsing it: inactive
branches and `#` directive lines never produce type errors, completions, or
duplicate-declaration diagnostics.

The extension contributes the `tsifdef-tsserver` package to VS Code's TypeScript
plugin probe path. After `npm install` and `npm run build` at the repository root,
open `src/region.ts` in the demo: with the `HOK` profile the file type-checks
cleanly even though the raw text contains `#if` / `#elif` / `#else`. Edit
the active Profile through **TSIfDef: Switch Profile** to update decorations,
folding, and the tsserver projection together. **TypeScript: Restart TS Server**
remains a fallback if the language service cache does not refresh.

> The plugin loads under the **workspace** TypeScript version. In the Extension
> Development Host, the demo is wired through `.vscode/settings.json`; in a plain
> editor session, run **TypeScript: Select TypeScript Version -> Use Workspace
> Version** and **TypeScript: Restart TS Server** if a profile change does not
> take effect. Producing a self-contained VSIX that ships the plugin is REL-001.

The CLI `pipeline` command verifies the same property in CI without an editor:
each profile type-checks against its own projected tree.

## Run and debug both profiles

In the `[Extension Development Host]` window, select the desired Profile from
the TSIfDef status bar, then open **Run and Debug** and choose
**Debug Demo (Active Profile)**.

The launch reads the current Profile directly from the extension, projects
`src` with that same Profile, compiles the
projected tree, and then starts Node with source maps pointing back to the
original `src` directory. Put a breakpoint on the `console.log` in
`src/main.ts`; it should bind and stop in the original file.

The two launches intentionally exercise different imports and incompatible data
structures. HOK imports `profiles/hok-player.ts` and produces
`openId/globalAccount/globalFeatures`. Domestic imports
`profiles/domestic-player.ts` and produces `roleId/channel/compliance`. The
terminal output includes the selected Profile and full object so a wrong branch
is immediately visible.
