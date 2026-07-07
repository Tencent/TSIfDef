# Development Status

Last updated: 2026-07-07

## Current Task

No active implementation task. Planning for M6 (Projected Compilation) is
complete; `PC-001` is the next task to start.

## Completed This Session

- Decided to replace on-disk projection + stock `tsc` with **projected
  compilation**: hijack the CompilerHost, feed equal-length masked text under the
  original file names, and drive `program.emit()`. Verified by controlled
  experiment that this is the only approach giving relative, portable `.map`
  sources pointing at original sources (absolute `sourceRoot` bakes in absolute
  paths; relative `sourceRoot` misaligns across `.map` depths).
- Decided Profile invalidation is a **full rebuild on any Profile change**
  (`tsifdef.profilehash`), not per-file invalidation.
- Rewrote `SPEC.md` (§2, §4, §8 + §8.1–8.3, §9, §10, §11, §13) to the projected
  compilation design and generalized it to an open-source, non-HOK audience.
- Added the staged development plan `docs/projected-compilation-plan.md` and
  M6 tasks (`PC-001..005`) to `docs/ROADMAP.md`.
- Updated `docs/DECISIONS.md` Configuration/Build/Packaging sections to the new
  design.
- Archived the two superseded integration plans to `docs/History/`.

## Verification

- No code changed this session; documentation only.

## Known Issues

- `vsce` still warns that `package.json` lacks `repository` metadata.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  consume the equal-length projection.

## Next Task

`PC-001 - One-shot tsifdef build prototype`. See
`docs/projected-compilation-plan.md` stage 1 for scope and test cases.
