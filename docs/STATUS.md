# Development Status

Last updated: 2026-07-09

## Current Task

No active task in this repository.

## Completed This Session

- **OS-002 done**: added the public GitHub repository metadata required by
  `vsce`.
  - Set `repository` to `https://github.com/Tencent/TsIfDef.git`.
  - Changed the Chinese README entry to an absolute GitHub URL so Marketplace
    rendering does not depend on relative-link inference.

## Verification

- `npm run release`: passed.
  - Produced and installed `tsifdef-1.0.0.vsix`.
  - Produced, installed, and invoked `tsifdef-1.0.0.tgz`.
- `npm run typecheck`: passed.
- `npm test`: passed; 109 tests.

## Known Issues

- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

None in this repository. When ready, cut an open-source release.
