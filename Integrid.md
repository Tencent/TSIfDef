# HOK 主干 TSIfDef 集成说明

这是将 TSIfDef 应用于 `E:\HOK_Trunk` 的本地集成说明。
它有意不作为产品路线图任务；除非后续将集成方案正式化，否则不应提交。

## 最终规则

HOK 不应维护独立的 TypeScript 宏配置。

生成的 TSIfDef profile 必须派生自同一份 C# 宏状态，也就是生成 TypeScript
所消费的 `.d.ts` 文件时使用的宏状态。

```text
Project/Assets/csc.rsp
  -> Unity C# compilation
  -> generated .d.ts
  -> generated TSIfDef profile JSON
  -> TSIfDef / tsc
```

如果 JSON 缺失或已过期，TypeScript 编译应在运行 TSIfDef 或 `tsc` 前失败。
提交一个备用 profile 会掩盖错误的宏状态，因此不允许这样做。

## Profile 文件

实际的 HOK profile 路径应在 `package.json` 中保持稳定，但它指向的文件是生成物：

```json
{
  "tsifdef": "./.tscbuild/tsifdef/defines.json"
}
```

`Program/TsScripts/.tscbuild` 必须被 SVN 忽略。至少，下面这个生成文件不能提交：

```text
Program/TsScripts/.tscbuild/tsifdef/defines.json
```

TSIfDef 自己的投影输出仍然是生成的构建产物，也应保持在源码控制之外。

## 编辑器开发模式

当开发者正常打开 Unity Editor 时，正确的 TS profile 是编辑器编译 profile。

使用：

```csharp
EditorUserBuildSettings.activeScriptCompilationDefines
```

这个 profile 预计会包含仅编辑器可用的符号，例如 `UNITY_EDITOR` 和
`UNITY_EDITOR_WIN`。这对于编辑器开发是正确的，因为正在编辑的 `.d.ts` 和 C#
视图同样来自编辑器编译。

推荐触发方式：

```text
Unity script reload / compile callback
  -> read activeScriptCompilationDefines
  -> optionally union Project/Assets/csc.rsp -define values
  -> write Program/TsScripts/.tscbuild/tsifdef/defines.json
```

菜单项也可以调用同一个生成器，用于手动刷新。

## CI / Player 模式

对于最终 player 目标，不要把
`EditorUserBuildSettings.activeScriptCompilationDefines` 作为宏来源。
它是编辑器编译视图，并且包含 `UNITY_EDITOR`。

使用 Unity 的 player assembly API：

```csharp
CompilationPipeline.GetAssemblies(AssembliesType.Player, group, target)
```

合并返回 assemblies 的 `defines`，并可选择合并 `Project/Assets/csc.rsp` 中的
`-define:` 值作为安全检查。target 必须是最终 player 的 `BuildTarget`，
而不能只是编辑器当前激活的 target。

本地探测观察到的结果：

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

Linux 作为证明尤其有用：本地编辑器 active target 仍然是
`StandaloneWindows64`，但查询
`GetAssemblies(Player, ..., StandaloneLinux64)` 会返回 Linux player 符号。
因此 CI 只需要传入预期 target。

## 轻量 Unity 命令

可靠的轻量探测形态是：一个受自定义命令行标志保护的 `InitializeOnLoad`
入口，再配合 Unity 常规的 `-buildTarget`：

```text
Unity.exe
  -projectPath E:\HOK_Trunk\Project
  -batchmode
  -nographics
  -quit
  -buildTarget iOS
  -tsifdefGenerateDefinesAndExit
```

在静态构造函数中：

```text
if command line has -tsifdefGenerateDefinesAndExit:
  target = parse -buildTarget
  defines = union CompilationPipeline.GetAssemblies(Player, group, target)
  defines += csc.rsp -define values if needed
  write defines.json
  exit Unity
```

不要依赖 `-earlyQuitAfterCompile` 来运行这个生成步骤。本地测试表明，
仅脚本的 early quit 可以编译代码并退出，但它不能可靠执行 callback 或
`-executeMethod`。

## HOK CI 流程

### 节点 1：编译 GameScript

脚本调用：

```text
Project/Build_new/Build.py
  --IsBuildGameScript True
  --IsBuildRes False
  --IsBuildGameCore False
  --IsBuildApp False
  --MacroFile %DEFAULT_MACRO_FILE%
  --rsp_override_par ...
```

这个阶段会建立 `Project/Assets/csc.rsp`、编译 C#，并生成 `.d.ts` 文件。
这是为 CI 生成 TSIfDef player profile 的正确位置。

缺失的一环是显式的最终 `BuildTarget`。为保证 player 正确性，这个阶段必须
向 Unity 传入 `-buildTarget <target>`，或者在 TS 编译阶段运行前，以其他方式
把同一个 target 传给 TSIfDef profile 生成器。

### 节点 2：编译 TS

脚本运行：

```text
cd Program/TsScripts
npm run compile:devops_pipeline
```

在运行 TSIfDef 或 `tsc` 之前，它应验证：

```text
Program/TsScripts/.tscbuild/tsifdef/defines.json
```

已经存在，并且由当前 Unity/C# 宏快照生成。缺失 JSON 应阻塞构建。

### 节点 3：编译资源和 App

这个阶段会再次运行 `Build.py` 来产出资源和 app。在观察到的 CI 顺序中，
TS 到此时已经编译完成，因此后续再写入宏 profile 不会影响 TS 结果。

如果直接走节点 3 的路径也需要 TS 输出，那么节点 3 必须在触发任何 TS 编译前
执行相同的 profile 生成。

## 实现形态

Unity helper 可以保持简单：

```text
one compile/reload callback for editor development:
  if not batchmode:
    generate editor defines from activeScriptCompilationDefines

one menu item:
  generate the same editor profile manually

one InitializeOnLoad command-line flag for CI/player:
  if -tsifdefGenerateDefinesAndExit:
    parse -buildTarget
    generate player defines from CompilationPipeline.GetAssemblies(Player,...)
    exit
```

不变量是：

```text
Editor TS profile = csc.rsp + Unity editor compile defines
Player TS profile = csc.rsp + Unity player compile defines for final BuildTarget
```

TSIfDef 保持通用。HOK 负责拥有 Unity adapter，由它写入生成的宏 JSON。
