# TSIfDef Demo Workspace

这个演示项目只使用中性的示例宏：

- `TEST_A`
- `TEST_B`
- `TEST_SHARED`

## 运行方式

```bash
cd examples/demo
npm install
npm run build
```

演示项目的 `package.json`：

```json
{
  "tsifdef": "./profiles/TEST_A.json",
  "scripts": {
    "build": "tsifdef build -- --noEmit false --outDir Build/.demorun/active",
    "watch": "tsifdef build --watch -- --noEmit false --outDir Build/.demorun/active"
  }
}
```

`npm run build` 使用现代投影编译路径（`tsifdef build`），并把当前 Profile
的输出写到 `Build/.demorun/active`。`npm run watch` 会以相同配置进入 watch
模式。

如果需要对比旧的预编译流程，仍然可以运行：

```bash
npm run legacy:compile
```

该流程会先生成 `.tsifdef/Output`，再用 stock `tsc` 编译
`.tsifdef/Output/tsconfig.json`。

当前工程自己的 `files`、`include` 和 `exclude` 在两种路径下都会被遵守。
独立子工程保留自己的 `tsifdef` 配置，不会被父工程隐式重写。

## 关注点

- 当前 Profile 来自 `package.json`。
- VSCode 里非激活分支会灰显并折叠。
- tsserver 在补全、引用、重命名和快速修复中会忽略非激活代码。
- 调试启动使用的是投影后的构建输出。

演示内容不包含任何业务相关命名。
