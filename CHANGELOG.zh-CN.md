# 更新日志

## v1.1.11 - 2026-09-17

- 同时识别新版 `js/ts.experimental.useTsgo` 和旧版
  `typescript.experimental.useTsgo` 配置，以判断工作区是否由 TypeScript 7 / TSGo
  提供语义服务。
- TSGo 模式下继续提供未激活代码置灰、折叠、宏诊断和 Profile 状态，同时不再激活、
  配置、重载或重启旧 TypeScript Server。
- 工作区从 TSGo 切回旧 TypeScript 语言服务时，重新配置 tsserver 插件并只重载一次项目。

## v1.1.10 - 2026-09-15

- 修复重新生成 `tsconfig.json`、TypeScript 工程再次启用插件时，tsserver 插件重复叠加
  host 代理、Profile 文件监视器和投影缓存的问题。
- TypeScript language service 销毁时释放已缓存的源码投影。
- 首次加载 Profile 时只重新加载工程，不再重启刚启动的 tsserver。

## v1.1.9 - 2026-09-11

首个公开版本。

- 为 TypeScript 提供 `#if` / `#elif` / `#else` / `#endif` 条件编译，由 Profile
  驱动：一个列出已启用宏名的 JSON 数组，通过 `package.json` 引用。
- `tsifdef build` 以等长遮盖未激活分支的方式交给 TypeScript 编译，因此产出的
  `.js`、`.js.map` sources、`.d.ts` 和报错路径都指向原始文件。支持增量编译和
  `--watch`。
- VSCode 扩展：置灰并折叠未激活分支，在状态栏显示当前 Profile。
- tsserver 插件随同一个 VSIX 发布，语言服务不再对未激活代码报错，未知宏按
  `false` 处理。
- ESLint processor 和 parser wrapper 包含在同一个 npm 包中。诊断保留真实行列
  位置，自动修复和快速修复正常工作，`prettier/prettier` 等格式化规则可以保持
  开启。
- Flat Config 使用 `tsifdef.configs["flat/recommended"]`；旧版 `.eslintrc` 使用
  `extends: ["plugin:tsifdef/recommended"]`。
- 支持 ESLint 8.57 和 9，以及 `@typescript-eslint/parser` 5 至 8，两者均为
  optional peer dependency。
- `spec/` 下提供可移植规范和与实现无关的一致性用例。
