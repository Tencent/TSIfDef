# Development Roadmap

Task states: `TODO`, `ACTIVE`, `DONE`, `BLOCKED`.

Only one task may be `ACTIVE`. Each task must leave the repository usable for
the next session.

## M0 - Repository Foundation

### CORE-001 - Package and test scaffold (`ACTIVE`)

Scope:

- Create the npm/TypeScript package layout.
- Pin TypeScript 5.5.4.
- Add build, test, and typecheck commands.
- Add a minimal exported `core` entry point and smoke test.

Acceptance criteria:

- `npm install` succeeds from a clean checkout.
- `npm run build`, `npm run typecheck`, and `npm test` succeed.
- No macro behavior is implemented in this task.

## M1 - Shared Core

### CORE-002 - Directive scanner (`TODO`)

Recognize line-comment directives without matching text inside strings,
template strings, or block comments. Return UTF-16 source ranges and structural
diagnostics.

### CORE-003 - Expression parser (`TODO`)

Implement identifiers, `defined(NAME)`, `!`, `&&`, `||`, and parentheses with
precedence and unknown-macro diagnostics.

### CORE-004 - Conditional evaluator (`TODO`)

Evaluate nested `#if/#elif/#else/#endif` groups and active `#error` directives.

### CORE-005 - Equal-length projection (`TODO`)

Mask inactive code with spaces while preserving CR, LF, total UTF-16 length,
and offsets. Add golden tests for CRLF, Chinese text, and surrogate pairs.

### CORE-006 - Core robustness suite (`TODO`)

Cover malformed nesting, expression errors, false directives, and projection
invariants with golden and property-oriented tests.

## M2 - CLI

### CLI-001 - Profile loading and precedence (`TODO`)

Load JSON profiles and implement explicit CLI profile and
`HOK_TS_PROFILE` precedence. Junction inference is development-only.

### CLI-002 - Emit command (`TODO`)

Project source files into `Build/.macrobuild/<PROFILE>` without modifying the
source tree.

### CLI-003 - Check command (`TODO`)

Implement one-profile and `--all` structural/profile checking with stable exit
codes and diagnostics.

### CLI-004 - Watch and incremental cache (`TODO`)

Add watch mode and a cache key containing source content, profile definition,
preprocessor version, and macro-config version.

### CLI-005 - TsScripts pilot integration (`TODO`)

Test against `E:\HOK_Trunk\Program\TsScripts`, then document the non-destructive
commands and observed build constraints.

## M3 - VSCode Extension

### VSC-001 - Extension shell and profile state (`TODO`)
### VSC-002 - Diagnostics and decorations (`TODO`)
### VSC-003 - Folding and local CLI commands (`TODO`)

## M4 - TypeScript Server Plugin

### TSS-001 - Snapshot projection (`TODO`)
### TSS-002 - Profile version and project invalidation (`TODO`)
### TSS-003 - TypeScript 5.5.4 language-service integration tests (`TODO`)

## M5 - Product Integration and Release

### INT-001 - HOK and Domestic profile/typecheck pipeline (`TODO`)
### INT-002 - Existing build-pipeline integration (`TODO`)
### INT-003 - CI jobs (`TODO`)
### REL-001 - Version-matched VSIX and tgz artifacts (`TODO`)
