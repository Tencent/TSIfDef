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
  "tsifdef": "./Profiles/HOK.json",
  "scripts": {
    "precompile": "tsifdef",
    "compile": "tsc -p ./.tsifdef/Output/tsconfig.json"
  }
}
```

```json
// Profiles/HOK.json
["HOK", "GLOBAL_GENERAL"]
```

Profile 文件只描述启用的宏。未列出的宏全部为 `false`。该文件不得包含
`source`、`tsconfig`、`outDir`、include/exclude 或任何构建文件清单。现有
`build.json`、`package.json` scripts、`tsconfig` 或构建脚本是 build graph 的唯一
来源；TSIfDef 必须透明处理该 build graph 实际纳入的全部 TypeScript 文件，不能要求
工程为 TSIfDef 重复配置输入文件。

`package.json` 的 `tsifdef` 字段是构建、VSCode 和 tsserver 的唯一当前 Profile
来源。外部工具可通过修改该字段切换环境；TSIfDef 不从 CLI、环境变量、VSCode
私有设置、Junction 或工程区域名称推断 Profile。

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

宏处理必须位于 `tsc` 和 ESLint 之前：

```text
原始 TS
  -> npm precompile: tsifdef
  -> .tsifdef/Output/project + manifest.json + tsconfig.json
  -> stock tsc -p .tsifdef/Output/tsconfig.json
  -> 现有 CommonJS/Babel
  -> V8CC/PFBS
  -> RawAssets
```

CLI 只有一个操作：

```bash
tsifdef
tsifdef --project ./custom.tsconfig.json
```

无参数时读取当前目录的 `package.json`、其 `tsifdef` Profile 指针和
`tsconfig.json`。`--project` 只覆盖 tsconfig。每次成功运行都原子替换固定
`.tsifdef/Output`；不提供 emit/check/watch 子命令或增量缓存。

磁盘源码解码与固定的 TypeScript 5.5.4 `ts.sys.readFile` 一致：识别 UTF-16BE、
UTF-16LE 和 UTF-8 BOM，其余字节按非 fatal UTF-8 解码。TSIfDef 不额外检测或拒绝
GBK 等编码，也不修改原始文件。

ESLint 同样检查预处理后的区域视图，而宏结构检查直接运行在原始源码上。

## 9. CI

CI 不依赖 VSCode Extension Host，也不能从开发机插件安装目录寻找 CLI。每次提交至少运行：

```text
设置 package.json tsifdef -> HOK Profile，运行 npm run compile，上传 .tsifdef/Output
设置 package.json tsifdef -> Domestic Profile，运行 npm run compile，上传 .tsifdef/Output
```

即使国内开发者只查看国内视图，海外视图仍会在提交阶段被预处理并使用海外 `.d.ts` 编译；反向亦然。

## 10. 产品与发布形式

一个代码仓库包含四个模块：

```text
tsifdef/
  core/       宏扫描、表达式求值、range 和等长遮盖
  vscode/     灰显、折叠、Profile、状态栏
  tsserver/   ScriptSnapshot 投影
  cli/        package/tsconfig 解析、Program 投影、固定输出和 CI
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

必须覆盖：

- `if/elif/else` 嵌套和表达式优先级。
- 未配对指令、缺省为 `false` 的未配置宏和 `#error`。
- 字符串、模板字符串和注释中的伪指令。
- CRLF、中文和 UTF-16 surrogate pair offset。
- VSCode 未保存文档的 Snapshot。
- Profile 切换和 tsserver 缓存失效。
- Completion、Definition、Reference、Rename 和 Quick Fix。
- VSCode、tsserver、CLI 投影文本一致。
- HOK 与 Domestic 两套 `.d.ts` 的独立编译。
- TypeScript `5.5.4` 集成测试。

## 12. 最终原则

源码预处理负责构建正确性，TypeScript Server Plugin 负责编辑器语义一致性，VSCode Extension 负责交互体验，独立 CLI 负责本地构建和服务器 CI。四者共用同一宏核心，任何环境都不得自行解释宏。

## 13. 后续攻坚：SourceMap 与报错路径回映射

投影后 `tsc` 编译的是 `.tsifdef/Output/project/...` 下的投影树，因此：

- 生成的 `.map` 里 `sources` 指向 `.tsifdef/Output/project/...`，而不是原始
  `src/...`。等长遮盖保证行列/行号准确，但源文件**路径**变了。
- `tsc` 的编译报错也以投影路径给出（如
  `.tsifdef/Output/project/SystemScripts/src/...`），在终端里不可点击跳转，也不便
  定位回原始源文件。

需要攻坚的目标：让下游消费者看到的始终是**原始源路径**，同时保持等长遮盖带来的
行列不偏移。可选方向（择一或组合）：

- 用 `tsc` 的 `sourceRoot` / `mapRoot`，或对生成的 `.map` 做一次 `sources` 路径
  回写，把 `.tsifdef/Output/project/<rel>` 映射回原始 `<rel>`。
- 对 `tsc` 的报错输出做包装，把投影路径替换回原始源路径，恢复可点击跳转。
- 验证 V8CC / CrashSight 堆栈还原在回映射后仍然正确。

约束：任何回映射都不得破坏等长遮盖的行列一致性；投影产物本身仍是构建产物，
不进源码控制。

