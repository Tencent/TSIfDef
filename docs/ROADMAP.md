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
precedence. The original unknown-macro diagnostic behavior is superseded by
INT-002: absent identifiers evaluate to `false`.

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

Historical task: its strict rejection contract is superseded by D030. Current
source decoding intentionally matches stock TypeScript 5.5.4.

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

### VSC-002 - Diagnostics and decorations (`DONE`)

Publish macro structural diagnostics and gray out inactive ranges in the editor
by reusing the shared core analysis, building on the VSC-001 shell.

Acceptance criteria:

- A `vscode`-free document analyzer reuses `analyzeConditionals` to produce
  editor-ready diagnostics and inactive ranges; it never reimplements scanning,
  evaluation, or projection.
- UTF-16 core offsets map to zero-based line/character positions that preserve
  CR, LF, and CRLF line counts and keep surrogate pairs intact.
- A presentation controller publishes diagnostics through an injected diagnostic
  collection and applies an inactive-range decoration to every open macro
  document for the effective Profile.
- When no Profile is selected, diagnostics and decorations are cleared rather
  than computed from an arbitrary Profile.
- Switching the Profile or changing a document refreshes its diagnostics and
  decorations; closing a document clears them.
- The analyzer and controller run under the standard Node test runner with a
  fake host, without the VSCode extension host.
- `npm run build`, `npm run typecheck`, and `npm test` pass.

### VSC-003 - Folding and local CLI commands (`DONE`)

Fold inactive ranges and run the local CLI (emit, check, watch) from VSCode,
building on the VSC-001/002 shell.

Acceptance criteria:

- A `vscode`-free folding computation reuses the inactive ranges from
  `analyzeDocument` and yields only inclusive, zero-based, multi-line line
  ranges; single-line inactive regions produce no fold.
- A folding-range provider registered for macro documents serves those ranges
  for the effective Profile through the injected host.
- Emit, check, watch, and stop-watch commands drive the existing
  `emitProject`/`checkProject`/`watchProfile` entry points through an injected
  runner; the extension never reimplements emit, check, or watch logic.
- Commands require a selected Profile and an open workspace, reporting a clear
  message instead of throwing when either is absent.
- At most one watch session runs at a time; starting a new watch or stopping
  disposes the previous session, and disposal stops any active watch.
- Successful and diagnostic/error command outcomes are reported through the host
  rather than raised to the extension host.
- The folding computation and command controller run under the standard Node
  test runner with a fake host and a fake runner.
- `npm run build`, `npm run typecheck`, and `npm test` pass.


## M4 - TypeScript Server Plugin

### TSS-001 - Whole-file snapshot projection (`DONE`)

Acceptance criteria:

- Read every current snapshot with `getText(0, getLength())`, analyze all
  per-file directive pairs, and return one complete equal-length projected
  `ScriptSnapshot`; never infer macro state from a requested text slice.
- Use the in-memory snapshot, including unsaved edits, rather than rereading
  the file from disk.
- Apply one externally selected, read-only Profile consistently to every file;
  imports and file order never mutate macro definitions.
- Append the Profile version to `getScriptVersion()` so tsserver does not reuse
  an AST built for a different Profile; non-macro files pass through unchanged.
- The host wrapper is exercised by unit tests and a TypeScript 5.5.4
  language-service integration that confirms inactive-branch symbols are absent
  while active-branch symbols resolve.
- `npm run build`, `npm run typecheck`, and `npm test` pass.

### TSS-002 - Profile version and project invalidation (`DONE`)

Re-project and rebuild affected ASTs when the selected Profile changes, building
on the TSS-001 host wrapper.

Acceptance criteria:

- The host wrapper reads the current Profile through a live provider on each
  `getScriptSnapshot`/`getScriptVersion` call rather than capturing it once, so a
  later Profile change is reflected without recreating the language service.
- A controller re-resolves the Profile on demand and marks the project dirty only
  when the resolved Profile version actually changes, including transitions
  between no Profile and a selected Profile.
- When no Profile is selected the wrapper passes raw snapshots and versions
  through unchanged.
- A change to the Profile file or macros directory triggers a reload through the
  controller; the documented fallback when cache refresh is unstable is the
  `TypeScript: Restart TS Server` command.
- The controller runs under the standard Node test runner with injected resolve,
  mark-dirty, and log hooks, and a TypeScript 5.5.4 integration confirms that
  switching the Profile flips semantic diagnostics on the same language service.
- `npm run build`, `npm run typecheck`, and `npm test` pass.
### TSS-003 - TypeScript 5.5.4 language-service integration tests (`DONE`)

Cover completion, definition, references, rename, and quick fix over the wrapped
host, confirming offsets map to the original document and inactive code never
participates.

Acceptance criteria:

- Integration tests run against the pinned TypeScript 5.5.4 language service over
  the projection-wrapping host.
- Completion at an active-branch position excludes identifiers declared only in
  an inactive branch, and the queried offset is the original-document offset.
- Definition resolves to the active-branch declaration, and both the query and
  result positions are original-document offsets.
- Find-all-references and rename report and edit only active-branch occurrences,
  including across two files, never an inactive duplicate.
- A quick fix is offered for active-branch code, and its edit ranges are
  original-document offsets.
- The in-memory host helper is shared across the tsserver tests rather than
  duplicated.
- `npm run build`, `npm run typecheck`, and `npm test` pass.

## M5 - Product Integration and Release

### INT-001 - HOK and Domestic profile/typecheck pipeline (`DONE`)

Project and typecheck each Profile against its own declarations, reusing the CLI
emit and core rather than adding macro semantics.

Acceptance criteria:

- A pipeline orchestration emits each Profile through the existing `emitProject`
  and then typechecks that Profile's `tsconfig` against its own declarations; it
  adds no new macro scanning, evaluation, or projection.
- Per-Profile pipeline configuration (`tsconfig` path and required declaration
  directories) is loaded from a versioned `Build/macros/pipeline.json`.
- Each Profile resolves to one stable status: `passed`, `macro-diagnostics`
  (typecheck skipped), `type-errors`, or `skipped-missing-declarations`; a macro
  diagnostic prevents typecheck and preserves prior output behavior.
- A Profile whose required declaration directories are absent is reported as a
  skippable configuration status, not a hard failure, matching the TsScripts
  workspace that lacks Domestic declarations.
- The typecheck and directory-existence steps are injected so the orchestration
  is testable without a real `tsc`, with a TypeScript 5.5.4 fixture proving a
  clean tree passes and a type error is reported.
- The packaged `tsifdef pipeline` command prints a per-Profile summary and
  returns `0` for success including skips, `1` for macro or type diagnostics, and
  `2` for configuration or I/O failure.
- `npm run build`, `npm run typecheck`, and `npm test` pass.
### INT-002 - Existing build-pipeline integration (`DONE`)

Acceptance criteria:

- `package.json` owns the only active Profile pointer through a string
  `tsifdef` field. The referenced JSON file contains only enabled macro names;
  VSCode displays its file name and full resolved path.
- Any macro absent from the selected Profile evaluates to `false` in core,
  VSCode, tsserver, CLI, build, and debug flows without an unknown-macro
  diagnostic. `defined(NAME)` still tests explicit membership.
- `npm run compile` uses `precompile: tsifdef` before the unwrapped, stock
  `tsc`. With no arguments TSIfDef uses the current package and `tsconfig.json`;
  `--project` overrides only that tsconfig. The existing build configuration is
  still the
  source of truth; TSIfDef parses the same tsconfig through the TypeScript
  Compiler API instead of independently scanning a source glob.
- Precompile atomically writes a persistent, equal-length projected project
  under `.tsifdef/Output`, including a generated tsconfig and a
  manifest recording the selected Profile, tool version, source project, exact
  participating file set, and source/projected hashes. CI can upload this whole
  directory for diagnosis.
- Stock `tsc` always compiles `.tsifdef/Output/tsconfig.json`. The existing
  `init.mjs -> compile.mjs -> build.mjs` flow changes only enough to select that
  generated tsconfig; original tsc output options, Babel, PFBS/V8CC, source-map,
  and distribution stages remain unchanged.
- Legacy `Build/macros/*.json` and `Build/macros/pipeline.json` configuration is
  migrated away; build/typecheck orchestration receives build inputs from the
  caller rather than macro configuration.
- `npm run build`, `npm run typecheck`, and `npm test` pass, with an integration
  proving that tsconfig roots and transitive imports in the emitted manifest and
  generated project match the TypeScript Program without a TSIfDef source list.
### INT-003 - CI jobs (`ACTIVE`)
### REL-001 - Version-matched VSIX and tgz artifacts (`TODO`)
