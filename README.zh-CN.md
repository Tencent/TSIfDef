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

2. 编译 `.tsifdef/Output` 下生成的项目：

```bash
npm run compile
```

当前项目的 `files`、`include`、`exclude` 是预处理契约的一部分。独立的子项目保留
各自的 `tsifdef` 配置，不会被隐式改写。

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
npm run release
```

会输出：

- `release/tsifdef-1.0.0.vsix`
- `release/tsifdef-1.0.0.tgz`
- `release/manifest.json`

唯一版本源放在 `src/version.ts`。
