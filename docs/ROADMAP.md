# Development Roadmap

This file shows only active and future work. Completed milestones and their
acceptance criteria are archived in
[`History/ROADMAP_COMPLETED.md`](History/ROADMAP_COMPLETED.md).

Task states are `TODO`, `ACTIVE`, `DONE`, and `BLOCKED`. Only one task may be
`ACTIVE`.

## M6 - Projected Compilation (`tsifdef build`)

Replace on-disk projection + stock `tsc` with projected compilation: hijack the
CompilerHost, feed equal-length masked text under original file names, and drive
`program.emit()`. This makes SourceMap `sources`, `.d.ts`, and error paths point
at original sources natively. Full design and staged plan:
[`projected-compilation-plan.md`](projected-compilation-plan.md). SPEC §8, §8.1–8.3,
§11, §13.

Every stage's definition of done includes passing automated tests
(`node:test`).

### PC-001 - One-shot `tsifdef build` prototype (`DONE`)

Host hijack + emit + diagnostics + exit code (no incremental, no watch). Verify
`.map` sources / error paths / column stability on a multi-file, multi-depth
project. Plan stage 1.

### PC-002 - Incremental and Profile invalidation (`DONE`)

`createIncrementalProgram` + `tsifdef.profilehash`. Core regression: switching
Profile with unchanged sources must not reuse the previous Profile's output.
Plan stage 2.

### PC-003 - Watch (`DONE`)

`createWatchCompilerHost` + Profile watcher + rebuild on Profile change. Plan
stage 3. Covers SPEC §11.5 cases 1-5; the "rapid successive edits" case is
deferred (timing-dependent, low value as a stable assertion).

### PC-004 - Option matrix (`DONE`)

Cover the "special-cased / unsupported" rows of the SPEC §8 option table with
tests. Plan stage 4.

### PC-005 - Optional audit dump and docs (`ACTIVE`)

`--emit-projection <dir>`; update README / CHANGELOG / INTEGRATION to
`tsifdef build`. Plan stage 5.

## M5 - Product Integration and Release

### REL-001 - Version-matched VSIX and tgz artifacts (`DONE`)

Produce self-contained, version-matched VSIX and npm/tgz artifacts from the same
core and Git revision.

Acceptance criteria:

- The release build emits exactly two distributable artifacts: one VSIX and one
  npm/tgz package.
- Both artifacts are produced from the same checked-out Git revision and the
  same `core` implementation.
- The package version embedded in both artifacts matches the repository release
  version for that build.
- Each artifact is self-contained: it includes the files required to run in its
  target environment and does not depend on workspace-only source files or
  untracked build inputs.
- A clean checkout can reproduce the artifacts with the documented build
  command sequence, without relying on existing generated output.
- Installation smoke tests pass for both deliverables: the VSIX installs in a
  supported VSCode host and the tgz installs in the expected npm consumer
  environment.
- The standard repository build, typecheck, and test commands pass after the
  release artifacts are produced.
This repository does not add or configure downstream CI jobs; those remain
owned outside this repository.
