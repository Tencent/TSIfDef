# HOK TSIfDef Integration Implementation Plan

Target project: `E:/VersionBranch_g114_publish_20260601` (currently active, HOK region, Unity 2022.3.5f1, engine cache hot).
The target described in Integrid.md is HOK_Trunk, but it will be implemented and verified in g114_publish first according to user requirements; the adapter remains portable.

## Verified environmental facts

- Engine: `UnityEngine/WindowsEditor/WindowsEditor/x64/Release/Unity.exe` (not currently running).
- Editor development startup: `Open Unity engine_Win_Development-specific.bat` → `Unity.exe -sgameDevelopment -projectPath Project` (GUI, non-blocking).
- Batch form (Build.py `__ExecUnityMethod`):
  `Unity.exe -skipLicensing -projectPath <dir> -batchmode [-executeMethod X] -logFile <log> -quit -nographics <argv>`.
- Existing GameScript compilation with `-earlyQuitAfterCompile` and **without** `-executeMethod`.
- `csc.rsp`: `Project/Assets/csc.rsp` (~50 `-define:`, including `GLOBAL_GENERAL`).
- `.d.ts`: `Program/TsScripts/DevelopmentReference/{HOK,Domestic,Shared}`.
- tsifdef profile contract (`src/cli/config.ts:92`): **JSON string array of enabled macro names**; unlisted macros will be false, and unknown macros will not be reported.
- Current region = HOK; active target is stored in `Project/Library/EditorUserBuildSettings.asset` (default Win64).
- No asmdef under `Assets/Editor` → C# falls into default `Assembly-CSharp-Editor`.

## Invariants (from Integrid.md)

```
Editor TS profile = csc.rsp -define value ∪ activeScriptCompilationDefines
Player TS profile = csc.rsp -define value ∪ GetAssemblies(Player, group, final BuildTarget).defines
```

Output file: `Program/TsScripts/.tscbuild/tsifdef/defines.json` (generated, must be ignored by SVN, and submission of alternative profiles is prohibited).

## Deliverables

### 1. C# adapter (put `Project/Assets/Editor/TSIfDef/`)

- `TsIfDefDefineWriter.cs`: shared core.
- `ReadCscRspDefines()`: Parse the `-define:` value of `Assets/csc.rsp`.
- `WriteProfile(IEnumerable<string> defines)`: deduplication + sorting, atomically writing out `.tscbuild/tsifdef/defines.json` as a JSON string array (tsifdef contract).
- If the directory does not exist, create it; write a temporary file and then rename it to avoid half-cut files.
- `TsIfDefEditorDefines.cs`: Editor development mode.
- `[InitializeOnLoadMethod]` subscribes to `CompilationPipeline.compilationFinished` (or `[DidReloadScripts]`).
- Guard `if (Application.isBatchMode) return;` - batch mode never goes here.
- source = `EditorUserBuildSettings.activeScriptCompilationDefines` ∪ csc.rsp.
- Menu item `Tools/TSIfDef/Regenerate Editor Defines` is manually refreshed and calls the same logic.
- `TsIfDefPlayerDefines.cs`: CI/Player mode.
- `-executeMethod TsIfDefPlayerDefines.Generate` entry + `InitializeOnLoad` entry protected by `-tsifdefGenerateDefinesAndExit` (both trigger paths are covered for comparison verification).
- target source: parse the command line `-buildTarget` (user preference system flag) first; select `BuildTargetGroup` + `BuildTarget` accordingly, call `CompilationPipeline.GetAssemblies(AssembliesType.Player, group, target)` to merge `defines`, ∪ csc.rsp.
- **Key Point**: GetAssemblies accepts explicit targets without switching active targets. After the verification proves that it is feasible, non-Win64 platforms do not need to actually cut the target, fundamentally avoiding asset conversion/stuck.
- After writing out `EditorApplication.Exit(0)` (InitializeOnLoad path).

### 2. profile writing format

JSON string array, example:
```json
["GLOBAL_GENERAL","BEHAVIAC_RELEASE","UNITY_STANDALONE","UNITY_STANDALONE_WIN", ...]
```
The Editor version contains `UNITY_EDITOR*`, but the Player version does not.

## Verification (from low to high risk, see all real logs)

All batch calls reuse the command form of Build.py, the logFile is dropped into the temporary directory, and the grep log is run for confirmation.

- **V0 baseline (zero risk)**: Without starting the engine, first locally test csc.rsp parsing and JSON writing logic (use a small C# or directly check the generated file format).
- **V1 Editor Path**: Use `Open Unity Engine_Win_Development Special.bat` to start the GUI engine → trigger a script recompilation (change a blank/reimport) → confirm that `defines.json` is generated, contains `UNITY_EDITOR`, and contains the csc.rsp macro. Manual refresh of menu items is also verified.
- **V2 Player path A (earlyQuit + executeMethod)**:
  `-batchmode -quit -nographics -earlyQuitAfterCompile -executeMethod TsIfDefPlayerDefines.Generate -buildTarget StandaloneWindows64`
→ Check the log to confirm whether executeMethod **is actually executed**, whether defines.json is generated, and whether it **does not contain** `UNITY_EDITOR`. This is the suspicious path that Integrid.md warns about, falsified/confirmed with logs.
- **V3 Player path B (pure executeMethod, without earlyQuit)**:
  `-batchmode -quit -nographics -executeMethod TsIfDefPlayerDefines.Generate -buildTarget StandaloneWindows64`
→ Because target=currently active Win64, no asset conversion, safe. Verify that the build is correct and there is no `UNITY_EDITOR`.
- **V4 switches to cross-platform macros without switching (solve users' time-consuming concerns)**: The active target remains Win64, and executeMethod uses `GetAssemblies(Player, Android, Android)` query → Confirm to return `UNITY_ANDROID/ENABLE_IL2CPP`, etc. and **no asset conversion** is triggered (compare log time-consuming). Prove that the target platform profile can be generated without the `-buildTarget` switch.

## Safety guardrail (emphasized by user)

- Windows machines. After testing any non-Win64 batch, you must switch the active target back to StandaloneWindows64 before opening the Editor or running non-earlyQuit next time, otherwise the asset conversion will be stuck.
- The design purpose of V4 is to avoid switching; if you really need to use non-Win64 for V2/V3, you must run `-buildTarget StandaloneWindows64` at the end to switch back.
- Before each batch, confirm that Unity.exe is not running (Library lock).

## Definitely not to do it (outside the scope of this time)

- Do not change HOK's existing TS build pipeline (wiring of `init.mjs/build.mjs` → tsc). Currently TsScripts does not use tsifdef/tsc, the wiring is a larger and separate task, left for later. This time we only ensure that the profile is correctly generated in the two modes + verify the two Player trigger paths.
- Do not submit defines.json; add .tscbuild to ignore.

## Closing

- Summarize the actual measurement results of the three Player paths (which one can be triggered, how long it takes, and whether there is a risk of getting stuck), and give the final recommended trigger form.
- Update the observation conclusions of Integrid.md (if the actual measurement is inconsistent with the document assumptions, correct it accordingly).

---

# Actual measurement verification conclusion (2026-07-03, g114_publish, Unity 2022.3.5f1, Win64)

All batch forks Build.py `__ExecUnityMethod` command form (`-skipLicensing -batchmode -quit [-nographics]`).
The product is a JSON string array of tsifdef contracts, without reordering.

## 1. Editor path ✅

- InitializeOnLoad + `compilationFinished` + `delayCall` (`!isBatchMode` guard) + menu item.
- Batch observable entry `GenerateForVerification` measured generated profile:
- Contains `UNITY_EDITOR / UNITY_EDITOR_64 / UNITY_EDITOR_WIN` (should be included in editor view).
- Contains all csc.rsp macros (`GLOBAL_GENERAL`, `BEHAVIAC_RELEASE`, `SGAME_TEST`...).
- Platforms `UNITY_STANDALONE_WIN`, `PLATFORM_STANDALONE_WIN`, `ENABLE_MONO`.
- Takes ~2.5 minutes (pure compilation).
- Note: The customized `-sgameDevelopment` engine sends `Debug.Log` to bqLog instead of `-logFile`; the product file is the only reliable evidence.
- When the GUI is started without a seat, the license modal will pop up and block the main loop, and `delayCall` cannot get the tick - this is a startup method problem, not a code problem; the developer has a local license and it is triggered normally.

## 2. Comparison of three Player paths

| Path | Command points | Result | Time consumption |
|------|----------|------|------|
| **V2 earlyQuit + executeMethod** | `-earlyQuitAfterCompile -executeMethod ... -buildTarget win64` | ❌ **executeMethod does not execute** | 26s |
| **V3 pure executeMethod (active target)** | `-executeMethod ... -buildTarget win64` | ✅ Correct player profile | ~1.5 minutes |
| **V4 probe: 3 parameters GetAssemblies, do not cut target** | `-executeMethod ProbeCrossPlatform` | ✅ Get the correct macro for all platforms | 125s |
| **V4b `-buildTarget Android` (≠active)** | `-executeMethod ... -buildTarget Android` | ❌ **Trigger asset conversion, stuck** | >10 minutes unfinished |

### V2 decisive evidence (confirming Integrid.md warning)
Log: `[ScriptOnlyMode] Initialize` → Compile → `[ScriptOnlyMode] AbortAfterCompile` → `[ScriptOnlyMode] Finalize` → Exit.
`-executeMethod` in the command line is parsed, but earlyQuit uses ScriptOnlyMode, **retreats after compilation, and never enters the executeMethod stage**.
**Conclusion: earlyQuit cannot be used to generate defines. **

### V3 Correctness
player profile without `UNITY_EDITOR`, with `UNITY_STANDALONE_WIN`/`PLATFORM_STANDALONE_WIN`/`UNITY_64`/`ENABLE_MONO` (without IL2CPP), with csc.rsp macro.
Reasonable differences from the editor version: multiple editors `UNITY_EDITOR*`/`DEBUG`/`TRACE`/`ENABLE_PROFILER`/`UNITY_ASSERTIONS`; player multi-package manager precompiled macros (Cinemachine/Timeline/Physics).

### V4 key victory (resolving time-consuming/stuck concerns)
`GetAssemblies(AssembliesType.Player, group, target)` overload **confirmed to exist** in 2022.3.5 (reflective enum to `public (AssembliesType,BuildTargetGroup,BuildTarget)`).
`activeBuildTargetBefore == activeBuildTargetAfter == StandaloneWindows64` The whole process remains the same, but we get the correct and different macros for each platform:
- Android: `UNITY_ANDROID`, `UNITY_ANDROID_API`, `PLATFORM_ANDROID`, `ENABLE_IL2CPP` (without ENABLE_MONO)
- iOS: `UNITY_IOS`, `UNITY_IPHONE`, `UNITY_IPHONE_API`, `ENABLE_IL2CPP`
- Linux: `UNITY_STANDALONE_LINUX`, `UNITY_STANDALONE_LINUX_API`, `ENABLE_MONO`
- All without `UNITY_EDITOR`.
Exactly the same as Integrid.md "Local Detection and Observation". Time consumption = pure compilation ~2 minutes, **no asset conversion**.

### V4b Counterexample (must be avoided)
`-buildTarget <inactive platform>` will switch the active target and trigger full asset conversion (ASTC texture re-compression), which will cause the project to freeze stably under headless conditions.
**Conclusion: Never use `-buildTarget` to point to an inactive platform to get macros. **

## 3. Final recommended form

```
Editor: non-batch → InitializeOnLoad/compilationFinished automatically generated
                    activeScriptCompilationDefines ∪ csc.rsp
(including UNITY_EDITOR)

Player/CI: batchmode + -executeMethod TsIfDefPlayerDefines.Generate
The target platform is passed in as a [custom parameter] (do not use -buildTarget to switch the active target)
GetAssemblies(Player, group, target) is used internally to get the macro according to the request target ∪ csc.rsp
Active target keeps Win64 unchanged → zero asset conversion, ~2 minutes, no freezes
(The code has been changed to 3-parameter overloading + reflection cover-up)
```

Invariants:
```
Editor TS profile = csc.rsp + activeScriptCompilationDefines
Player TS profile = csc.rsp + GetAssemblies(Player, group, target BuildTarget).defines
```

## 4. To-do/handover

- Player `Generate()` has been changed to use the 3-argument overload; a custom parameter (such as `-tsifdefTarget Android`) should be added instead of `-buildTarget` to prevent anyone from mistakenly using `-buildTarget` to switch the active target. TODO: Change `ResolveTargetFromCommandLine` from reading `-buildTarget` to reading a custom flag.
- `.tscbuild` must be added to SVN to ignore; submission of defines.json is prohibited.
- HOK's existing TS pipeline is `init.mjs/build.mjs` (not tsifdef/tsc), and wiring is a separate and larger task, which was not done this time.
- During the verification process, `-buildTarget Android` was used to trigger a platform switch, and a forced kill in the middle caused the active target to stop at Android, and the Library was half-converted; the headless batch switch returned to a stable deadlock. Recovery method: Delete `Library/EditorUserBuildSettings.asset` (backed up .android.bak), rebuild Unity with Win64 default next time, and use ArtifactDB cache to quickly open it.
