# 开发计划：投影编译（`tsifdef build`）

对应 SPEC §8、§8.1–8.3、§11、§13。目标：把 TSIfDef 的构建方式从「投影落盘 +
stock tsc」改为「劫持 CompilerHost + 自驱 emit」，从源头解决 SourceMap `sources`、
`.d.ts`、报错路径指向原始源的问题，并支持增量与 watch。

**总原则：所有工作尽可能都带 auto test case（`node:test`）。** 每个阶段完成的定义
（DoD）都包含「测试通过」。

---

## 0. 现状与约定

- 测试框架：`node:test` + `node:assert/strict`。测试放 `test/*.test.ts`，经
  `tsconfig.test.json` 编到 `.test-dist/`，由 `scripts/run-tests.cjs` 用
  `node --test` 跑。跑法：`npm test`。
- 现有构建入口：`src/cli/precompile.ts`（落盘投影）、`src/cli/main.ts`（`runCli`）、
  `src/cli/config.ts`（Profile / tsconfig 指针解析）、`src/core/projection.ts`
  （`projectSource` 等长遮盖）。
- 核心遮盖函数 `projectSource(text, definitions)` 返回 `{ projectedText, diagnostics }`，
  投影编译与落盘、tsserver、eslint 全部复用它，**不新写遮盖逻辑**。
- 测试建临时工程的既有范式见 `test/precompile.test.ts`（`mkdtemp` + `writeFile` +
  临时 tsconfig）。新测试沿用。
- CLI 现有命令 `tsifdef [--project]`（落盘）**保留不动**；新增 `tsifdef build`
  子命令，两者并存。落盘作为可选审计 dump（`--emit-projection`）的基础也保留。

---

## 阶段 1：一次性投影编译原型（`tsifdef build`）

**目标**：`createProgram` + host 劫持（原始文件名喂遮盖文本）+ emit + 诊断 + 退出码。
不含增量、不含 watch。

**新增文件**
- `src/cli/build.ts`：`buildProject(options): Promise<BuildResult>`
  - 复用 `parseJsonConfigFileContent` 得到 `CompilerOptions`（参照 precompile.ts 现有
    解析）。
  - `host = ts.createCompilerHost(options)`，包 `readFile` / `getSourceFile`：
    宏文件 → 读磁盘原文 → `projectSource` → 以**原始 fileName** 建 SourceFile；
    非宏文件（`.d.ts`、node_modules）透传。
  - 收集宏诊断；有则中止、不 emit、退出码 1（复用 `PrecompileDiagnosticsError` 或
    平行的 `BuildDiagnosticsError`）。
  - `getPreEmitDiagnostics`；尊重 `noEmitOnError`（有 error 不 emit、退出码 1）；
    用 `ts.formatDiagnosticsWithColorAndContext` 输出。
  - `program.emit()`。
  - 检测 `outFile`、`tsc -b` composite 引用 → 明确 "unsupported" 错误。
- `src/cli/build.ts` 的导出接进 `src/cli/index.ts`。

**改动**
- `src/cli/main.ts`：`runCli` 识别 `build` 子命令，分派到 `buildProject`；保留旧
  无子命令行为。参数解析支持 `build [-p <tsconfig>]`。

**测试** `test/build.test.ts`（SPEC §11.3）
1. emit 出的 `.js` 与「人工删未激活分支后 stock tsc 编译」语义等价（比较关键片段）。
2. `.js.map` 的 `sources` 为相对、可移植路径，解析后命中原始源文件（存在性断言）。
3. 多目录深度：浅层 / 深层 `.map` 各自相对深度不同但都命中原始源（复现实验结论）。
4. `sourceMap` mappings 行列不因遮盖偏移（挑一个激活分支里的符号，验证映射行列）。
5. `inlineSources`：map 内嵌源是磁盘原文，不是空白。
6. `declaration` / `declarationMap`：未激活分支声明消失；`.d.ts.map` 指原始源。
7. 报错路径为原始源路径（构造类型错误，断言 stderr / 诊断文件名是原始路径）。
8. `noEmitOnError` + 类型错误：无产物、退出码 1。
9. `noEmit`：只检查、无产物。
10. 宏结构错误（缺 `#endif`）：报诊断、中止、退出码 1。
11. `outFile` / `tsc -b` 多 composite：报 "unsupported"。

**DoD**：上述测试全绿；`npm run typecheck` 通过。

---

## 阶段 2：增量与 Profile 失效

**目标**：接 `createIncrementalProgram`，用 `tsifdef.profilehash` 保证切 Profile 时
不复用旧结果（SPEC §8.1）。

**改动 / 新增**
- `src/cli/build.ts`：
  - 增量分支用 `ts.createIncrementalProgram`（或
    `createEmitAndSemanticDiagnosticsBuilderProgram`），沿用 tsconfig 的
    `incremental` / `tsBuildInfoFile` / `composite`。
  - build 前：读 outDir/Output 旁的 `tsifdef.profilehash`，与当前 Profile 内容哈希
    （复用 precompile.ts 里的 `hash`）比较；不一致或缺失 → 删除/忽略 `.tsbuildinfo`
    做全量，成功后回写新哈希；一致 → 正常增量。
  - profilehash 文件位置：与 `.tsbuildinfo` 同目录，命名 `tsifdef.profilehash`。

**测试** `test/build-incremental.test.ts`（SPEC §11.4）
1. 同 Profile 连续两次 build，第二次命中增量（断言 `.tsbuildinfo` 复用 / 未全量）。
2. 改激活分支后 build，仅相关文件重编、产物更新。
3. **核心回归**：源文件不变、仅切 Profile → 产物反映新 Profile，未复用旧结果。
4. `tsifdef.profilehash` 缺失 → 全量。

**DoD**：测试全绿；用例 3 是必过项（静默错误的防线）。

---

## 阶段 3：Watch

**目标**：`tsifdef build --watch`，含 Profile 文件监视与切换重建（SPEC §8.2）。

**新增**
- `src/cli/watch.ts`：`watchProject(options)`
  - `ts.createWatchCompilerHost(configPath, overrides, sys, createProgram, reportDiag,
    reportWatch)`，包 `readFile` / `getSourceFile` 复用同一遮盖。
  - 额外 `fs.watch`（或 `sys.watchFile`）监视 Profile 文件；变化 → 关闭当前
    WatchProgram、以新 Profile 重建（全量刷新）。
  - 确保无绕过遮盖的直读路径（`readDirectory` 等）。
- 接进 `main.ts` 的 `build --watch`。

**测试** `test/build-watch.test.ts`（SPEC §11.5）
> Watch 测试用 spawn 子进程 + 轮询产物文件 + 超时兜底；每个用例独立临时工程，
> 结束 kill 进程。参考 `spawnSync` 已有用法，改 `spawn` 异步。
1. 改激活分支 → 重编、产物更新、map sources 仍指原始源。
2. 改未激活分支 → 遮盖后等价、产物不变。
3. 改坏宏结构（删 `#endif`）→ 报诊断、watch 不崩、修复后恢复。
4. 切 Profile 文件 → 重建、产物反映新 Profile。
5. 新增 / 删除源文件 → watch 感知。
6.（尽力）连续快速改动不丢事件。

**DoD**：至少 1–5 稳定通过；6 若 flaky 则标注并降级为手动/尽力。

---

## 阶段 4：选项矩阵补全

**目标**：SPEC §8 选项表里「特殊照顾 / 不支持」项全部有明确行为 + 测试。

**改动**：集中在 `build.ts`，把散落的选项处理收敛、补齐边界。

**测试**：并入 `test/build.test.ts` 或新增 `test/build-options.test.ts`
- `module` / `target` 组合透传正确（cjs、esm 各一）。
- `paths` / `baseUrl` 别名解析在投影编译下仍正确。
- `emitBOM` / `newLine` 不破坏遮盖字节。
- 明确不支持项报错信息稳定（快照式断言 message 关键字）。

**DoD**：选项表每一「必须处理 / 特殊照顾 / 不支持」行至少一条测试覆盖。

---

## 阶段 5：可选审计 dump 与文档收尾

**目标**：`--emit-projection <dir>`（按需 dump 遮盖后投影树，默认不落盘）；文档一致性。

**改动**
- `build.ts`：`--emit-projection <dir>` 时把遮盖文本写到该目录（复用 precompile 落盘
  逻辑，但只作调试产物，不生成 tsconfig / manifest）。
- 更新 `README` / `README.zh-CN`：`tsifdef build` 用法、watch、与 ESLint/tsserver 的
  关系（lint/编辑器与构建正交）。
- `CHANGELOG` / `CHANGELOG.zh-CN`：记录投影编译。
- `INTEGRATION` / `INTEGRATION.zh-CN`：把「precompile + tsc」示例改为 `tsifdef build`。

**测试**
- `--emit-projection` 产物是等长遮盖文本、与 emit 用的投影一致。

**DoD**：文档无 `precompile`/`tsc -p .tsifdef/Output` 陈述残留；示例与 SPEC 一致。

---

## 阶段 6：集成回归

- `npm test` 全绿（含旧 tsserver / vscode / core 测试不回归）。
- 固定 TypeScript 版本；README 注明升级前须全量重跑（SPEC §13 约束）。
- （HOK 侧，另一个仓库，不在本仓库提交）接 `compile.mjs`：`run_tsifdef()` + `tsc`
  两步并为 `tsifdef build`；验证 babel → remap → 下游 SourceMap 一路指原始源。此项
  记入 `HOK-Integration-Checklist.md`，不阻塞本仓库发布。

---

## 风险与注意

- **最大风险**：阶段 2 用例 3（切 Profile × 增量）——一旦漏，产错 JS 且不报错。优先做、
  优先测。
- 旧 `precompile` 命令与测试保留，避免破坏既有契约；新旧并存直到确认 `build` 稳定。
- `createIncrementalProgram` 的 builder program 与 host 劫持的组合需实测；若增量与
  劫持冲突，退化为「Profile 变即全量」已是既定策略，可先牺牲增量保正确。
- Watch 测试易 flaky，用轮询 + 超时，避免固定 sleep。

## 阶段依赖

1 → 2 → 3 顺序做（后者依赖前者的 host 劫持）。4 可与 2/3 并行。5、6 收尾。
