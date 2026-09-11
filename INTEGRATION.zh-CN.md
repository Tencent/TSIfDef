# 在项目中集成 TSIfDef

Language file: [`INTEGRATION.md`](./INTEGRATION.md)

如何在 TypeScript 项目里接入 TSIfDef：构建、编辑器、lint。三者相互独立，按需采用
其中任意部分即可。它们读同一个 Profile。

## 1. 概念

- **宏**是一个普通标识符，例如 `BROWSER` 或 `EXPERIMENTAL`。
- **Profile** 是一个 JSON 数组，列出已启用的宏名。未列出的名字求值为 `false`；
  未知名字不报错。
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

Profile 如何产生——手写、脚本生成，或由另一套工具链生成——由你的项目决定。如果
它是生成物，请不要纳入源码控制，并让构建在文件缺失时失败：过期的 Profile 会静默
产出错误输出。

## 2. 构建

安装包，用 `tsifdef build` 代替 `tsc` 编译：

```bash
npm install -D tsifdef
```

```jsonc
"scripts": {
  "compile": "tsifdef build",
  "watch": "tsifdef build --watch"
}
```

emit 出的 `.js.map` sources、`.d.ts` 和报错路径都指向你的原始文件，因此下游工具
无需知道 TSIfDef 参与过构建。

```bash
tsifdef build -p ./custom.tsconfig.json
tsifdef build -p ./tsconfig.json -- --module commonjs --outDir dist
```

`-p`/`--project` 用于选择 tsconfig；`--` 之后的参数作为 tsc 选项覆盖它。切换
Profile 会自动触发全量重编。不支持 `outFile` 和 composite references（`tsc -b`）。

## 3. 编辑器（VSCode）

让 `#if` 置灰、不再报错需要两部分：

1. **VSCode 扩展**——置灰并折叠未激活分支，并在状态栏显示当前 Profile。按编辑器
   情况任选一种安装方式：

   - **市场安装**——在扩展面板（`Ctrl+Shift+X`）搜索 **TSIfDef**，安装发布者为
     **Tencent TiMi Studio Group** 的条目；或执行
     `code --install-extension timi-studio.tsifdef`。
   - **VSIX 安装**——适用于访问不到 VS Code 市场的编辑器。从
     [最新版本](https://github.com/Tencent/TSIfDef/releases/latest) 下载
     `tsifdef-<version>.vsix`，执行
     `code --install-extension tsifdef-<version>.vsix`，或在扩展面板使用
     **⋯ → 从 VSIX 安装**。
2. **tsserver 插件**——随该 VSIX 一起发布，让语言服务忽略未激活代码。它通过
   工作区 TypeScript 版本加载，因此需要将工作区指向其本地 TypeScript：

```jsonc
// .vscode/settings.json （或 *.code-workspace 的 settings）
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

然后运行 `TypeScript: Restart TS Server`。之后未激活代码不再报错，
`#if UNKNOWN_MACRO` 按 `false` 处理而非“未知宏”。

升级扩展后同样要执行 `TypeScript: Restart TS Server`——正在运行的 server 会一直
使用旧插件，直到重启为止。

## 4. ESLint

不接 TSIfDef 时，原始的 `#if` 行会被报成解析错误。ESLint processor 已包含在构建
所安装的 `tsifdef` 包中，无需安装第二个包。

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

顶层仍使用项目正常的 `@typescript-eslint/parser`，让编辑器集成能够识别 TypeScript
校验。

不需要关闭任何规则。诊断报在真实行列位置，自动修复和编辑器快速修复正常工作，
`prettier/prettier` 等格式化规则保持开启即可：未激活分支不会产生格式告警，而
激活代码中的真实问题照常报告。TSIfDef 唯一会拦下的，是会覆盖 `#if` 行的那类
修复——其诊断仍然照报，只是没有自动修复项。

TSIfDef 支持 ESLint 8.57 和 9，以及 `@typescript-eslint/parser` 5 至 8。两者均为
optional peer dependency，具体版本由宿主项目管理。

### 旧版 `.eslintrc`

旧配置系统会把 `tsifdef` 解析为名为 `eslint-plugin-tsifdef` 的包，因此需要将同一个
包安装到该别名：

```bash
npm install -D eslint-plugin-tsifdef@npm:tsifdef
# 离线使用发布产物时：
npm install -D eslint-plugin-tsifdef@file:./tsifdef-<version>.tgz
```

```jsonc
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "extends": ["plugin:tsifdef/recommended"]
}
```

这一行同时配好 plugin、processor 和 `import/parsers`。如果项目同时 extends 了
`plugin:import/typescript`，请把它放在 `extends` 的**最后**：那份配置会为相同
扩展名注册 `@typescript-eslint/parser`，而 `eslint-plugin-import` 取先出现的
那个 parser。

若要手动展开：

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
