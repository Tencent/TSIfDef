# HOK Trunk TSIfDef Integration Notes

Language file: [`INTEGRATION.zh-CN.md`](./INTEGRATION.zh-CN.md)

These are local notes for applying TSIfDef to `E:\HOK_Trunk`. They are
deliberately not a product roadmap task and should not be committed unless the
integration is later formalized.

## Guiding Rule

HOK must not maintain a separate TypeScript macro configuration.

The generated TSIfDef profile must be derived from the same C# macro state that
produced the `.d.ts` files the TypeScript consumes.

```text
Project/Assets/csc.rsp
  -> Unity C# compilation
  -> generated .d.ts
  -> generated TSIfDef profile JSON
  -> TSIfDef / tsc
```

If the JSON is missing or stale, TypeScript compilation must fail before running
TSIfDef or `tsc`. Committing a fallback profile would mask an incorrect macro
state, so it is not allowed.

## Profile File

The real HOK profile path stays stable in `package.json`, but the file it points
at is a generated artifact:

```json
{
  "tsifdef": "./.tscbuild/tsifdef/defines.json"
}
```

`Program/TsScripts/.tscbuild` must be SVN-ignored. At minimum the following
generated file must not be committed:

```text
Program/TsScripts/.tscbuild/tsifdef/defines.json
```

TSIfDef's own projection output is also a generated build artifact and stays out
of source control.

## Editor Development Mode

When a developer opens the Unity Editor normally, the correct TS profile is the
editor compilation profile.

Use:

```csharp
EditorUserBuildSettings.activeScriptCompilationDefines
```

This profile is expected to contain editor-only symbols such as `UNITY_EDITOR`
and `UNITY_EDITOR_WIN`. That is correct for editor development, because the
`.d.ts` and C# view being edited also come from the editor compilation.

Recommended trigger:

```text
Unity script reload / compile callback
  -> read activeScriptCompilationDefines
  -> optionally union Project/Assets/csc.rsp -define values
  -> write Program/TsScripts/.tscbuild/tsifdef/defines.json
```

A menu item can call the same generator for a manual refresh.

## CI / Player Mode

For the final player target, do not use
`EditorUserBuildSettings.activeScriptCompilationDefines` as the macro source. It
is the editor compilation view and contains `UNITY_EDITOR`.

Use Unity's player assembly API:

```csharp
CompilationPipeline.GetAssemblies(AssembliesType.Player, group, target)
```

Merge the returned assemblies' `defines`, optionally unioned with the `-define:`
values in `Project/Assets/csc.rsp` as a safety check. The target must be the
final player `BuildTarget`, not merely the editor's currently active target.

Observed from local probing:

```text
StandaloneWindows64:
  has UNITY_STANDALONE, UNITY_STANDALONE_WIN, PLATFORM_STANDALONE,
      PLATFORM_STANDALONE_WIN, ENABLE_MONO, UNITY_64
  no UNITY_EDITOR

Android:
  has UNITY_ANDROID, UNITY_ANDROID_API, PLATFORM_ANDROID, ENABLE_IL2CPP
  no UNITY_EDITOR, no ENABLE_MONO

iOS:
  has UNITY_IOS, UNITY_IPHONE, UNITY_IPHONE_API, PLATFORM_IOS, ENABLE_IL2CPP
  no UNITY_EDITOR, no ENABLE_MONO

StandaloneLinux64:
  has UNITY_STANDALONE, UNITY_STANDALONE_LINUX,
      UNITY_STANDALONE_LINUX_API, PLATFORM_STANDALONE,
      PLATFORM_STANDALONE_LINUX, ENABLE_MONO, UNITY_64
  no UNITY_EDITOR, no UNITY_STANDALONE_WIN
```

Linux is an especially useful proof: the local editor active target is still
`StandaloneWindows64`, yet querying
`GetAssemblies(Player, ..., StandaloneLinux64)` returns Linux player symbols. So
CI only needs to pass the intended target.

> Verified correction (see `HOK-Integration-Checklist.md`): do NOT use Unity's
> built-in `-buildTarget` pointing at a non-active platform — the engine switches
> the active platform and triggers asset conversion before `-executeMethod` runs,
> which reliably hangs headless. Use a custom flag `-TsIfDefBuildTarget <target>`
> with `-executeMethod`, and resolve the target inside the code via
> `GetAssemblies(Player, group, target)` so the active platform never changes.
> Also verified: `-earlyQuitAfterCompile` does not run `-executeMethod`.

## Lightweight Unity Command

The originally-envisioned lightweight probe was an `InitializeOnLoad` entry
guarded by a custom command-line flag, combined with Unity's regular
`-buildTarget`:

```text
Unity.exe
  -projectPath E:\HOK_Trunk\Project
  -batchmode
  -nographics
  -quit
  -buildTarget iOS
  -tsifdefGenerateDefinesAndExit
```

In the static constructor:

```text
if command line has -tsifdefGenerateDefinesAndExit:
  target = parse -buildTarget
  defines = union CompilationPipeline.GetAssemblies(Player, group, target)
  defines += csc.rsp -define values if needed
  write defines.json
  exit Unity
```

Do not rely on `-earlyQuitAfterCompile` to run this generation step. Local
testing shows script-only early quit compiles code and exits, but it cannot
reliably run callbacks or `-executeMethod`.

> Form actually adopted: `-executeMethod TSIfDef.TsIfDefPlayerDefines.Generate`
> `-TsIfDefBuildTarget <target>` (a custom flag Unity does not recognize and does
> not switch platform on).

## HOK CI Flow

### Node 1: Compile GameScript

The script calls:

```text
Project/Build_new/Build.py
  --IsBuildGameScript True
  --IsBuildRes False
  --IsBuildGameCore False
  --IsBuildApp False
  --MacroFile %DEFAULT_MACRO_FILE%
  --rsp_override_par ...
```

This stage establishes `Project/Assets/csc.rsp`, compiles C#, and generates the
`.d.ts` files. It is the right place to generate the TSIfDef player profile for
CI.

The missing piece is an explicit final `BuildTarget`. For player correctness,
this stage must pass the final player platform to the TSIfDef profile generator
(via the custom `-TsIfDefBuildTarget` flag), or otherwise hand the same target
to the generator before the TS compile stage runs.

### Node 2: Compile TS

The script runs:

```text
cd Program/TsScripts
npm run compile:devops_pipeline
```

Before running TSIfDef or `tsc`, it should verify that:

```text
Program/TsScripts/.tscbuild/tsifdef/defines.json
```

exists and was generated from the current Unity/C# macro snapshot. A missing
JSON must block the build.

### Node 3: Compile Resources and App

This stage runs `Build.py` again to produce resources and the app. In the
observed CI order, TS is already compiled by this point, so writing a macro
profile again afterward does not affect the TS result.

If a path that goes straight to Node 3 also needs TS output, then Node 3 must
perform the same profile generation before triggering any TS compile.

## Implementation Shape

The Unity helper can stay simple:

```text
one compile/reload callback for editor development:
  if not batchmode:
    generate editor defines from activeScriptCompilationDefines

one menu item:
  generate the same editor profile manually

one -executeMethod entry for CI/player:
  parse -TsIfDefBuildTarget
  generate player defines from CompilationPipeline.GetAssemblies(Player, group, target)
```

The invariants are:

```text
Editor TS profile = csc.rsp + Unity editor compile defines
Player TS profile = csc.rsp + Unity player compile defines for final BuildTarget
```

TSIfDef stays generic. HOK owns the Unity adapter that writes the generated
macro JSON.
