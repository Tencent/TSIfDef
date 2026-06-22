# TSIfDef

Language files: `README.en-US.md` and `README.zh-CN.md`

TSIfDef is source-level conditional compilation for TypeScript.

## English

TSIfDef keeps the core macro analysis shared across the CLI, tsserver plugin,
and VSCode extension.

### Install

```bash
npm install
npm run build
```

### Use in a project

1. Add a `tsifdef` pointer to `package.json`, for example:

```json
{
  "tsifdef": "./Profiles/TEST_A.json"
}
```

2. Create the selected Profile as a JSON array of enabled macro names.
3. Run the precompile step to generate `.tsifdef/Output`:

```bash
npm run precompile
```

4. Compile the generated project from `.tsifdef/Output`:

```bash
npm run compile
```

If your project already uses the package script pattern from this repository,
`npm run compile` should point at `.tsifdef/Output/tsconfig.json`. The
precompile step runs first and produces that generated tree.

### Use in VSCode

1. Install the VSIX release artifact.
2. Open a workspace with a `package.json` `tsifdef` pointer.
3. The status bar shows the active Profile file.
4. Gray ranges, folding, diagnostics, and tsserver projection all follow that
   Profile.

### Release

To produce the version-matched artifacts:

```bash
npm run release
```

That emits:

- `release/tsifdef-1.0.0.vsix`
- `release/tsifdef-1.0.0.tgz`
- `release/manifest.json`

The canonical version is stored in `src/version.ts`.

## 中文

TSIfDef 用于 TypeScript 的源码级条件编译。

TSIfDef 的核心宏分析由 CLI、tsserver 插件和 VSCode 扩展共享实现。

### 安装

```bash
npm install
npm run build
```

### 在项目里使用

1. 在 `package.json` 中添加 `tsifdef` 指针，例如：

```json
{
  "tsifdef": "./Profiles/TEST_A.json"
}
```

2. 把对应 Profile 写成启用宏名数组的 JSON 文件。
3. 运行预处理步骤：

```bash
npm run precompile
```

4. 编译生成后的项目：

```bash
npm run compile
```

如果你的项目沿用本仓库的脚本模式，`npm run compile` 会先调用
`tsifdef`，再用 stock `tsc` 编译 `.tsifdef/Output/tsconfig.json`。

### 在 VSCode 里使用

1. 安装 VSIX 发布产物。
2. 打开带有 `package.json` `tsifdef` 指针的工作区。
3. 状态栏会显示当前 Profile 文件名。
4. 灰显、折叠、诊断和 tsserver 投影都会跟随该 Profile。

### 发布

生成同版本产物：

```bash
npm run release
```

会输出：

- `release/tsifdef-1.0.0.vsix`
- `release/tsifdef-1.0.0.tgz`
- `release/manifest.json`

唯一版本源放在 `src/version.ts`。
