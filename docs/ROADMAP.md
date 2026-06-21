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

### CLI-002 - Emit command (`DONE`)

Project source files into `Build/.macrobuild/<PROFILE>` without modifying the
source tree.

Acceptance criteria:

- `tsifdef emit --profile <PROFILE>` loads `Build/macros/<profile>.json` and
  projects TypeScript-family files into `Build/.macrobuild/<PROFILE>` while
  preserving relative paths and exact projected text.
- Source discovery is deterministic, supports an optional source root, and
  excludes generated output, `.git`, and `node_modules`.
- Any macro diagnostic aborts before output replacement and reports its source
  file; successful emission replaces the profile directory and removes stale
  files.
- Profile names cannot escape the output directory, source files are never
  modified, and interrupted preparation cannot expose partial output.
- Programmatic emission and command parsing have focused integration tests.

### CLI-003 - Check command (`DONE`)

Implement one-profile and `--all` structural/profile checking with stable exit
codes and diagnostics.

Acceptance criteria:

- `check --profile <PROFILE>` checks one loaded profile, while `check --all`
  deterministically discovers every `Build/macros/*.json`; the modes are
  mutually exclusive.
- Check reuses shared source discovery and conditional analysis, performs no
  writes, and reports profile, relative file, diagnostic code, and one-based
  line/column.
- Exit codes are stable: `0` success, `1` macro diagnostics, and `2` usage,
  profile, or I/O failure.
- Invalid profiles in `--all` fail as configuration errors rather than being
  skipped, and no discovered profiles is an error.
- Programmatic one/all-profile behavior and packaged CLI output are tested.

### CLI-004 - Watch and optional incremental cache (`DONE`)

Add watch mode and a cache key containing source content, profile definition,
preprocessor version, and macro-config version.

Acceptance criteria:

- Emit/watch cache keys include source content, deterministically serialized
  profile definitions, core preprocessor version, and macro-config version.
- Valid cache hits reuse projected text while every successful run still
  stages and replaces a complete output directory; deleted sources and stale
  cache entries disappear.
- Corrupt caches degrade to misses, and cache manifests are replaced only
  after a successful diagnostic-free emit.
- `watch --profile <PROFILE>` watches source and profile changes, reloads the
  profile for every rebuild, serializes rebuilds, and coalesces changes that
  arrive while a rebuild is running.
- Cache invalidation and watch scheduling tests use explicit hooks rather than
  timing-sensitive sleeps.
- Cache use is never required for correctness: uncached projection is the
  reference behavior, cache failures become misses, and cached/uncached output
  must be byte-for-byte identical.
- Packaged one-shot `emit` and `check` run uncached; watch is the only packaged
  command that enables the incremental cache.

### CLI-005 - TsScripts pilot integration (`DONE`)

Test against `E:\HOK_Trunk\Program\TsScripts`, then document the non-destructive
commands and observed build constraints.

### CLI-006 - Source encoding safety (`DONE`)

Reject source files that cannot be decoded as valid UTF-8 before analysis or
projection.

Acceptance criteria:

- Source loading validates UTF-8 bytes without silently replacing malformed
  sequences with `U+FFFD`.
- Check and emit failures identify the relative source file and use the CLI
  configuration/I/O failure exit code `2`.
- Emit detects all source read/encoding failures before replacing existing
  output.
- Valid UTF-8 files, including a real `U+FFFD` character encoded correctly,
  continue to work.
- Programmatic and packaged CLI tests cover invalid UTF-8 for check and emit.
- `npm run build`, `npm run typecheck`, and `npm test` pass.

## M3 - VSCode Extension

### VSC-001 - Extension shell and profile state (`DONE`)

Provide the VSCode extension shell: a status-bar Profile indicator, a command to
switch Profiles, and effective-Profile resolution that reuses the shared core
selection precedence. The macro core, scanner, evaluator, and projection are not
reimplemented.

Acceptance criteria:

- A `vscode`-free `ProfileStateController` resolves the effective Profile through
  the shared `selectProfile` precedence (environment over VSCode-local), renders
  status-bar text and a tooltip naming the selection source, and exposes a
  no-selection state without throwing.
- Switching Profiles offers the deterministically discovered
  `Build/macros/*.json` names through an injected host, persists the chosen name
  to VSCode-local configuration, and refreshes the status bar; a cancelled
  selection changes nothing.
- The controller depends only on an injected host interface, never on the real
  `vscode` module, so it runs under the standard Node test runner without the
  extension host.
- The extension entry registers the switch command and status-bar item, binds
  the real `vscode` API to the host interface at activation, and disposes every
  registered resource on deactivation.
- Profile-name discovery is shared with `check` rather than reimplemented.
- `npm run build`, `npm run typecheck`, and `npm test` pass.

### VSC-002 - Diagnostics and decorations (`TODO`)
### VSC-003 - Folding and local CLI commands (`TODO`)

## M4 - TypeScript Server Plugin

### TSS-001 - Whole-file snapshot projection (`TODO`)

Acceptance criteria:

- Read every current snapshot with `getText(0, getLength())`, analyze all
  per-file directive pairs, and return one complete equal-length projected
  `ScriptSnapshot`; never infer macro state from a requested text slice.
- Use the in-memory snapshot, including unsaved edits, rather than rereading
  the file from disk.
- Apply one externally selected, read-only Profile consistently to every file;
  imports and file order never mutate macro definitions.

### TSS-002 - Profile version and project invalidation (`TODO`)
### TSS-003 - TypeScript 5.5.4 language-service integration tests (`TODO`)

## M5 - Product Integration and Release

### INT-001 - HOK and Domestic profile/typecheck pipeline (`TODO`)
### INT-002 - Existing build-pipeline integration (`TODO`)
### INT-003 - CI jobs (`TODO`)
### REL-001 - Version-matched VSIX and tgz artifacts (`TODO`)
