# TSIfDef：TypeScript 条件编译宏方案

项目名称：**TSIfDef**。

## 1. 背景与目标

HOK 工程使用 Unity、C#、Puerts 和 TypeScript，国内与海外环境存在以下差异：

- C# 导出的类型和 `.d.ts` 不一致。
- 数据定义、协议、SDK 和业务接口不一致。
- 部分 TypeScript 逻辑只应在一个区域参与解析和类型检查。
- 国内和海外开发者通常只具备本区域环境，但提交必须保证两边不会长期腐化。

本方案的目标是提供真正的源码级条件编译：未激活分支必须在 TypeScript 建立 AST 和执行类型检查前消失。同时，VSCode 需要灰显、折叠未激活代码，并继续复用原生 TypeScript Language Service 的补全、跳转、重构等能力。

## 2. 核心结论

采用以下三层组合：

1. C/C++ 风格的 `#if` 预处理器负责正确性，在 `tsc` 前剔除未激活代码。
2. TypeScript Server Plugin 劫持 `ScriptSnapshot`，让编辑器语言服务忽略未激活代码。
3. VSCode Extension 负责 Profile 切换、灰显、折叠、状态栏和本地命令。

三者必须共用同一份宏扫描、求值和遮盖实现。编辑器显示、tsserver 视图、本地 Build 和 CI Build 不能各自实现宏规则。

## 3. 宏语法

宏指令使用 C/C++ 风格的独占行语法，`#` 必须是该行第一个非空白字符：

```ts
#if HOK
const data = CSharp.HOK.PlayerData.Get();
#elif DOMESTIC
const data = CSharp.SMoba.PlayerData.Get();
#else
#error Unknown region
#endif
```

原始文件在宏处理前不一定是合法 TypeScript。CLI 和 TypeScript Server Plugin
提供给 `tsc`、ESLint 和语言服务的投影视图必须等长遮盖所有宏指令行。字符串、
模板字符串、行注释和块注释中的 `#if` 等文本不是宏指令。

第一阶段只支持：

```text
#if
#elif
#else
#endif
#error
defined(NAME)
!
&&
||
()
```

不支持源码内 `#define`、文本替换宏和函数宏。宏值全部来自与 `package.json`
同目录的固定配置文件 `tsifdef` 或构建时选择的 Profile。表达式中的标识符若未列入
当前 Profile，值为 `false`；`#if NONE_EXIST_MACRO` 是合法表达式，不产生未知宏诊断。

宏定义是一次检查、投影或语言服务会话的外部全局输入。同一个选定 Profile
对项目内所有文件一致生效，处理单个文件时宏表只读且不会被源码改变。`import`、
模块加载顺序和依赖图不传播、增加或覆盖宏；任何源码中的 `#define` 都是错误，
不能影响当前文件或其他文件。条件指令的嵌套和配对则限制在单个物理文件内，
不能从一个文件跨越到另一个文件。

推荐宏包围完整的 import/export、声明、语句、类成员或对象属性，不在表达式参数列表中间插入宏，避免生成语法残片。

## 4. Profile 与配置文件

```json
// 与 package.json 同目录，固定文件名：tsifdef
{
  "HOK": ["HOK", "GLOBAL_GENERAL"],
  "DOMESTIC": ["DOMESTIC"]
}
```

`tsifdef` 只描述每个 Profile 中启用的宏。未列出的宏全部为 `false`。该文件不得包含
`source`、`tsconfig`、`outDir`、include/exclude 或任何构建文件清单。现有
`build.json`、`package.json` scripts、`tsconfig` 或构建脚本是 build graph 的唯一
来源；TSIfDef 必须透明处理该 build graph 实际纳入的全部 TypeScript 文件，不能要求
工程为 TSIfDef 重复配置输入文件。

Profile 来源优先级固定为：

```text
CLI --profile
> CI 环境变量 HOK_TS_PROFILE
> VSCode 本地配置
> Project/Assets/Plugins Junction 推断
```

正式构建必须显式传递 Profile，不能依赖 Junction 推断。

## 5. 等长遮盖

预处理时不直接删除未激活代码，而是将未激活代码以及所有宏指令行的非换行
字符替换为空格：

```text
原始源码
  -> 计算 inactive ranges
  -> 保留 CR/LF 和文本总长度
  -> inactive 字符和宏指令行字符替换为空格
```

这样可保证：

- TypeScript 诊断行列不变。
- Definition、Rename、Quick Fix 的 offset 可直接映射回原文件。
- V8CC 和 CrashSight SourceMap 不因宏预处理产生额外行号偏移。
- VSCode、tsserver 和 CLI 可以共享完全相同的 range。

## 6. VSCode Extension

最终产品提供一个 VSCode 扩展，职责包括：

- 状态栏显示当前 `HOK` 或 `DOMESTIC` Profile。
- 命令切换 Profile。
- 使用 `TextEditorDecorationType` 灰显 inactive ranges。
- 使用 `FoldingRangeProvider` 折叠 inactive ranges。
- 提供宏结构错误和不配对指令诊断；未配置宏按 `false` 求值，不报未知宏。
- 通知 TypeScript Server Plugin 当前 Profile。
- 驱动本地 CLI 的 emit、watch 和 check。

灰显和折叠只是视觉能力，不能让 TypeScript Server 忽略代码，因此必须同时提供 tsserver plugin。

## 7. TypeScript Server Plugin

插件不重写 TypeScript Language Service，而是复用原生服务，只修改它看到的源码。

核心 Hack 是包装 `LanguageServiceHost.getScriptSnapshot()`：

```ts
const original = host.getScriptSnapshot.bind(host);

host.getScriptSnapshot = fileName => {
    const snapshot = original(fileName);
    if (!snapshot || !isMacroFile(fileName)) {
        return snapshot;
    }

    const source = snapshot.getText(0, snapshot.getLength());
    const projected = maskInactiveCode(source, activeProfile());
    return ts.ScriptSnapshot.fromString(projected);
};
```

`getScriptSnapshot(fileName)` 获得的是一个文件的完整 `ScriptSnapshot`，而
`ScriptSnapshot.getText(start, end)` 才是从该快照读取片段。插件不能根据
tsserver 某一次请求的片段局部判断宏状态：它必须先通过
`snapshot.getText(0, snapshot.getLength())` 读取当前版本的完整文件，扫描并校验
该文件内全部条件指令，再创建同长度的完整投影快照返回。之后 tsserver 无论读取
哪个片段，看到的都必须来自这份已经按整文件求值的投影。未保存编辑内容同样以
当前快照的完整文本为准，不能回退读取磁盘文件。

还需要把 Profile 版本加入 `getScriptVersion()`，避免 tsserver 复用旧 AST。Profile 切换后标记 Project dirty；如果缓存刷新不稳定，则由 VSCode 命令执行 `TypeScript: Restart TS Server`。

效果是 inactive 代码：

- 不进入 TypeScript AST。
- 不参与类型推导、补全、引用和重命名。
- 不产生语义诊断。
- 不造成重复声明和类型污染。

该方式属于对 tsserver host 的兼容性 Hack，应固定工作区 TypeScript 版本。当前工程已固定 TypeScript `5.5.4`，升级前必须运行集成测试。

## 8. Build Pipeline

宏处理必须位于 `tsc` 和 ESLint 之前：

```text
原始 TS
  -> tsifdef emit --profile <PROFILE>
  -> Build/.macrobuild/<PROFILE>
  -> 对应 tsconfig 和 d.ts
  -> tsc
  -> 现有 CommonJS/Babel
  -> V8CC/PFBS
  -> RawAssets
```

建议 CLI：

```bash
tsifdef emit --profile HOK
tsifdef emit --profile DOMESTIC
tsifdef watch --profile HOK
tsifdef check --all
```

增量缓存不是宏正确性的组成部分。无缓存地重新读取完整源文件并投影是基准行为，
一次性 `emit`/`check` 默认使用这一基准行为，它也用于验证缓存实现。只有在真实工程测量表明 watch
或重复 emit 的全量投影产生明显延迟时，才启用可选增量缓存。删除缓存、缓存损坏
或缓存未命中必须安全退化为完整重算，输出结果必须与禁用缓存逐字节一致。

启用缓存时，缓存键至少包含：

```text
源文件内容
+ Profile 定义
+ Preprocessor 版本
+ 宏配置版本
```

ESLint 同样检查预处理后的区域视图，而宏结构检查直接运行在原始源码上。

## 9. CI

CI 不依赖 VSCode Extension Host，也不能从开发机插件安装目录寻找 CLI。每次提交至少运行：

```text
macro-check-hok
macro-check-domestic
typecheck-hok
typecheck-domestic
```

即使国内开发者只查看国内视图，海外视图仍会在提交阶段被预处理并使用海外 `.d.ts` 编译；反向亦然。

## 10. 产品与发布形式

一个代码仓库包含四个模块：

```text
tsifdef/
  core/       宏扫描、表达式求值、range 和等长遮盖
  vscode/     灰显、折叠、Profile、状态栏
  tsserver/   ScriptSnapshot 投影
  cli/        emit、watch、check、CI
```

同一次发布产生同版本的两个交付物：

```text
tsifdef-1.0.0.vsix
tsifdef-1.0.0.tgz
```

- 开发者安装 VSIX。
- CI 安装内部 npm/tgz CLI 包。
- 两个交付物来自同一份 `core`、同一个版本和 Git revision。

技术上可以把 CLI 只塞入 VSIX，但 CI 解压 VSIX 并寻找内部脚本不稳定，不建议这样部署。产品可以是一个统一插件产品，但运行时必须同时支持 VSCode、tsserver 和独立 CLI 三个环境。

## 11. Babel 与 Bun 的定位

### Babel

`babel-plugin-transform-define` 只能替换常量，不能保证在 `tsc` 前删除未激活分支。当前 Pipeline 是 `tsc -> Babel`，因此它不能单独解决区域接口缺失。

Babel 可以作为后处理优化，用于常量折叠和 dead-code elimination，但正确性仍由 `#if` 预处理器保证。

### Bun

Bun Build 支持 `define`、macro 和 dead-code elimination，但 Bun 不是 TypeScript 类型检查器；VSCode 的静态语义仍由 tsserver 提供。Bun 官方 VSCode 扩展主要提供运行、调试、测试、运行时诊断和 lockfile 支持，不会让 tsserver 理解 Bun Build 的宏结果。

如果引入 Bun，适合用于运行宏 CLI、构建工具和测试提速，不作为条件编译正确性的基础。

VSCode 市场中应只考虑官方 `oven.bun-vscode`。第三方 `Pandy.bun` 仅提供执行当前文件的 `bun run` 命令，不能提供语言服务或宏视图。

## 12. 关键测试

必须覆盖：

- `if/elif/else` 嵌套和表达式优先级。
- 未配对指令、缺省为 `false` 的未配置宏和 `#error`。
- 字符串、模板字符串和注释中的伪指令。
- CRLF、中文和 UTF-16 surrogate pair offset。
- VSCode 未保存文档的 Snapshot。
- Profile 切换和 tsserver 缓存失效。
- Completion、Definition、Reference、Rename 和 Quick Fix。
- VSCode、tsserver、CLI 投影逐字节一致。
- HOK 与 Domestic 两套 `.d.ts` 的独立编译。
- TypeScript `5.5.4` 集成测试。

## 13. 实施顺序

1. 实现无 VSCode 依赖的 `core` 和黄金用例测试。
2. 实现 CLI emit/check/watch，接入两套 `tsc` 和 CI。
3. 实现 VSCode 灰显、折叠、Profile 和宏结构诊断。
4. 实现 tsserver `ScriptSnapshot` Hack，并验证 TypeScript 5.5.4。
5. 接入现有 `init.mjs -> compile.mjs -> build.mjs` Pipeline。
6. 发布同版本 VSIX 和 CLI 包，增加版本一致性检查。

## 14. 最终原则

源码预处理负责构建正确性，TypeScript Server Plugin 负责编辑器语义一致性，VSCode Extension 负责交互体验，独立 CLI 负责本地构建和服务器 CI。四者共用同一宏核心，任何环境都不得自行解释宏。
