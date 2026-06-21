# TSIfDef Development Workflow

This repository is developed in small, resumable tasks. `SPEC.md` is the
product requirement and remains the source of truth.

## Session Start

Every development session must read these files in order:

1. `SPEC.md`
2. `docs/STATUS.md`
3. `docs/ROADMAP.md`
4. `docs/DECISIONS.md`

Then inspect `git status` before changing files. Do not overwrite unrelated
working-tree changes.

## Task Rules

- Work on only the task named under `Current Task` in `docs/STATUS.md`.
- Keep a task small enough to implement and verify in one session.
- Do not start the next task in the same session unless the user explicitly
  asks for it.
- A task is complete only when its acceptance criteria pass.
- Put reusable behavior in `core`; VSCode, tsserver, and CLI must not implement
  their own macro semantics.
- Preserve UTF-16 offsets and source length whenever source is projected.
- Record decisions that constrain later work in `docs/DECISIONS.md`.

## Session End

Before ending a development session:

1. Run the verification commands required by the current task.
2. Update the task state in `docs/ROADMAP.md`.
3. Rewrite `docs/STATUS.md` with completed work, verification results, known
   issues, and exactly one next task.
4. Record new architectural decisions in `docs/DECISIONS.md`.
5. Report changed files and verification results to the user.

Do not claim a task is complete when verification did not run. Record a
blocked command and its error in `docs/STATUS.md` instead.
