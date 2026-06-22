# TSIfDef

TSIfDef is source-level conditional compilation for TypeScript.

TSIfDef keeps the core macro analysis shared across the CLI, tsserver plugin,
and VSCode extension.

What ships:

- `release/tsifdef-1.0.0.vsix` for VSCode installation.
- `release/tsifdef-1.0.0.tgz` for npm/CI/CLI installation.
- `release/manifest.json` for the exact version and Git revision used to build
  both artifacts.

The canonical version is stored in `src/version.ts`. Build and release scripts
sync the published manifests from that file.

Quick start:

```bash
npm install
npm run build
npm test
```

To build the release artifacts:

```bash
npm run release
```

Package roles:

- VSIX: editor experience, status bar, gray ranges, folding, and tsserver
  integration.
- tgz: command-line precompile flow and CI packaging.

The repository keeps both outputs on the same version and Git revision.
