# TSIfDef：TypeScript 条件编译宏方案

项目名称：**TSIfDef**。

## 1. 背景与目标

一个 TypeScript 代码库常常需要面向多个互不兼容的目标（不同平台、运行时、区域或
产品形态）从同一份源码编译。这些目标之间可能存在：

- 类型声明（`.d.ts`）不一致。
- 数据定义、协议、SDK 和业务接口不一致。
- 部分 TypeScript 逻辑只应在特定目标下参与解析和类型检查。
- 开发者通常只具备其中一个目标的环境，但提交必须保证其余目标不会长期腐化。

本方案提供真正的源码级条件编译：未激活分支必须在 TypeScript 建立 AST 和执行类型
检查前消失。同时，VSCode 需要灰显、折叠未激活代码，并继续复用原生 TypeScript
Language Service 的补全、跳转、重构等能力。

## 2. 核心结论

采用以下三层组合：

1. C/C++ 风格的 `#if` 预处理器负责正确性，在 `tsc` 建立 AST 前用等长遮盖剔除
   未激活代码。构建时不向磁盘写出投影源码树，而是劫持 TypeScript CompilerHost 的
   文件读取，把遮盖后的投影文本以**原始文件名**喂给编译器，并由 TSIfDef 驱动
   `program.emit()`（投影编译，见 §8、§13）。
2. TypeScript Server Plugin 劫持 `ScriptSnapshot`，让编辑器语言服务忽略未激活代码。
3. VSCode Extension 负责 Profile 切换、灰显、折叠、状态栏和本地命令。

三者必须共用同一份宏扫描、求值和遮盖实现。编辑器显示、tsserver 视图、本地 Build 和 CI Build 不能各自实现宏规则。

## 3. 宏语法

宏指令使用 C/C++ 风格的独占行语法，`#` 必须是该行第一个非空白字符：

```ts
#if BROWSER
const storage = new BrowserStorage();
#elif NODE
const storage = new FileStorage();
#else
#error Unknown target
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

不支持源码内 `#define`、文本替换宏和函数宏。`package.json` 的字符串字段
`tsifdef` 指向唯一生效的 Profile JSON 文件，该文件只包含启用的宏名数组。表达式中的标识符若未列入
当前 Profile，值为 `false`；`#if NONE_EXIST_MACRO` 是合法表达式，不产生未知宏诊断。

宏定义是一次检查、投影或语言服务会话的外部全局输入。同一个选定 Profile
对项目内所有文件一致生效，处理单个文件时宏表只读且不会被源码改变。`import`、
模块加载顺序和依赖图不传播、增加或覆盖宏；任何源码中的 `#define` 都是错误，
不能影响当前文件或其他文件。条件指令的嵌套和配对则限制在单个物理文件内，
不能从一个文件跨越到另一个文件。

推荐宏包围完整的 import/export、声明、语句、类成员或对象属性，不在表达式参数列表中间插入宏，避免生成语法残片。

## 4. Profile 与配置文件

```json
// package.json
{
  "tsifdef": "./Profiles/browser.json",
  "scripts": {
    "compile": "tsifdef build"
  }
}
```

```json
// Profiles/browser.json
["BROWSER", "EXPERIMENTAL"]
```

Profile 文件只描述启用的宏。未列出的宏全部为 `false`。该文件不得包含
`source`、`tsconfig`、`outDir`、include/exclude 或任何构建文件清单。现有
`build.json`、`package.json` scripts、`tsconfig` 或构建脚本是 build graph 的唯一
来源；TSIfDef 必须透明处理该 build graph 实际纳入的全部 TypeScript 文件，不能要求
工程为 TSIfDef 重复配置输入文件。

`package.json` 的 `tsifdef` 字段是构建、VSCode 和 tsserver 的唯一当前 Profile
来源。外部工具可通过修改该字段切换环境；TSIfDef 不从 CLI、环境变量、VSCode
私有设置、Junction 或工程目录名称推断 Profile。

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
- 生成的 SourceMap 不因宏预处理产生额外行号偏移。
- VSCode、tsserver 和 CLI 可以共享完全相同的 range。

## 6. VSCode Extension

最终产品提供一个 VSCode 扩展，职责包括：

- 监听 `package.json` 和当前 Profile 文件，状态栏显示 Profile 文件名，Tooltip 显示完整路径。
- 使用 `TextEditorDecorationType` 灰显 inactive ranges。
- 使用 `FoldingRangeProvider` 折叠 inactive ranges。
- 提供宏结构错误和不配对指令诊断；未配置宏按 `false` 求值，不报未知宏。
- 通知 TypeScript Server Plugin 当前 Profile。
- 将 package 中解析出的 Profile 完整路径同步给 TypeScript Server Plugin。

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

宏处理必须位于 TypeScript 建立 AST、`tsc` emit 和 ESLint 之前。TSIfDef 采用
**投影编译（projected compilation）**：不向磁盘写出投影源码树，而是劫持
CompilerHost 的文件读取，把等长遮盖后的投影文本以**原始文件名**喂给编译器，
再由 TSIfDef 自己驱动 `program.emit()`。

```text
原始 TS（含 #if）
  -> tsifdef build（劫持 CompilerHost.getSourceFile / readFile）
       读磁盘原文 -> 等长遮盖 -> 以原始文件名建 SourceFile
       -> ts.createProgram / createIncrementalProgram
       -> getPreEmitDiagnostics（尊重 noEmitOnError）
       -> program.emit()   // .js / .js.map / .d.ts 直接落在工程既有 outDir
  -> 下游工具链（打包、转译、SourceMap 合并等，若有）
```

采用投影编译而非“投影落盘 + stock tsc”的根本原因：因为编译器看到的文件名始终是
原始路径，emit 出的 `.js.map` 的 `sources`、`.d.ts` 和 `tsc` 报错路径全部**天然
指向原始源**，无需任何后处理、无绝对路径、跨机器可移植，也不产生需要 git / VSCode
/ ESLint 额外 ignore 的影子源码树。方案对比与实验见 §14。

CLI 提供一个构建操作：

```bash
tsifdef build
tsifdef build -p ./custom.tsconfig.json
tsifdef build --watch
tsifdef build -p ./tsconfig.json -- --module commonjs --outDir dist
```

`--` 之后的参数按 tsc 命令行标志解析（复用 `ts.parseCommandLine`），作为覆盖合并到
tsconfig 之上——便于构建管线按每次调用传入不同的 `module` / `outDir` /
`tsBuildInfoFile` 等，而无需为每种组合准备一个 tsconfig。TSIfDef 不自行解析这些标志。

无参数时读取当前目录 `package.json` 的 `tsifdef` Profile 指针和 `tsconfig.json`。
`-p` / `--project` 覆盖 tsconfig。TSIfDef 不解析 tsc 的 132 个编译选项，而是通过
`ts.parseJsonConfigFileContent` 复用 tsc 自己的解析结果，将得到的 `CompilerOptions`
原样传给 Program。只有与“劫持文件读取”相互作用的少数选项需要 TSIfDef 主动处理：

| 类别 | 选项 | 处理方式 |
| ---- | ---- | -------- |
| 必须处理 | `incremental` / `tsBuildInfoFile` / `composite` | Profile 变化即忽略旧 `.tsbuildinfo` 做全量（见 §8.1、§13） |
| 必须处理 | `noEmitOnError` | emit 前检查诊断，有 error 则跳过 emit 并以退出码 1 结束 |
| 必须处理 | `noEmit` | 仅类型检查，不调用 emit |
| 必须处理 | `watch` | 分派到 `createWatchProgram`（见 §8.2） |
| 特殊照顾 | `inlineSources` | 嵌入 map 的源内容替换回磁盘原文，避免嵌入遮盖出的空白 |
| 特殊照顾 | `sourceMap` / `inlineSourceMap` / `declaration` / `declarationMap` | 行为天然正确，但必须由测试锁定（见 §11） |
| 透传 | `target` / `module` / `moduleResolution` / `lib` / `paths` / `strict` 等 100+ | 原样传给 Program，不感知 |
| 不支持并报错 | `outFile` / `tsc -b` 多 composite 项目引用 | 与 per-file 遮盖模型冲突，检测到明确报“暂不支持” |

磁盘源码解码与固定的 TypeScript 5.5.4 `ts.sys.readFile` 一致：识别 UTF-16BE、
UTF-16LE 和 UTF-8 BOM，其余字节按非 fatal UTF-8 解码。TSIfDef 不额外检测或拒绝
GBK 等编码，也不修改原始文件。

ESLint 同样检查等长遮盖后的目标视图，而宏结构检查直接运行在原始源码上。

### 8.1 增量与 Profile 失效

`incremental` / `composite` 依赖 `.tsbuildinfo` 里记录的文件版本判断是否重编，
但增量记录看到的是磁盘原文，看不到“遮盖结果因 Profile 改变而变化”。若磁盘文件
未变而 Profile 从一个目标切到另一个，朴素增量会错误复用上一个 Profile 的编译结果，
产出错误 JS 且不报错。

技术决策：**检测到 Profile 变化即做全量刷新**，不做精细的按文件失效。落地方式：
在 outDir/Output 旁维护一个 `tsifdef.profilehash`（记录上次编译所用 Profile 的
内容哈希）。每次 build 比较当前 Profile 哈希与该文件：

- 不一致（或文件缺失）：忽略既有 `.tsbuildinfo`，做一次全量投影编译，然后写入
  新哈希。
- 一致：正常走 tsc 增量。

Profile 切换极罕见（仅切换目标时发生），一次全量代价可接受；正确性优先于增量速度。

### 8.2 Watch

`tsifdef build --watch` 使用 `ts.createWatchCompilerHost`，并同样包装其
`readFile` / `getSourceFile` 做等长遮盖，与一次性 build 复用同一份 `projectSource`。
源文件改动时 watch 内部重读会自动经过遮盖并增量重编。

Profile 文件不是 `.ts`，不在 tsc 的监视范围内，需 TSIfDef 额外监视：watch 启动时
对 Profile 指针指向的文件建立独立 watcher。**Profile 变化时销毁并以新 Profile
重建整个 WatchProgram（全量刷新）**，而不是尝试局部失效——与 §8.1 同一原则。

Watch 必须保证没有绕过遮盖的直读磁盘路径（`readDirectory`、`watchFile`、
`watchDirectory` 等入口都不得暴露未遮盖原文给编译器）。

### 8.3 投影编译实现要点

- 复用 `ts.parseJsonConfigFileContent` 得到 `CompilerOptions`，原样传给 Program，
  不自行解析 tsc 选项。
- 包装 `host.readFile` 与 `host.getSourceFile`：读磁盘原文 → `projectSource` 等长
  遮盖 → 以**原始 fileName** 建 SourceFile。宏文件之外（`.d.ts`、`node_modules`）
  按原文透传。因为文件名始终是原始路径，emit 出的 `.js.map` `sources`、`.d.ts` 与
  报错路径按各自目录深度算出的相对路径全部指向原始源，无需后处理、无绝对路径、
  跨机器可移植。
- 宏结构诊断在遮盖阶段产生，存在时中止、不 emit。
- emit 前 `getPreEmitDiagnostics`，尊重 `noEmitOnError`；用
  `formatDiagnosticsWithColorAndContext` 输出，设置退出码。
- 增量：`createIncrementalProgram`；build 前比对 `tsifdef.profilehash`，不一致则
  忽略 `.tsbuildinfo` 全量并回写新哈希（§8.1）。
- watch：`createWatchCompilerHost` + 同一遮盖包装；额外监视 Profile 文件，变化即
  重建 WatchProgram（§8.2）。
- `inlineSources` 时把嵌入 map 的源内容替换回磁盘原文，避免嵌入遮盖出的空白。
- 检测 `outFile` 与 `tsc -b` 多 composite 引用并明确报“暂不支持”。

约束：

- 任何环节都不得破坏等长遮盖的行列一致性。
- 投影文本仅存在于内存（可选 `--emit-projection <dir>` 调试 dump 除外），不进
  源码控制。
- 与 §7 一致，固定 TypeScript 版本；升级前必须重跑 §11 全部集成测试。

## 9. CI

CI 不依赖 VSCode Extension Host，也不能从开发机插件安装目录寻找 CLI。每个目标
Profile 至少运行一次，以保证所有目标都不会腐化：

```text
对每个 Profile P：
  设置 package.json tsifdef -> P，运行 npm run compile（tsifdef build），上传 emit 产物
```

即使开发者只在本地查看其中一个目标的视图，其余目标仍会在提交阶段被投影编译并使用
各自的 `.d.ts` 编译。

## 10. 产品与发布形式

一个代码仓库包含五个模块：

```text
tsifdef/
  core/       宏扫描、表达式求值、range 和等长遮盖
  vscode/     灰显、折叠、Profile、状态栏
  tsserver/   ScriptSnapshot 投影
  eslint/     ESLint processor：让 lint 只看到等长遮盖后的目标视图
  cli/        package/tsconfig 解析、投影编译（CompilerHost 劫持 + emit）、watch 和 CI
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

## 11. 关键测试

### 11.1 宏核心与投影

- `if/elif/else` 嵌套和表达式优先级。
- 未配对指令、缺省为 `false` 的未配置宏和 `#error`。
- 字符串、模板字符串和注释中的伪指令。
- CRLF、中文和 UTF-16 surrogate pair offset。
- 等长遮盖保持字节总长、CR/LF 与行列不变。
- VSCode、tsserver、CLI 投影文本逐字节一致。

### 11.2 编辑器与语言服务

- VSCode 未保存文档的 Snapshot。
- Profile 切换和 tsserver 缓存失效。
- Completion、Definition、Reference、Rename 和 Quick Fix。

### 11.3 投影编译（tsifdef build，一次性）

- emit 出的 `.js` 与 stock tsc 编译原始源（人工删去未激活分支）在语义上等价。
- `.js.map` 的 `sources` 指向原始源路径，且为相对、可移植路径；不同目录深度的
  `.map` 各自相对深度正确；解析后确实命中原始文件。
- `sourceMap` mappings 行列因等长遮盖不偏移。
- `inlineSources`：嵌入 map 的源内容是磁盘原文，而非遮盖出的空白。
- `declaration` / `declarationMap`：未激活分支的声明按条件编译语义正确消失，
  `.d.ts.map` 指向原始源。
- `tsc` 报错路径为原始源路径（终端可点击跳转）。
- `noEmitOnError`：存在类型错误时不产生 emit 产物，退出码为 1。
- `noEmit`：只做类型检查、无产物。
- 宏结构错误（未配对、`#error`）在投影编译阶段报诊断并中止。
- 不支持项（`outFile`、`tsc -b` 多 composite 引用）给出明确“暂不支持”错误。
- 使用各自 Profile 独立编译出的多套 `.d.ts`。

### 11.4 增量与 Profile 失效

- 同一 Profile 连续两次 build，第二次命中 `.tsbuildinfo` 增量。
- 源文件激活分支改动后再 build，仅相关文件重编，产物更新。
- 磁盘源文件未变、仅切换 Profile：忽略旧 `.tsbuildinfo` 做全量，产物反映新 Profile
  （核心回归：验证不会错误复用上一个 Profile 的结果）。
- `tsifdef.profilehash` 缺失时按全量处理。

### 11.5 Watch

- 改动激活分支内容 → 触发重编、产物更新、map sources 仍指原始源。
- 改动未激活分支内容 → 遮盖后等价无变化，产物不变。
- 改动破坏宏结构（删 `#endif`）→ 报宏诊断且 watch 不崩溃、可恢复。
- Profile 文件切换 → 重建 WatchProgram 做全量，产物反映新 Profile。
- 新增 / 删除源文件 → watch 正确感知。
- 连续快速改动不丢事件、不重复编译至崩溃。

### 11.6 集成

- TypeScript `5.5.4` 集成测试；升级 TypeScript 前必须全部重跑。

## 12. 最终原则

源码预处理负责构建正确性，TypeScript Server Plugin 负责编辑器语义一致性，VSCode Extension 负责交互体验，独立 CLI 负责本地构建和服务器 CI。四者共用同一宏核心，任何环境都不得自行解释宏。

## 13. 设计决策：为何采用投影编译而非投影落盘

条件编译要在 `tsc` 建立 AST 前剔除未激活代码，有两种实现路径。本节记录取舍，
规范性内容见 §8。

**投影落盘（未采用）**：把等长遮盖后的源写到 `Output/project/<rel>`，生成一份
tsconfig，再让 stock `tsc -p` 编译这棵影子树。问题在于编译器物理读到的路径变成了
`Output/project/...`：

- 生成的 `.map` 里 `sources` 指向影子树，而非原始源；等长遮盖保证行列/行号准确，
  但源文件**路径**错了，SourceMap 消费者会指向影子树。
- `tsc` 报错也以影子路径给出，终端里不可点击、不便定位回原文件。
- 影子源码树需要 git / VSCode 搜索 / ESLint 到处 ignore。

**投影编译（采用）**：不落盘，劫持 CompilerHost 的文件读取，以原始文件名把遮盖
文本喂给编译器，由 TSIfDef 驱动 `program.emit()`。上述三个问题在源头同时消失。
代价是 tsifdef 从“投影器”变为“编译驱动者”，需接管 emit / 诊断 / 增量 / watch。

在固定 TypeScript 版本上做过受控实验，验证了各路径的 SourceMap 行为：

| 方案 | `.map` sources | 报错路径 | 可移植 | 影子树 ignore | 复杂度 |
| ---- | -------------- | -------- | ------ | ------------- | ------ |
| 落盘 + 无选项 | 指向影子树 ✗ | 影子路径 ✗ | — | 需要 | 低 |
| 落盘 + 相对 `sourceRoot` | 随 `.map` 深度错乱 ✗ | 影子路径 ✗ | — | 需要 | 低 |
| 落盘 + 绝对 `sourceRoot` | 指原始源，但烙入绝对路径 | 影子路径 ✗ | ✗ | 需要 | 低 |
| **投影编译（劫持 emit）** | **相对、指原始源 ✓** | **原始路径 ✓** | ✓ | **不需要** | 高 |

决定性数据：劫持 CompilerHost、以原始文件名建 SourceFile 后 `program.emit()`，
tsc 为每个 `.map` 按其各自深度算出正确的相对 `sources`（浅层 `../..`、深层
`../../..`），解析后全部命中原始文件。绝对 `sourceRoot` 虽也能指对，但把绝对路径
烙进 `.map`，破坏可移植性；相对 `sourceRoot` 因 `.map` 散落多层目录而无法用单一
字符串对齐所有深度。

Profile 失效采用**发现变化即全量刷新**，不做按文件精细失效：Profile 切换极罕见、
精细失效在条件编译下易静默算错、正确性优先于增量速度。

