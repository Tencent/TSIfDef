# TSIfDef Integration with TsScripts — Revised Plan

Two issues with the previous version (user feedback):
1. Write `#if AAAA` in VSCode and it will not be grayed out but will report an error - **Editor plugin (VSIX + tsserver plugin) is not installed at all**, only CLI is used for compilation.
2. Hack 4 tsc calls one by one inside compile.mjs, which is not the standard `precompile` form of the document.

User choice: install vsix + tsdk; change to standard precompile mode.

## Key status quo (verified)

- How it works: Open `TsScripts.code-workspace` (multi-folder: TsScripts + Puerts + C# + Tdr).
- There is **no** `typescript.tsdk` in workspace/settings, **no** tsserver plugin, **not installed** TSIfDef extension → half of the editor is completely missing.
- The source code is mainly `.mts` (579) and a small amount of `.ts` (3); the plug-in extension matches `.ts/.tsx/.mts/.cts`, which is not an extension problem.
- `SystemScripts/tsconfig.json` is generated from `tsconfig.gen.mjs` on REGION **regeneration** every time `init.mjs` is pressed;
`tsconfig.build.json` extends it. So the source tsconfig is a per-zone build.
- All tsc calls are in 4 places of `compile.mjs` (`compile_cjs/esm`, `watch_cjs/esm`), which are reused by `build.mjs`/`miniapp`.
- There is `node_modules/typescript` locally (can be used as tsdk to host tsserver plugin).
- TSIfDef artifacts: `release/tsifdef-1.0.0.vsix` (extended), `tsifdef-1.0.0.tgz` (CLI, installed).
- The generated product is `.tsifdef/Output/tsconfig.json` (not package.json).

## Question 1: Editor plug-in (grayed/collapsed/no error reported)

TSIfDef editor half set = **VSCode extension** (grayed, collapsed, status bar, Profile monitoring) + **tsserver plugin**
(Hijack getScriptSnapshot so that the language service only sees the projection and does not report errors for inactive code).

step:
1. Install the extension: `code --install-extension E:/TSIfDef/release/tsifdef-1.0.0.vsix` (or manually install VSIX in VSCode).
2. The workspace is equipped with `typescript.tsdk` pointing to the local TS of the project:
Add `"typescript.tsdk": "node_modules/typescript/lib"` to the settings of `TsScripts.code-workspace`,
and `"typescript.enablePromptUseWorkspaceTsdk": true`.
(tsserver plugin is loaded through the workspace TS version, `contributes.typescriptServerPlugins` in package.json
`enableForWorkspaceTypeScriptVersions` declared. )
3. Make sure package.json has a `tsifdef` pointer (added) - both extensions and plugins read the current Profile from it.
4. `TypeScript: Restart TS Server` in VSCode makes the plugin effective.

Verification: Open a `.mts` and write
```
#if GLOBAL_GENERAL
const a = 1;
#else
const b: NotAType = 2; // Not activated, should be covered by projection, no error will be reported
#endif
```
Expected: `#else` block is grayed out + collapsed, `NotAType` does not report an error (because tsserver cannot see it); `#if AAAA` (undefined macro)
"Unknown macro" is not reported, and the entire block is treated as false.

## Question 2: Change to standard precompile mode

Target: Explicit `precompile` task in package.json + compilation points to projected tsconfig, rather than scattered inside mjs.
However, most of the tasks in this project go to `Build/bin/pipeline/*.mjs`, tsc is buried in it, and pure package.json cannot cover mjs.
Compromise: **Two layers** - package.json exposes standard entries + a centralized switch throughout mjs.

### 2a. Roll back compile.mjs internal changes

Convergence the 4 `PROJECTED_TSCONFIG` changes in compile.mjs in the previous version: do not hack in each function,
Instead, let `run_tsifdef()` produce the projection, and then use a `TSCONFIG_EFFECTIVE` variable to determine who tsc -p points to:
- define `const TSCONFIG_EFFECTIVE = USE_TSIFDEF ? PROJECTED_TSCONFIG : TSCONFIG`.
- 4 places where tsc uses `${TSCONFIG_EFFECTIVE}`.
- Unified `await run_tsifdef()` (once) at the beginning of the compilation process instead of calling each function individually.

### 2b. package.json exposes standard tasks (document form)

```json
"scripts": {
  "precompile": "tsifdef --project SystemScripts/tsconfig.build.json",
  "compile": "npm run precompile && node Build/bin/pipeline/init.mjs --check-eslint && node Build/bin/pipeline/compile.mjs --use-tsc-cache-one-day",
  ...
}
```
However, `init.mjs` regenerates tsconfig, so tsifdef must run after init. The
precompile step cannot simply be prefixed to the existing command.
You need to run tsifdef after init (generating tsconfig) and before tsc of compile.mjs. That's why 2a
`run_tsifdef()` is placed in the compile.mjs process (init has been run first in npm script).

### 2c. Let “all tasks be covered”

- Directly/indirectly go to compile.mjs: `watch`/`compile`/`build`/`compile:devops_pipeline` → covered by `run_tsifdef` + `TSCONFIG_EFFECTIVE`.
- `build:v8cc`/miniapp series → Confirm whether their compilation also passes compile.mjs; if there is an independent tsc, it must be connected in the same way.
- Pure tool task (proto/faas/tdrjs/push) does not compile TS and does not need to be connected.

## Pending/Risk

- **sourcemap sources point to .tsifdef/Output**: The problems found in the previous version are still there. Changing to standard mode does not automatically solve the problem.
It is necessary to confirm whether debugging/CrashSight is affected; if affected, use sourceRoot or map to rewrite the processing (open separately).
- init.mjs regenerates tsconfig and tsifdef in the order: init → tsifdef → tsc.
- watch mode tsifdef no watch: source code structure changes require re-running.

## Explicitly do not do it

- Not picking up 3 library subpackages.
- Do not change Unity adapter (macro generation verified OK).
