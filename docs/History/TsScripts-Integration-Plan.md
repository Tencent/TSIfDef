# TSIfDef 接入 TsScripts — 修订版（编辑器插件 + 标准 precompile 模式）

上一版两个问题（用户反馈）：
1. VSCode 里写 `#if AAAA` 不置灰反而报错 —— **编辑器插件（VSIX + tsserver plugin）根本没装**，只接了 CLI 编译。
2. 在 compile.mjs 内部逐处 hack 4 个 tsc 调用，不是文档的标准 `precompile` 形态。

用户选择：装 vsix + 配 tsdk；改成标准 precompile 模式。

## 关键现状（已核实）

- 工作方式：打开 `TsScripts.code-workspace`（多 folder：TsScripts + Puerts + C# + Tdr）。
- workspace/settings 里**没有** `typescript.tsdk`，**没有** tsserver plugin，**没装** TSIfDef 扩展 → 编辑器半套完全缺失。
- 源码 `.mts` 为主（579）少量 `.ts`（3）；插件扩展名匹配 `.ts/.tsx/.mts/.cts`，不是扩展名问题。
- `SystemScripts/tsconfig.json` 由 `tsconfig.gen.mjs` 在每次 `init.mjs` 时按 REGION **重新生成**；
  `tsconfig.build.json` extends 它。所以源 tsconfig 是每区域生成物。
- 所有 tsc 调用都在 `compile.mjs` 的 4 处（`compile_cjs/esm`、`watch_cjs/esm`），`build.mjs`/`miniapp` 复用之。
- 本地有 `node_modules/typescript`（可作 tsdk 承载 tsserver plugin）。
- TSIfDef 产物：`release/tsifdef-1.0.0.vsix`（扩展）、`tsifdef-1.0.0.tgz`（CLI，已装）。
- 生成物是 `.tsifdef/Output/tsconfig.json`（不是 package.json）。

## 问题 1：编辑器插件（置灰/折叠/不报错）

TSIfDef 编辑器半套 = **VSCode 扩展**（置灰、折叠、状态栏、Profile 监听）+ **tsserver plugin**
（劫持 getScriptSnapshot，让语言服务只看到投影，从而不对未激活代码报错）。

步骤：
1. 安装扩展：`code --install-extension E:/TSIfDef/release/tsifdef-1.0.0.vsix`（或 VSCode 里手动装 VSIX）。
2. workspace 配 `typescript.tsdk` 指向工程本地 TS：
   `TsScripts.code-workspace` 的 settings 加 `"typescript.tsdk": "node_modules/typescript/lib"`，
   并 `"typescript.enablePromptUseWorkspaceTsdk": true`。
   （tsserver plugin 通过 workspace TS 版本加载，package.json 里 `contributes.typescriptServerPlugins`
   已声明 `enableForWorkspaceTypeScriptVersions`。）
3. 确认 package.json 有 `tsifdef` 指针（已加）——扩展和 plugin 都从它读当前 Profile。
4. VSCode 里 `TypeScript: Restart TS Server` 让 plugin 生效。

验证：打开一个 `.mts`，写
```
#if GLOBAL_GENERAL
const a = 1;
#else
const b: NotAType = 2;   // 未激活，应被投影遮盖，不报错
#endif
```
预期：`#else` 块置灰+折叠，`NotAType` 不报错（因为 tsserver 看不到它）；`#if AAAA`（未定义宏）
不报“未知宏”，整块按 false 处理。

## 问题 2：改成标准 precompile 模式

目标：package.json 里显式的 `precompile` 任务 + 编译指向投影 tsconfig，而不是散在 mjs 内部。
但本工程 task 多数走 `Build/bin/pipeline/*.mjs`，tsc 埋在里面，纯 package.json 覆盖不到 mjs。
折中：**两层**——package.json 暴露标准入口 + 一个集中开关贯穿 mjs。

### 2a. 回滚 compile.mjs 内部散改

把上一版在 compile.mjs 里 4 处 `PROJECTED_TSCONFIG` 改动收敛：不在每个函数里 hack，
而是让 `run_tsifdef()` 产出投影后，**统一通过一个 `TSCONFIG_EFFECTIVE` 变量**决定 tsc -p 指向谁：
- 定义 `const TSCONFIG_EFFECTIVE = USE_TSIFDEF ? PROJECTED_TSCONFIG : TSCONFIG`。
- 4 处 tsc 用 `${TSCONFIG_EFFECTIVE}`。
- 编译流程开头统一 `await run_tsifdef()`（一次），而非每函数各调。

### 2b. package.json 暴露标准任务（文档形态）

```json
"scripts": {
  "precompile": "tsifdef --project SystemScripts/tsconfig.build.json",
  "compile": "npm run precompile && node Build/bin/pipeline/init.mjs --check-eslint && node Build/bin/pipeline/compile.mjs --use-tsc-cache-one-day",
  ...
}
```
——但注意：init.mjs 会重生成 tsconfig，tsifdef 必须在 init 之后跑。所以 precompile 不能简单前置，
需要在 init（生成 tsconfig）之后、compile.mjs 的 tsc 之前跑 tsifdef。这就是为什么 2a 里把
`run_tsifdef()` 放在 compile.mjs 流程里（init 已在 npm script 里先跑）。

### 2c. 让“所有 task 都 cover”

- 直接/间接走 compile.mjs 的：`watch`/`compile`/`build`/`compile:devops_pipeline` → 经 `run_tsifdef` + `TSCONFIG_EFFECTIVE` 覆盖。
- `build:v8cc`/miniapp 系列 → 确认它们的编译是否也经 compile.mjs；若有独立 tsc 需同样接。
- 纯工具 task（proto/faas/tdrjs/push）不编译 TS，无需接。

## 待决/风险

- **sourcemap sources 指向 .tsifdef/Output**：上一版发现的问题仍在。改标准模式不自动解决。
  需确认调试/CrashSight 是否受影响；若受影响，用 sourceRoot 或 map 重写处理（另开）。
- init.mjs 重生成 tsconfig 与 tsifdef 顺序：必须 init → tsifdef → tsc。
- watch 模式 tsifdef 无 watch：源码结构变化需重跑。

## 明确不做

- 不接 3 个库子包。
- 不改 Unity adapter（宏生成已验证 OK）。
