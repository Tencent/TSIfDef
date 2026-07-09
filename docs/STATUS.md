# Development Status

Last updated: 2026-07-09

## Current Task

No active task in this repository.

## Completed This Session

- **OS-003 done**: made root `package.json.version` the only manually configured
  product version.
  - Reversed version synchronization so build/release derive generated source,
    lockfile root metadata, and helper manifests from the root package.
  - Runtime-created ESLint and tsserver shims now inherit the product version.
  - Documented `npm version ... --no-git-tag-version` as the version bump
    workflow and made artifact examples version-independent.
  - Added an automated version-consistency regression test.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed; 110 tests.
- `npm run release`: passed.
  - Produced and installed the version-named VSIX.
  - Produced, installed, and invoked the version-named tgz.
  - Verified compiled, tsserver helper, and ESLint helper versions match root
    `package.json.version`.

## Known Issues

- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

None in this repository. When ready, cut an open-source release.
