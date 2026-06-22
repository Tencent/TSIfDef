# TSIfDef

TSIfDef 用于 TypeScript 的源码级条件编译。

TSIfDef 的核心宏分析由 CLI、tsserver 插件和 VSCode 扩展共享实现。

交付物：

- `release/tsifdef-1.0.0.vsix`，用于安装到 VSCode。
- `release/tsifdef-1.0.0.tgz`，用于 npm / CI / 命令行安装。
- `release/manifest.json`，记录构建这两个产物时使用的版本和 Git 修订。

唯一版本源放在 `src/version.ts`。构建和发布脚本会从这里同步清单版本。

快速开始：

```bash
npm install
npm run build
npm test
```

生成发布产物：

```bash
npm run release
```

包职责：

- VSIX：编辑器体验、状态栏、灰显、折叠和 tsserver 集成。
- tgz：命令行预处理流程和 CI 打包。

仓库中的两个产物保持相同版本和相同 Git revision。
