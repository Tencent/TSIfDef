# Changelog

Language files: `CHANGELOG.en-US.md` and `CHANGELOG.zh-CN.md`

## v1.0.0 - 2026-06-22

### English

Initial release of TSIfDef.

- Shared core directive scanning, expression parsing, conditional evaluation,
  and equal-length projection.
- CLI precompile flow that emits `.tsifdef/Output` from the active Profile.
- tsserver plugin that projects macro files before language-service analysis.
- VSCode extension with Profile display, decorations, folding, and diagnostics.
- Version-matched VSIX and tgz release artifacts with installation smoke tests.

### 中文

TSIfDef 首个正式版本。

- 共享的核心能力包括指令扫描、表达式解析、条件分支求值以及等长投影。
- CLI 预处理流程会根据当前 Profile 生成 `.tsifdef/Output`。
- tsserver 插件会在语言服务分析前对宏文件做投影。
- VSCode 扩展提供 Profile 显示、灰显、折叠和诊断。
- VSIX 与 tgz 产物保持版本一致，并具备安装冒烟测试。
