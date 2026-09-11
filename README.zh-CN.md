<p align="center">
  <img src="https://raw.githubusercontent.com/Tencent/TSIfDef/main/assets/icon.png" alt="TSIfDef 图标" width="128">
</p>

# TSIfDef 1.1.8

[English](./README.md) | **简体中文**

[![许可证](https://img.shields.io/badge/license-Apache--2.0-brightgreen.svg?style=flat)](./LICENSE)
[![最新版本](https://img.shields.io/github/v/release/Tencent/TSIfDef?style=flat&label=release)](https://github.com/Tencent/TSIfDef/releases/latest)
[![更新日志](https://img.shields.io/badge/changelog-1.1.8-orange.svg?style=flat)](./CHANGELOG.zh-CN.md)
[![GitHub Stars](https://img.shields.io/github/stars/Tencent/TSIfDef?style=flat&logo=github)](https://github.com/Tencent/TSIfDef/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/Tencent/TSIfDef?style=flat&logo=github)](https://github.com/Tencent/TSIfDef/issues)

> **TSIfDef 为 TypeScript 提供可靠的 `#if` 条件编译。**
> 一套源码构建多个产品，并让编译器、编辑器和 ESLint 始终使用同一份激活代码。

```typescript
#if BROWSER
export const runtime = "browser";
#elif NODE
export const runtime = "node";
#else
#error Select a supported runtime
#endif
```

[![下载](https://img.shields.io/badge/下载-最新版本-blue.svg?style=for-the-badge)](https://github.com/Tencent/TSIfDef/releases/latest)

## 快速开始

将 TSIfDef 安装为开发依赖：

```bash
npm install -D tsifdef
```

创建 Profile，列出本次构建启用的宏：

```json
["BROWSER"]
```

在 `package.json` 中指向该 Profile，并使用 TSIfDef 作为编译入口：

```json
{
  "tsifdef": "./Profiles/browser.json",
  "scripts": {
    "build": "tsifdef build",
    "watch": "tsifdef build --watch"
  }
}
```

直接在原始 TypeScript 文件中编写条件代码，如上方示例所示。

运行项目构建：

```bash
npm run build
```

TypeScript 只会看到激活分支；源码路径、诊断、声明文件和 sourcemap 仍然指向原文件。

## 产品能力

- **一套源码**：不生成影子工程，不复制平台代码。
- **一份 Profile**：构建、编辑器智能提示和 ESLint 使用同一组宏。
- **原生 TypeScript 产物**：保留原始路径和 sourcemap 位置。
- **完整编辑器体验**：未激活代码自动置灰和折叠，不产生错误诊断。
- **工程化支持**：支持增量编译、watch、ESLint 和 CI。

## 编辑器支持

从 [GitHub Releases](https://github.com/Tencent/TSIfDef/releases/latest) 下载
`.vsix`，安装到 VS Code、CodeBuddy 或 CodeBuddy CN。项目的 `package.json`
需要包含 `tsifdef` Profile 指针。

扩展会在状态栏显示当前 Profile，置灰和折叠未激活代码，提供宏诊断，并让
TypeScript 语言服务与构建过程使用同一份激活代码。

## ESLint

同一个 `tsifdef` 包已经包含 ESLint processor 和 parser wrapper，无需安装第二个
TSIfDef 包。将推荐配置加入现有 TypeScript Flat Config：

```javascript
import tsifdef from "tsifdef/eslint-plugin";

export default [
  // 项目现有的 TypeScript ESLint 配置，
  tsifdef.configs["flat/recommended"],
];
```

ESLint 只检查激活代码，诊断保留原始行列位置，自动修复和快速修复均正常工作。不需要
关闭任何规则——`prettier/prettier` 等格式化规则保持开启即可，只会对激活代码生效。
旧版 `.eslintrc` 接入方式见[接入指南](./INTEGRATION.zh-CN.md)。

## 构建行为

支持增量构建和 `--watch`，当前项目的 `files`、`include` 和 `exclude` 配置都会
生效。切换 Profile 会触发全量重编。不支持 `outFile` 和 project
references（`tsc -b`）。

需要检查 TypeScript 实际接收的源码时，可使用
`tsifdef build --emit-projection <dir>`。

## 文档

| 文档 | 内容 |
|---|---|
| [接入指南](./INTEGRATION.zh-CN.md) | 构建、编辑器和 ESLint 的完整接入方式 |
| [可移植规范](./spec/README.zh-CN.md) | 语法、行为、Schema 和一致性用例 |
| [更新日志](./CHANGELOG.zh-CN.md) | 版本变更记录 |
| [参与贡献](./CONTRIBUTING.md) | 开发与 Pull Request 流程 |
| [安全策略](./SECURITY.md) | 私密漏洞报告方式 |

## 环境要求

- Node.js 18.17 或更高版本
- TypeScript 5.5
- VS Code 1.85 或兼容编辑器

## 开发

```bash
npm ci
npm test
npm run build
```

维护者可以使用 `npm run release` 构建并验证 npm 和 VSIX 产物。仓库协作流程见
[CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

TSIfDef 使用 [Apache License 2.0](./LICENSE) 开源。
