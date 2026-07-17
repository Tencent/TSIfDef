# TSIfDef

Language file: [`README.md`](./README.md)

TSIfDef 用于 TypeScript 的源码级条件编译。核心宏分析由 CLI、tsserver 插件、
VSCode 扩展和 ESLint processor 共享实现——任何环境都不自行解释宏规则。

## 安装

```bash
npm install
npm run build
```

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

## 在 ESLint 里使用

ESLint 用自己的 parser 直接解析原始源码，因此不接入时，`#if` 那一行会让它报
`Parsing error: ';' expected`。TSIfDef 自带一个 ESLint processor，在 ESLint 看到
代码之前先做等长遮盖投影——与 tsserver 劫持 `getScriptSnapshot` 是对称的做法。

安装 tgz 时会运行 `postinstall`，在宿主 `node_modules` 下自动生成一个极小的转发包
`eslint-plugin-tsifdef`（ESLint 会把 `plugins: ["tsifdef"]` 解析成名为
`eslint-plugin-tsifdef` 的包，npm alias 无法满足，故用转发包）。然后在工程
`.eslintrc` 里加一段 override：

```json
{
  "plugins": ["tsifdef"],
  "overrides": [
    { "files": ["*.ts", "*.mts", "*.cts", "*.tsx"], "processor": "tsifdef/macros" }
  ]
}
```

未激活分支会被遮盖，ESLint 只检查激活视图；因为等长遮盖保留长度，诊断的行列与
原始文件一致。

关于 Prettier：等长遮盖会把宏指令行（`#if`、`#endif` 等）替换成一串空格。`tsc`
不在意空白，但 `prettier/prettier` 会把“行尾空白”报成格式问题。若不想要这类噪音，
在工程 `.eslintrc` 里关掉该规则：

```json
"rules": { "prettier/prettier": "off" }
```

## 发布

生成同版本产物：

```bash
# 只设置一次新版本；npm 同时刷新 package-lock.json。
npm version <patch|minor|major|x.y.z> --no-git-tag-version
npm run release
```

会输出：

- `release/tsifdef-<version>.vsix`
- `release/tsifdef-<version>.tgz`
- `release/manifest.json`

唯一需要人工配置的版本是 `package.json` 的 `version`。构建和发布会在编译前从该
字段同步生成的源码与辅助包元数据；不要通过修改 `src/version.ts`、
`package-lock.json` 或辅助 manifest 来变更产品版本。
