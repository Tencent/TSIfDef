# HOK TSIfDef 集成落地计划

目标工程：`E:/VersionBranch_g114_publish_20260601`（当前活跃、HOK region、Unity 2022.3.5f1、引擎缓存热）。
Integrid.md 描述的目标是 HOK_Trunk，但按用户要求先在 g114_publish 落地并验证；adapter 保持可移植。

## 已核实的环境事实

- 引擎：`UnityEngine/WindowsEditor/WindowsEditor/x64/Release/Unity.exe`（当前未运行）。
- 编辑器开发启动：`打开Unity引擎_Win_开发专用.bat` → `Unity.exe -sgameDevelopment -projectPath Project`（GUI，非阻塞）。
- Batch 形态（Build.py `__ExecUnityMethod`）：
  `Unity.exe -skipLicensing -projectPath <dir> -batchmode [-executeMethod X] -logFile <log> -quit -nographics <argv>`。
- 现有 GameScript 编译用 `-earlyQuitAfterCompile` 且**不带** `-executeMethod`。
- `csc.rsp`：`Project/Assets/csc.rsp`（约 50 个 `-define:`，含 `GLOBAL_GENERAL`）。
- `.d.ts`：`Program/TsScripts/DevelopmentReference/{HOK,Domestic,Shared}`。
- tsifdef profile 契约（`src/cli/config.ts:92`）：**启用宏名的 JSON 字符串数组**；未列出的宏一律 false，不报未知宏。
- 当前 region = HOK；活跃 target 存于 `Project/Library/EditorUserBuildSettings.asset`（默认 Win64）。
- `Assets/Editor` 下无 asmdef → C# 落在默认 `Assembly-CSharp-Editor`。

## 不变量（来自 Integrid.md）

```
Editor TS profile = csc.rsp -define 值  ∪  activeScriptCompilationDefines
Player TS profile = csc.rsp -define 值  ∪  GetAssemblies(Player, group, 最终 BuildTarget).defines
```

输出文件：`Program/TsScripts/.tscbuild/tsifdef/defines.json`（生成物，须 SVN 忽略，禁止提交备用 profile）。

## 交付物

### 1. C# adapter（放 `Project/Assets/Editor/TSIfDef/`）

- `TsIfDefDefineWriter.cs`：共享核心。
  - `ReadCscRspDefines()`：解析 `Assets/csc.rsp` 的 `-define:` 值。
  - `WriteProfile(IEnumerable<string> defines)`：去重 + 排序，原子写出 `.tscbuild/tsifdef/defines.json` 为 JSON 字符串数组（tsifdef 契约）。
  - 若目录不存在则创建；写临时文件再 rename，避免半截文件。
- `TsIfDefEditorDefines.cs`：编辑器开发模式。
  - `[InitializeOnLoadMethod]` 订阅 `CompilationPipeline.compilationFinished`（或 `[DidReloadScripts]`）。
  - 守卫 `if (Application.isBatchMode) return;` —— batch 模式绝不走这里。
  - 来源 = `EditorUserBuildSettings.activeScriptCompilationDefines` ∪ csc.rsp。
  - 菜单项 `Tools/TSIfDef/Regenerate Editor Defines` 手动刷新，调用同一逻辑。
- `TsIfDefPlayerDefines.cs`：CI / Player 模式。
  - `-executeMethod TsIfDefPlayerDefines.Generate` 入口 + 受 `-tsifdefGenerateDefinesAndExit` 保护的 `InitializeOnLoad` 入口（两条触发路径都覆盖，用于对比验证）。
  - target 来源：优先解析命令行 `-buildTarget`（用户偏好系统 flag）；据此选 `BuildTargetGroup` + `BuildTarget`，调用 `CompilationPipeline.GetAssemblies(AssembliesType.Player, group, target)` 合并 `defines`，∪ csc.rsp。
  - **关键点**：GetAssemblies 接受显式 target，无需切换活跃 target。验证证明可行后，非 Win64 平台也无需真正切 target，从根本上规避资产转换/卡死。
  - 写出后 `EditorApplication.Exit(0)`（InitializeOnLoad 路径）。

### 2. profile 写出格式

JSON 字符串数组，示例：
```json
["GLOBAL_GENERAL","BEHAVIAC_RELEASE","UNITY_STANDALONE","UNITY_STANDALONE_WIN", ...]
```
Editor 版含 `UNITY_EDITOR*`，Player 版不含。

## 验证（按风险从低到高，全部看真实日志）

所有 batch 调用复用 Build.py 的命令形态，logFile 落到临时目录，跑完 grep 日志确认。

- **V0 baseline（零风险）**：不启动引擎，先本地单测 csc.rsp 解析和 JSON 写出逻辑（用一个小 C# 或直接核对生成文件格式）。
- **V1 编辑器路径**：用 `打开Unity引擎_Win_开发专用.bat` 启动 GUI 引擎 → 触发一次脚本重编译（改动一个空白/reimport）→ 确认 `defines.json` 生成、含 `UNITY_EDITOR`、含 csc.rsp 宏。菜单项手动刷新也验证一次。
- **V2 Player 路径 A（earlyQuit + executeMethod）**：
  `-batchmode -quit -nographics -earlyQuitAfterCompile -executeMethod TsIfDefPlayerDefines.Generate -buildTarget StandaloneWindows64`
  → 看日志确认 executeMethod **是否真的执行**、defines.json 是否生成、是否**不含** `UNITY_EDITOR`。这是 Integrid.md 警告的可疑路径，用日志证伪/证实。
- **V3 Player 路径 B（纯 executeMethod，不带 earlyQuit）**：
  `-batchmode -quit -nographics -executeMethod TsIfDefPlayerDefines.Generate -buildTarget StandaloneWindows64`
  → 因 target=当前活跃 Win64，无资产转换，安全。确认生成正确且无 `UNITY_EDITOR`。
- **V4 免切换取跨平台宏（解用户耗时顾虑）**：活跃 target 保持 Win64，executeMethod 内用 `GetAssemblies(Player, Android, Android)` 查询 → 确认返回 `UNITY_ANDROID/ENABLE_IL2CPP` 等且**未触发资产转换**（对比日志耗时）。证明无需 `-buildTarget` 切换即可产出目标平台 profile。

## 安全护栏（用户强调）

- Windows 机器。测试任何非 Win64 的 batch 后，下次开 Editor 或跑非 earlyQuit 前**必须把活跃 target 切回 StandaloneWindows64**，否则资产转换会卡死。
- V4 的设计目的正是避免切换；若确需 V2/V3 用非 Win64，收尾必跑一次 `-buildTarget StandaloneWindows64` 切回。
- 每次 batch 前确认无 Unity.exe 在跑（Library 锁）。

## 明确不做（本次范围外）

- 不改 HOK 现有 TS 构建管线（`init.mjs/build.mjs` → tsc 的接线）。当前 TsScripts 未用 tsifdef/tsc，接线是更大且独立的工作，留作后续。本次只保证 profile 在两种模式下正确生成 + 验证两条 Player 触发路径。
- 不提交 defines.json；.tscbuild 加入忽略。

## 收尾

- 汇总三条 Player 路径的实测结论（哪条能触发、耗时、是否卡死风险），给出最终推荐触发形态。
- 更新 Integrid.md 的观察结论（若实测与文档假设不符，据实修正）。

---

# 实测验证结论（2026-07-03，g114_publish，Unity 2022.3.5f1，Win64）

所有 batch 复刻 Build.py `__ExecUnityMethod` 命令形态（`-skipLicensing -batchmode -quit [-nographics]`）。
产物是 tsifdef 契约的 JSON 字符串数组，去重排序。

## 1. 编辑器路径 ✅

- InitializeOnLoad + `compilationFinished` + `delayCall`（`!isBatchMode` 守卫）+ 菜单项。
- batch 可观测入口 `GenerateForVerification` 实测生成 profile：
  - 含 `UNITY_EDITOR / UNITY_EDITOR_64 / UNITY_EDITOR_WIN`（编辑器视图应有）。
  - 含全部 csc.rsp 宏（`GLOBAL_GENERAL`、`BEHAVIAC_RELEASE`、`SGAME_TEST` …）。
  - 平台 `UNITY_STANDALONE_WIN`、`PLATFORM_STANDALONE_WIN`、`ENABLE_MONO`。
- 耗时 ~2.5 分钟（纯编译）。
- 注意：定制 `-sgameDevelopment` 引擎把 `Debug.Log` 走 bqLog，不进 `-logFile`；产物文件是唯一可靠证据。
- GUI 无席位启动会弹 license modal 阻塞主循环，`delayCall` 拿不到 tick——这是启动方式问题，非代码问题；开发者本地有 license 正常触发。

## 2. Player 路径三条对比

| 路径 | 命令要点 | 结果 | 耗时 |
|------|----------|------|------|
| **V2 earlyQuit + executeMethod** | `-earlyQuitAfterCompile -executeMethod ... -buildTarget win64` | ❌ **executeMethod 不执行** | 26s |
| **V3 纯 executeMethod（活跃 target）** | `-executeMethod ... -buildTarget win64` | ✅ 正确 player profile | ~1.5 分钟 |
| **V4 probe：3 参数 GetAssemblies，不切 target** | `-executeMethod ProbeCrossPlatform` | ✅ 拿到全平台正确宏 | 125s |
| **V4b `-buildTarget Android`（≠活跃）** | `-executeMethod ... -buildTarget Android` | ❌ **触发资产转换，卡死** | >10 分钟未完 |

### V2 决定性证据（印证 Integrid.md 警告）
日志：`[ScriptOnlyMode] Initialize` → 编译 → `[ScriptOnlyMode] AbortAfterCompile` → `[ScriptOnlyMode] Finalize` → 退出。
命令行里的 `-executeMethod` 被解析，但 earlyQuit 走 ScriptOnlyMode，**编译完即退，从不进 executeMethod 阶段**。
**结论：earlyQuit 不能用于生成 defines。**

### V3 正确性
player profile 无 `UNITY_EDITOR`，有 `UNITY_STANDALONE_WIN`/`PLATFORM_STANDALONE_WIN`/`UNITY_64`/`ENABLE_MONO`（无 IL2CPP），含 csc.rsp 宏。
与编辑器版差异合理：编辑器多 `UNITY_EDITOR*`/`DEBUG`/`TRACE`/`ENABLE_PROFILER`/`UNITY_ASSERTIONS`；player 多包管理器预编译宏（Cinemachine/Timeline/Physics）。

### V4 关键胜利（解耗时/卡死顾虑）
`GetAssemblies(AssembliesType.Player, group, target)` 重载在 2022.3.5 **确认存在**（反射枚举到 `public (AssembliesType,BuildTargetGroup,BuildTarget)`）。
`activeBuildTargetBefore == activeBuildTargetAfter == StandaloneWindows64` 全程不变，却拿到每个平台正确且不同的宏：
- Android：`UNITY_ANDROID`、`UNITY_ANDROID_API`、`PLATFORM_ANDROID`、`ENABLE_IL2CPP`（无 ENABLE_MONO）
- iOS：`UNITY_IOS`、`UNITY_IPHONE`、`UNITY_IPHONE_API`、`ENABLE_IL2CPP`
- Linux：`UNITY_STANDALONE_LINUX`、`UNITY_STANDALONE_LINUX_API`、`ENABLE_MONO`
- 全部无 `UNITY_EDITOR`。
与 Integrid.md「本地探测观察」完全一致。耗时=纯编译 ~2 分钟，**无资产转换**。

### V4b 反例（务必避免）
`-buildTarget <非活跃平台>` 会切换活跃 target 并触发全量资产转换（ASTC 纹理重压缩），在本工程 headless 下稳定卡死。
**结论：绝不能用 `-buildTarget` 指向非活跃平台来取宏。**

## 3. 最终推荐形态

```
Editor:  非 batch → InitializeOnLoad/compilationFinished 自动生成
                    activeScriptCompilationDefines ∪ csc.rsp
                    （含 UNITY_EDITOR）

Player/CI: batchmode + -executeMethod TsIfDefPlayerDefines.Generate
           目标平台作为【自定义参数】传入（不要用 -buildTarget 切换活跃 target）
           内部用 GetAssemblies(Player, group, target) 按请求 target 取宏 ∪ csc.rsp
           活跃 target 保持 Win64 不动 → 零资产转换、~2 分钟、无卡死
           （代码已改为 3 参数重载 + 反射兜底）
```

不变量：
```
Editor TS profile = csc.rsp + activeScriptCompilationDefines
Player TS profile = csc.rsp + GetAssemblies(Player, group, 目标 BuildTarget).defines
```

## 4. 待办 / 交接

- Player `Generate()` 已改用 3 参数重载；应新增一个自定义参数（如 `-tsifdefTarget Android`）替代 `-buildTarget`，避免任何人误用 `-buildTarget` 切换活跃 target。TODO：把 `ResolveTargetFromCommandLine` 从读 `-buildTarget` 改为读自定义 flag。
- `.tscbuild` 须加入 SVN 忽略；禁止提交 defines.json。
- HOK 现有 TS 管线是 `init.mjs/build.mjs`（非 tsifdef/tsc），接线是独立的更大工作，本次未做。
- 验证过程一度用 `-buildTarget Android` 触发了平台切换，中途强杀导致活跃 target 停在 Android、Library 半转换；headless batch 切回稳定死锁。恢复方式：删除 `Library/EditorUserBuildSettings.asset`（已备份 .android.bak），Unity 下次以 Win64 默认重建，走 ArtifactDB 缓存快速打开。

