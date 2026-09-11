<p align="center">
  <img src="https://raw.githubusercontent.com/Tencent/TSIfDef/main/assets/icon.png" alt="TSIfDef icon" width="128">
</p>

# TSIfDef 1.1.8

**English** | [简体中文](./README.zh-CN.md)

[![License](https://img.shields.io/badge/license-Apache--2.0-brightgreen.svg?style=flat)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Tencent/TSIfDef?style=flat&label=release)](https://github.com/Tencent/TSIfDef/releases/latest)
[![Changelog](https://img.shields.io/badge/changelog-1.1.8-orange.svg?style=flat)](./CHANGELOG.md)
[![GitHub Stars](https://img.shields.io/github/stars/Tencent/TSIfDef?style=flat&logo=github)](https://github.com/Tencent/TSIfDef/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/Tencent/TSIfDef?style=flat&logo=github)](https://github.com/Tencent/TSIfDef/issues)
[![Test](https://github.com/Tencent/TSIfDef/actions/workflows/test.yml/badge.svg)](https://github.com/Tencent/TSIfDef/actions/workflows/test.yml)
[![Build](https://github.com/Tencent/TSIfDef/actions/workflows/build.yml/badge.svg)](https://github.com/Tencent/TSIfDef/actions/workflows/build.yml)

> **TSIfDef adds reliable `#if` conditional compilation to TypeScript.**
> Build multiple products from one source tree while the compiler, editor, and
> ESLint always see the same active code.

```typescript
#if BROWSER
export const runtime = "browser";
#elif NODE
export const runtime = "node";
#else
#error Select a supported runtime
#endif
```

[![Download](https://img.shields.io/badge/Download-Latest_Release-blue.svg?style=for-the-badge)](https://github.com/Tencent/TSIfDef/releases/latest)

## Quick Start

Install TSIfDef as a development dependency:

```bash
npm install -D tsifdef
```

Create a Profile containing the macros enabled for this build:

```json
["BROWSER"]
```

Point `package.json` at that Profile and use TSIfDef as the compiler entry:

```json
{
  "tsifdef": "./Profiles/browser.json",
  "scripts": {
    "build": "tsifdef build",
    "watch": "tsifdef build --watch"
  }
}
```

Write conditional TypeScript directly in the original source file, as shown
in the example above.

Run the normal project build:

```bash
npm run build
```

Only the active branch reaches TypeScript. Source paths, diagnostics,
declarations, and source maps still point to the original files.

## Product Highlights

- **One source tree** — no generated shadow project and no duplicated platform code.
- **One Profile** — builds, editor intelligence, and ESLint use the same macro set.
- **Native TypeScript output** — original paths and source-map locations are preserved.
- **Complete editor feedback** — inactive code is dimmed and folded without false errors.
- **Production workflows** — incremental compilation, watch mode, ESLint, and CI are supported.

## Editor Support

Download the `.vsix` from [GitHub Releases](https://github.com/Tencent/TSIfDef/releases/latest)
and install it in VS Code, CodeBuddy, or CodeBuddy CN. Open a project whose
`package.json` contains the `tsifdef` Profile pointer.

The extension shows the active Profile in the status bar, dims inactive code,
provides folding and diagnostics, and keeps the TypeScript language service on
the same active source used by the build.

## ESLint

The same `tsifdef` package includes the ESLint processor and parser wrapper; no
second TSIfDef package is required. Add its recommended config to an existing
TypeScript flat config:

```javascript
import tsifdef from "tsifdef/eslint-plugin";

export default [
  // Your existing TypeScript ESLint config,
  tsifdef.configs["flat/recommended"],
];
```

ESLint then reports against the active source at the original line and column
positions, with autofix and quick fixes intact. No rules need to be disabled —
formatting rules such as `prettier/prettier` stay enabled and report only on
active code. Legacy `.eslintrc` setup is documented in the
[Integration Guide](./INTEGRATION.md).

## Build Behavior

Incremental builds and `--watch` are supported, and current-project `files`,
`include`, and `exclude` settings are honored. Changing the selected Profile
forces a full rebuild. `outFile` and project references (`tsc -b`) are not
supported.

Use `tsifdef build --emit-projection <dir>` when you need to inspect the exact
source view passed to TypeScript.

## Documentation

| Document | Purpose |
|---|---|
| [Integration Guide](./INTEGRATION.md) | Build, editor, and ESLint setup |
| [Portable Specification](./spec/README.md) | Syntax, behavior, schemas, and conformance fixtures |
| [Changelog](./CHANGELOG.md) | Release history |
| [Contributing](./CONTRIBUTING.md) | Development and pull-request workflow |
| [Security Policy](./SECURITY.md) | Private vulnerability reporting |

## Requirements

- Node.js 18.17 or newer
- TypeScript 5.5
- VS Code 1.85 or a compatible editor for the VSIX

## Development

```bash
npm ci
npm test
npm run build
```

Maintainers can build and verify the npm and VSIX artifacts with
`npm run release`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the repository
workflow.

## License

TSIfDef is released under the [Apache License 2.0](./LICENSE).
