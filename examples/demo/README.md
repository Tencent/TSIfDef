# TSIfDef Demo Workspace

A small project for trying TSIfDef in VS Code and on the command line.

## Layout

```
examples/demo/
  profiles/HOK.json             HOK enabled-macro Profile file
  profiles/Domestic.json        Domestic enabled-macro Profile file
  src/region.ts                 #if / #elif / #else / #error
  src/player.ts                 profile-specific conditional imports
  src/profiles/hok-player.ts    HOK-only global account data structure
  src/profiles/domestic-player.ts Domestic-only compliance data structure
  src/main.ts                   plain consumer
  tsconfig.json                 ordinary project TypeScript configuration
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
   - The status bar shows `TSIfDef: HOK.json`, selected by the demo
     `package.json` `tsifdef` field.
   - Open `src/region.ts`: the `#elif DOMESTIC` branch is **grayed** and
     **foldable**; macro structure diagnostics (if any) appear in Problems.
   - Change `package.json` `tsifdef` to `./profiles/Domestic.json`: the
     extension and tsserver update automatically and the gray/fold flips.

The status bar, profile switch, graying, folding, diagnostics, and the local
commands all work in the Extension Development Host without any extra setup.

## Try it on the command line

From the repository root, after `npm run build`:

```bash
# Validate one explicit Profile file (no writes).
cd examples/demo
node ../../dist/cli/main.js
npx tsc -p .tsifdef/Output/tsconfig.json
```

Alternatively, from `examples/demo`, run `npm run compile`. npm automatically
runs the configured `precompile` script first and then invokes stock `tsc`.

Precompile uses the TypeScript Compiler API and the original tsconfig, so its
manifest records the exact roots and imports. The generated project remains in
`.tsifdef/Output` for CI inspection; `tsc` itself is not wrapped.

## tsserver plugin (editor type-checking ignores inactive code)

The extension contributes the TSIfDef tsserver plugin, so the ordinary project
`tsconfig.json` needs no plugin entry. The native TypeScript language service
projects the source before parsing it: inactive
branches and `#` directive lines never produce type errors, completions, or
duplicate-declaration diagnostics.

The extension contributes the `tsifdef-tsserver` package to VS Code's TypeScript
plugin probe path. After `npm install` and `npm run build` at the repository root,
open `src/region.ts` in the demo: with the `HOK` profile the file type-checks
cleanly even though the raw text contains `#if` / `#elif` / `#else`. Change the
package.json `tsifdef` pointer to update decorations, folding, and the tsserver
projection together. **TypeScript: Restart TS Server**
remains a fallback if the language service cache does not refresh.

> The plugin loads under the **workspace** TypeScript version. In the Extension
> Development Host, the demo is wired through `.vscode/settings.json`; in a plain
> editor session, run **TypeScript: Select TypeScript Version -> Use Workspace
> Version** and **TypeScript: Restart TS Server** if a profile change does not
> take effect. Producing a self-contained VSIX that ships the plugin is REL-001.

The precompile integration test verifies the same property without an editor.

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
