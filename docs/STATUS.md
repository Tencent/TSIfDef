# Development Status

Last updated: 2026-06-22

## Current Task

`REL-001 - Version-matched VSIX and tgz artifacts`

Define artifact acceptance criteria, then produce self-contained VSIX and npm
tgz artifacts from the same version, core, and Git revision. HOK owns CI and
downstream pipeline integration; do not add CI configuration or modify the
external HOK/SVN workspace.

## Completed This Session

- Reduced `docs/ROADMAP.md` to active and future work.
- Replaced the mixed decision log with a concise summary of effective
  architectural constraints.
- Moved completed tasks, superseded decisions, the previous handoff, pilot
  results, retired research, and the completed implementation sequence into
  indexed files under `docs/History/`.
- Kept `SPEC.md` as the current product contract and renumbered its remaining
  sections after moving historical material.

## Verification

- All relative Markdown links resolve: passed.
- `git diff --check`: passed.

## Known Issues

- Project references and uncommon path-valued compiler options do not yet have
  explicit integration coverage.
- Raw macro source is intentionally invalid TypeScript; parser and lint tooling
  must consume `.tsifdef/Output`.

## Next Task

Continue only `REL-001`: define its artifact acceptance criteria before
implementation.
