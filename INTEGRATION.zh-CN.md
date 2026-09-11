# 在项目中集成 TSIfDef

Language file: [`INTEGRATION.md`](./INTEGRATION.md)

本指南说明如何在一个 TypeScript 项目里接入 TSIfDef：构建、编辑器体验、lint。
TSIfDef 是通用的——它只需要一个列出已启用宏的 Profile。至于 Profile 如何产生
（手写、脚本生成，或由另一套工具链生成），由你的项目决定。

## 1. 概念

- **宏**是一个普通标识符，例如 `BROWSER` 或 `EXPERIMENTAL`。
- **Profile** 是一个 JSON 数组，列出已启用的宏名，例如
  `["BROWSER", "EXPERIMENTAL"]`。未列出的名字求值为 `false`；未知名字不报错。
- `package.json` 通过 `tsifdef` 字段持有指向当前 Profile 的唯一指针。构建、
  VSCode、tsserver 和 ESLint 都从它读取。

```jsonc
// package.json
{
  "tsifdef": "./Profiles/browser.json",
  "scripts": {
    "compile": "tsifdef build"
  }
}
```

```jsonc
// Profiles/browser.json
["BROWSER", "EXPERIMENTAL"]
```

Profile 文件是构建的输入。如果它是生成物，请不要纳入源码控制，并让构建在文件
缺失时失败，而不是提交一个备用 Profile——过期或错误的 Profile 会静默产出错误输出。

## 2. 构建

安装 CLI 包，用 `tsifdef build` 代替 `tsc` 编译：

```bash
npm install -D tsifdef
```

```jsonc
"scripts": {
  "compile": "tsifdef build",
  "watch": "tsifdef build --watch"
}
```

`tsifdef build` 读取 `package.json` 的 `tsifdef` 指针和项目的 `tsconfig.json`，
对未激活的 `#if` 分支做等长遮盖，并自行驱动 TypeScript 编译器。因为编译器看到的
是原始文件名，emit 出的 `.js.map` `sources`、`.d.ts` 和报错路径都指向你的原始
源码——无需后处理、没有需要忽略的影子源码树。可以指定其他 tsconfig，并在 `--`
后传入覆盖 tsconfig 的 tsc 选项：

```bash
tsifdef build -p ./custom.tsconfig.json
tsifdef build -p ./tsconfig.json -- --module commonjs --outDir dist
tsifdef build --watch --emit-projection .projection
```

`-p`/`--project` 用于选择 tsconfig。`--emit-projection` 可在单次构建和 watch
模式下写出等长调试投影。`outFile` 和多项目 composite references（`tsc -b`）暂不支持。

切换 Profile（修改 `package.json` 的 `tsifdef` 指针或 Profile 文件）会自动触发
一次全量重编。

## 3. 编辑器体验（VSCode）

让 `#if` 在编辑器里置灰、不再报错，需要两部分：

1. **VSCode 扩展** —— 安装 TSIfDef VSIX。它置灰并折叠未激活分支、在状态栏显示
   当前 Profile，并把解析出的 Profile 推送给 tsserver 插件。
2. **tsserver 插件** —— 让语言服务只看到投影后（遮盖）的源码，因此未激活代码
   不产生类型错误、未知宏不被标记。它通过工作区 TypeScript 版本加载。

配置工作区使用其本地 TypeScript，以便插件加载：

```jsonc
// .vscode/settings.json （或 *.code-workspace 的 settings）
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

安装扩展并设置 tsdk 后，运行 `TypeScript: Restart TS Server`。之后 `#if`/`#else`
块会置灰、未激活代码不报错，`#if UNKNOWN_MACRO` 按 `false` 处理而非“未知宏”。

升级扩展后同样需要执行 `TypeScript: Restart TS Server`：正在运行的 server 会一直
使用先前加载的插件，直到重启为止。

## 4. ESLint

如果项目使用 ESLint，原始的 `#if` 行本会被报成解析错误。TSIfDef 提供一个 ESLint
processor，让 ESLint 检查等长投影而非原始文本（位置不变，诊断直接映射回原文）。
它已经包含在构建所安装的 `tsifdef` 包中，无需安装第二个 TSIfDef 包。

将推荐配置放在项目现有的 TypeScript Flat Config 之后：

```javascript
// eslint.config.mjs
import tsParser from "@typescript-eslint/parser";
import tsifdef from "tsifdef/eslint-plugin";

export default [
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: { parser: tsParser },
  },
  tsifdef.configs["flat/recommended"],
];
```

推荐配置会为 TypeScript 文件注册 `tsifdef/macros`，并将依赖文件解析映射到
`tsifdef/parser`。顶层仍使用项目正常的 `@typescript-eslint/parser`，让编辑器集成
能够识别 TypeScript 校验；`import/no-cycle` 等绕过 processor、直接读取依赖文件的
规则会使用 TSIfDef wrapper。

TSIfDef 支持 ESLint 8.57 和 9，并支持其中相互兼容的 `@typescript-eslint/parser`
5 至 8。两者均为 optional peer dependency，具体版本仍由宿主项目管理。

### 旧版 `.eslintrc`

旧配置系统会把 `tsifdef` 解析为名为 `eslint-plugin-tsifdef` 的包，因此需要将同一个
npm 包安装到该别名：

```bash
npm install -D eslint-plugin-tsifdef@npm:tsifdef
```

离线使用发布产物时，让该别名指向 tgz：

```bash
npm install -D eslint-plugin-tsifdef@file:./tsifdef-<version>.tgz
```

```jsonc
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["tsifdef"],
  "overrides": [
    {
      "files": ["*.ts", "*.mts", "*.cts", "*.tsx"],
      "processor": "tsifdef/macros"
    }
  ],
  "settings": {
    "import/parsers": {
      "eslint-plugin-tsifdef/parser": [".ts", ".tsx", ".mts", ".cts"]
    }
  }
}
```

processor 解析 Profile 的方式与 CLI 一致（最近的 `package.json` 里的 `tsifdef`
指针）。安装的同一个包同时提供 CLI、核心 API、ESLint processor 和 parser，不再
维护额外的 companion 包及其版本。

### Prettier 与其他文本规则

等长遮盖会把宏指令和未激活分支替换为空格。processor 会删除诊断范围完全来自这些
合成遮盖字符的消息；只要诊断触及任一真实源码字符（包括真实的行尾空白），就仍然
保留。因此 `prettier/prettier` 等文本规则应保持开启。

### 自动修复与快速修复

processor 保持 ESLint 自动修复可用，因此含宏文件中的编辑器快速修复和
`eslint --fix` 均正常工作。每条修复会被单独校验：若其替换范围与宏指令或非活跃
分支重叠，则丢弃该修复——因为应用它会覆盖规则从未见过的 `#if` 代码。此时诊断
本身仍会报告，只是没有自动修复项。完全落在活跃代码内的修复原样保留。

## 5. 职责分离

构建路径（`tsifdef build`）与编辑器/lint 路径彼此独立。它们读同一个 Profile，
但各自做遮盖：

- 构建在 emit 前遮盖未激活代码，因此输出的 JavaScript 永不包含未激活分支。
- tsserver 插件和 ESLint processor 遮盖编辑器与 linter 所看到的内容，因此工具
  永不报告未激活代码。

它们互不依赖；按需采用其中的部分即可。
