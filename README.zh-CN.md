<p align="center">
  <img src="assets/icon.png" alt="TSIfDef 图标" width="50%">
</p>

# TSIfDef 1.1.5

[English](./README.md) | **简体中文**

[项目主页](https://github.com/Tencent/TSIfDef) ·
[`更新日志`](./CHANGELOG.zh-CN.md) ·
[`接入指南`](./INTEGRATION.zh-CN.md) ·
[`参与贡献`](./CONTRIBUTING.md) ·
[`安全策略`](./SECURITY.md)

TSIfDef 用于 TypeScript 的源码级条件编译。核心宏分析由 CLI、tsserver 插件、
VSCode 扩展和 ESLint processor 共享实现——任何环境都不自行解释宏规则。

可移植的语法规范和与实现无关的一致性用例放在
[`spec/`](./spec/README.zh-CN.md) 目录，可以独立用于验证兼容实现。

## 安装

在 TypeScript 工程中安装 TSIfDef：

```bash
npm install --save-dev tsifdef
```

如果是从源码构建本仓库：

```bash
npm install
npm run build
```

运行要求：Node.js 18.17 或更高版本、TypeScript 5.5；使用编辑器扩展时需要
VSCode 1.85 或更高版本。

## 在项目里使用

在 `package.json` 中添加 `tsifdef` 指针和 `tsifdef build` 编译脚本，例如：

```json
{
  "tsifdef": "./Profiles/TEST_A.json",
  "scripts": {
    "compile": "tsifdef build",
    "watch": "tsifdef build --watch"
  }
}
```

把对应 Profile 写成启用宏名数组的 JSON 文件。用投影编译进行编译：

```bash
npm run compile
```

`tsifdef build` 劫持 TypeScript CompilerHost，以**原始文件名**把等长遮盖文本喂给
编译器，并自行驱动 `program.emit()`。因为编译器看到的是原始路径，emit 出的
`.js.map` sources、`.d.ts` 和报错信息都指向原始源——无需后处理，也没有需要忽略的
影子源码树。支持增量与 `--watch`；切换 Profile 会触发全量重编。

当前项目的 `files`、`include`、`exclude` 都会被遵循。独立的子项目保留各自的
`tsifdef` 配置，不会被隐式改写。不支持 `outFile` 和 project references（`tsc -b`）。

用于审计时，`tsifdef build --emit-projection <dir>` 会把遮盖后的投影按各文件的
原始相对路径写到 `<dir>`；该参数同样支持 `--watch` 模式。该 dump 只是调试产物，
不会喂给编译器。

## 在 VSCode 里使用

1. 安装 VSIX 发布产物。
2. 打开带有 `package.json` `tsifdef` 指针的工作区。
3. 状态栏会显示当前 Profile 文件名。
4. 灰显、折叠、诊断和 tsserver 投影都会跟随该 Profile。

VSIX 内只包含 VSCode 内置 TypeScript 语言服务加载插件所需的极小模块转发入口，
不会额外打包一份 TypeScript，也不会给宿主工程增加运行依赖。如果内置 TypeScript
语言服务不存在或被禁用，TSIfDef 会静默跳过语言服务接入，不弹扩展错误；灰显和折叠
等独立的编辑器功能仍可使用。

## 在 ESLint 里使用

ESLint 用自己的 parser 直接解析原始源码，因此不接入时，`#if` 那一行会让它报
`Parsing error: ';' expected`。TSIfDef 自带一个 ESLint processor，在 ESLint 看到
代码之前先做等长遮盖投影——与 tsserver 劫持 `getScriptSnapshot` 是对称的做法。

将同一个 TSIfDef 包按 ESLint 的标准插件名安装。包内仍然提供 `tsifdef` CLI：

```bash
npm install --save-dev eslint-plugin-tsifdef@npm:tsifdef
```

使用本地文件或离线接入时，只需让这一个依赖指向发布 tgz：

```bash
npm install --save-dev eslint-plugin-tsifdef@file:./tsifdef-<version>.tgz
```

统一包的根入口提供 ESLint processor，`eslint-plugin-tsifdef/parser` 提供 parser。
然后在工程 `.eslintrc` 里加一段 override：

```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["tsifdef"],
  "overrides": [
    { "files": ["*.ts", "*.mts", "*.cts", "*.tsx"], "processor": "tsifdef/macros" }
  ],
  "settings": {
    "import/parsers": {
      "eslint-plugin-tsifdef/parser": [".ts", ".tsx", ".mts", ".cts"]
    }
  }
}
```

顶层 parser 应保持为 `@typescript-eslint/parser`，这样 VSCode ESLint 默认的
TypeScript probe 才会校验该文件。TSIfDef parser wrapper 只注册到
`settings.import/parsers`，用于处理 `import/no-cycle` 等直接读取依赖文件、绕过
processor 的规则。processor 仍需保留，用于投影主文件并过滤合成遮盖产生的诊断。

未激活分支会被遮盖，ESLint 只检查激活视图；因为等长遮盖保留长度，诊断的行列与
原始文件一致。`postprocess` 会删除完全由合成遮盖区间引起的诊断，同时保留触及真实
源码的诊断。包括 `prettier/prettier` 在内的文本规则因此可以保持开启。

## 发布

生成同版本产物：

```bash
# 只设置一次新版本；npm 同时刷新 package-lock.json。
npm version <patch|minor|major|x.y.z> --no-git-tag-version
npm run release
```

会生成并完成冒烟验证：

- `release/tsifdef-<version>.vsix`
- `release/tsifdef-<version>.tgz`
- `release/manifest.json`

发布检查会把该 tgz 以 ESLint 插件名安装到全新的临时工程，加载 ESLint processor
和 parser、运行 CLI，并把 VSIX 安装到隔离的 VSCode 扩展目录。

唯一需要人工配置的版本是 `package.json` 的 `version`。构建和发布会在编译前从该
字段同步生成的源码与辅助包元数据；不要通过修改 `src/version.ts`、
`package-lock.json` 或辅助 manifest 来变更产品版本。
