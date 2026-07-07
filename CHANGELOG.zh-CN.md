# 更新日志

Language file: [`CHANGELOG.md`](./CHANGELOG.md)

## 未发布

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
