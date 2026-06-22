# 历史设计调研与实施顺序

以下内容于 2026-06-22 从 `SPEC.md` 移出。它记录已评估的替代方案和已完成的
实施计划，不属于当前产品需求。

## Babel 与 Bun 的定位

### Babel

`babel-plugin-transform-define` 只能替换常量，不能保证在 `tsc` 前删除未激活分支。当前 Pipeline 是 `tsc -> Babel`，因此它不能单独解决区域接口缺失。

Babel 可以作为后处理优化，用于常量折叠和 dead-code elimination，但正确性仍由 `#if` 预处理器保证。

### Bun

Bun Build 支持 `define`、macro 和 dead-code elimination，但 Bun 不是 TypeScript 类型检查器；VSCode 的静态语义仍由 tsserver 提供。Bun 官方 VSCode 扩展主要提供运行、调试、测试、运行时诊断和 lockfile 支持，不会让 tsserver 理解 Bun Build 的宏结果。

如果引入 Bun，适合用于运行宏 CLI、构建工具和测试提速，不作为条件编译正确性的基础。

VSCode 市场中应只考虑官方 `oven.bun-vscode`。第三方 `Pandy.bun` 仅提供执行当前文件的 `bun run` 命令，不能提供语言服务或宏视图。

## 原实施顺序

1. 实现无 VSCode 依赖的 `core` 和黄金用例测试。
2. 实现约定式 CLI precompile，接入 stock `tsc` 和 CI。
3. 实现 VSCode 灰显、折叠、Profile 和宏结构诊断。
4. 实现 tsserver `ScriptSnapshot` Hack，并验证 TypeScript 5.5.4。
5. 接入现有 `init.mjs -> compile.mjs -> build.mjs` Pipeline。
6. 发布同版本 VSIX 和 CLI 包，增加版本一致性检查。

前五项在归档时已经完成；第六项由当前路线图的 `REL-001` 继续跟踪。
