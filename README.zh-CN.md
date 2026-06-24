# TSIfDef

TSIfDef 用于 TypeScript 的源码级条件编译。

## 安装

```bash
npm install
npm run build
```

## 在项目里使用

在 `package.json` 中同时添加 `tsifdef` 指针和预处理/编译脚本，例如：

```json
{
  "tsifdef": "./Profiles/TEST_A.json",
  "scripts": {
    "precompile": "tsifdef",
    "compile": "tsc -p .tsifdef/Output/tsconfig.json"
  }
}
```

把对应 Profile 写成启用宏名数组的 JSON 文件。

1. 运行预处理步骤，生成 `.tsifdef/Output`：

```bash
npm run precompile
```

2. 编译 `.tsifdef/Output` 中生成后的项目：

```bash
npm run compile
```

当前工程自己的 `files`、`include` 和 `exclude` 都属于预处理合同的一
部分。独立子工程保留自己的 `tsifdef` 配置，不会被父工程隐式重写。

## 在 VSCode 里使用

1. 安装 VSIX 发布产物。
2. 打开带有 `package.json` `tsifdef` 指针的工作区。
3. 状态栏会显示当前 Profile 文件名。
4. 灰显、折叠、诊断和 tsserver 投影都会跟随该 Profile。

## 发布

```bash
npm run release
```

会输出：

- `release/tsifdef-1.0.0.vsix`
- `release/tsifdef-1.0.0.tgz`
- `release/manifest.json`

唯一版本源放在 `src/version.ts`。
