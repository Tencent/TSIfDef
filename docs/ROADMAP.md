# Development Roadmap

Task states: `TODO`, `ACTIVE`, `DONE`, `BLOCKED`.

Only one task may be `ACTIVE`. Each task must leave the repository usable for
the next session.

## M0 - Repository Foundation

### CORE-001 - Package and test scaffold (`DONE`)

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

### CORE-002 - Directive scanner (`DONE`)

Recognize C/C++-style directives whose `#` is the first non-whitespace
character on a line, without matching text inside strings, template strings,
or comments. Return UTF-16 source ranges and structural diagnostics.

### CORE-003 - Expression parser (`DONE`)

Implement identifiers, `defined(NAME)`, `!`, `&&`, `||`, and parentheses with
precedence and unknown-macro diagnostics.

### CORE-004 - Conditional evaluator (`DONE`)

Evaluate nested `#if/#elif/#else/#endif` groups and active `#error` directives.

### CORE-005 - Equal-length projection (`DONE`)

Mask inactive code with spaces while preserving CR, LF, total UTF-16 length,
and offsets. Add golden tests for CRLF, Chinese text, and surrogate pairs.

### CORE-006 - Core robustness suite (`DONE`)

Cover malformed nesting, expression errors, false directives, and projection
invariants with golden and property-oriented tests.

Acceptance criteria:

- Malformed nesting produces stable, source-ordered diagnostics and never
  exposes inactive text after recovery.
- Empty, incomplete, and multiply malformed expressions return bounded UTF-16
  diagnostics without throwing; later directives are still analyzed.
- Directive lookalikes across comments, strings, templates, template
  expressions, and regular expressions have golden coverage.
- For a deterministic corpus containing mixed line endings, non-ASCII text,
  surrogate pairs, and malformed directives, projection preserves total UTF-16
  length and every CR/LF offset, masks every reported range, and is idempotent.
- `npm run build`, `npm run typecheck`, and `npm test` pass.

## M2 - CLI

### CLI-001 - Profile loading and precedence (`DONE`)

Load JSON profiles and implement explicit CLI profile and
`HOK_TS_PROFILE` precedence. Junction inference is development-only.

Acceptance criteria:

- UTF-8 JSON profile files load into an immutable macro definition map and
  reject unreadable files, malformed JSON, invalid macro names, and non-boolean
  values with stable error codes.
- Selection precedence is explicit CLI profile, `HOK_TS_PROFILE`, VSCode local
  profile, then development-only Junction inference.
- Junction inference is never invoked unless explicitly enabled and all higher
  priority sources are absent.
- Missing and blank explicit selections fail clearly; a blank environment
  variable behaves as unset.
- Profile loading and selection remain independent of command parsing and have
  focused tests.

### CLI-002 - Emit command (`ACTIVE`)

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
