# Development Roadmap

This file shows only active and future work. Completed milestones and their
acceptance criteria are archived in
[`History/ROADMAP_COMPLETED.md`](History/ROADMAP_COMPLETED.md).

Task states are `TODO`, `ACTIVE`, `DONE`, and `BLOCKED`. Only one task may be
`ACTIVE`.

## M5 - Product Integration and Release

### REL-001 - Version-matched VSIX and tgz artifacts (`ACTIVE`)

Produce self-contained, version-matched VSIX and npm/tgz artifacts from the same
core and Git revision.

Acceptance criteria must be defined before implementation. They must cover at
least artifact contents, version and revision agreement, clean-checkout
reproducibility, installation smoke tests, and the standard repository build,
typecheck, and test commands.

HOK owns CI and downstream pipeline integration. This repository does not add
or configure HOK CI jobs.
