# Development Roadmap

This file shows only active and future work. Completed milestones and their
acceptance criteria are archived in
[`History/ROADMAP_COMPLETED.md`](History/ROADMAP_COMPLETED.md).

Task states are `TODO`, `ACTIVE`, `DONE`, and `BLOCKED`. Only one task may be
`ACTIVE`.

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
