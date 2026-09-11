# 更新日志

## v1.1.5 - 2026-09-09

- 增加 TSIfDef-aware ESLint parser wrapper，覆盖 `import/no-cycle` 等直接读取
  依赖文件、绕过 processor 的规则。
- 保留 processor 的合成诊断过滤，并让 parser wrapper 与 processor 共用 Profile
  解析及源码投影逻辑。
- 顶层 parser 保持为 `@typescript-eslint/parser`，让 VSCode ESLint 默认的
  TypeScript probe 能识别文件；TSIfDef parser wrapper 仅通过
  `settings.import/parsers` 处理依赖文件。
- npm 发布物合并为单个 tgz；以 `eslint-plugin-tsifdef` 依赖名安装后，同一个包
  同时提供 CLI、核心 API、ESLint processor 和 parser。

## v1.1.4 - 2026-09-07

- 将 `eslint-plugin-tsifdef` 作为真实 companion 包交付，不再依赖
  `postinstall` 动态生成；npm 会在生命周期脚本完成后把该转发包判为
  extraneous 并删除。

## v1.1.3 - 2026-09-07

- 增加可移植的 TSIfDef 规范和与实现无关的一致性用例。
- 避免 ESLint 规则对宏指令及未激活分支投影产生的合成空白报告伪诊断。

## v1.1.2 - 2026-09-03

- 兼容以 `#name` 开头的 TypeScript 私有字段、私有方法和私有品牌检查，不再将其误判
  为 TSIfDef 指令。

## v1.1.1 - 2026-09-02

- 首次加载有效 Profile 时也刷新 TypeScript Server，避免 VSCode 启动恢复的已打开
  文件保留 TSIfDef 插件配置完成前产生的错误诊断。

## v1.0.5 - 2026-09-01

- Profile 变化后按“重启 tsserver、重新下发插件配置、重新加载项目”的顺序刷新。
  新 server 激活 TSIfDef 后会对已打开文件再做一次诊断，不再需要手工保存或重开文件。

## v1.0.4 - 2026-09-01

- 将 `tsifdef-tsserver` 模块转发入口作为真实文件打入 VSIX，确保全新安装或强制覆盖
  安装后，TypeScript Server 都能加载插件。
- 发布时检查安装后的转发目录只能包含 manifest 和单个入口文件，并验证它能够加载
  VSIX 中的插件。
- VSCode 内置 TypeScript 语言服务不存在或不可用时静默降级，宏灰显和折叠功能仍可
  正常使用。

## v1.0.3 - 2026-09-01

- 所选 Profile 路径或有效宏集合变化时重启 TypeScript Server。仅重新加载项目时，
  已打开文件中仍可能残留旧诊断。
- 保持原有触发条件：首次激活不重启，Profile 重复保存但有效宏未变化时也不重启。

## v1.0.2 - 2026-08-31

- 所选 Profile 路径或有效宏集合变化时重新加载 TypeScript 项目，使已打开文件的
  语言服务诊断及时跟随 Profile。
- 首次激活和宏集合未变化的重复保存不会触发重新加载。
- 移除对 tsserver 私有项目失效接口的依赖。

- 投影编译 `tsifdef build`：劫持 TypeScript CompilerHost，以原始文件名把等长遮盖
  文本喂给编译器并驱动 `program.emit()`，因此 emit 出的 `.js.map` sources、`.d.ts`
  和报错路径都指向原始源，无需后处理、也没有落盘的影子源码树。
- 增量编译（`createIncrementalProgram`）+ `tsifdef.profilehash` sidecar：Profile
  变化时强制全量重编。
- Watch 模式（`tsifdef build --watch`）基于 `createWatchCompilerHost`，并对 Profile
  文件单独监视，切换即全量重建。
- `inlineSources` 会把嵌入的 `sourcesContent` 换回磁盘原文；`outFile` 和 project
  references（`tsc -b`）会明确报不支持。
- 可选 `--emit-projection <dir>`：dump 遮盖后的投影，供调试审计。
- ESLint processor（`tsifdef/macros`）：在 ESLint 解析前对宏文件做等长遮盖投影，
  `#if` 不再触发 `Parsing error`。以 `tsifdef/eslint-plugin` 导出。
- `postinstall` 会在宿主工程自动生成 `node_modules/eslint-plugin-tsifdef` 转发包，
  使 `plugins: ["tsifdef"]` 无需手动铺设即可解析。

## v1.0.0 - 2026-06-22

TSIfDef 首个正式版本。

- 共享的核心能力包括指令扫描、表达式解析、条件分支求值以及等长投影。
- CLI 预处理流程会根据当前 Profile 生成 `.tsifdef/Output`。
- tsserver 插件会在语言服务分析前对宏文件做投影。
- VSCode 扩展提供 Profile 显示、灰显、折叠和诊断。
- VSIX 与 tgz 产物保持版本一致，并具备安装冒烟测试。
