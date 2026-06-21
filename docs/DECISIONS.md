# Architecture Decisions

This is an append-only decision log. Amend an entry only to correct a factual
error; supersede changed decisions with a new entry.

## D001 - One shared macro core

Date: 2026-06-21

VSCode, the TypeScript server plugin, and the CLI consume the same core scanner,
expression evaluator, diagnostics, ranges, and projection implementation. They
must not duplicate macro rules.

Reason: Editor display, language-service semantics, local builds, and CI must
observe byte-for-byte equivalent projected source.

## D002 - UTF-16 is the public offset coordinate system

Date: 2026-06-21

Core offsets are JavaScript string offsets (UTF-16 code units). Projection keeps
CR/LF and total string length unchanged and replaces masked non-newline code
units with ASCII spaces.

Reason: TypeScript and VSCode positions can then map directly to the original
document, including Chinese text and surrogate pairs.

## D003 - Pinned TypeScript integration target

Date: 2026-06-21

The package and TypeScript server integration target TypeScript 5.5.4. An
upgrade requires rerunning the language-service integration suite.

Reason: Snapshot host wrapping is a compatibility-sensitive integration.

## D004 - Initial external test project

Date: 2026-06-21

Use `E:\HOK_Trunk\Program\TsScripts` for pilot integration. Tests must not write
generated content into its tracked source directories.

Reason: This is the TypeScript project found in the supplied HOK workspace; the
originally stated `Programe\TsProject` path does not exist.

## D005 - CommonJS package output

Date: 2026-06-21

Compile package modules as CommonJS while using Node16 module resolution. Tests
are compiled before execution instead of relying on Node's native TypeScript
support.

Reason: VSCode extensions and tsserver plugins must load reliably across the
supported Node hosts, including hosts older than the development machine's
Node 24 runtime.

## D006 - C/C++-style directive lines

Date: 2026-06-21

Directives use dedicated lines such as `#if HOK`, with `#` as the first
non-whitespace character. They are not wrapped in TypeScript comments. Text that
looks like a directive inside a string, template string, line comment, or block
comment is not a directive.

Every projected view masks all directive-line characters as spaces while
preserving line endings and UTF-16 length, regardless of whether the surrounding
branch is active.

Reason: The requested source syntax should match C/C++ preprocessing syntax.
Raw macro source is therefore not passed directly to TypeScript or ESLint.

## D007 - Macro expression diagnostics and defined semantics

Date: 2026-06-21

Bare identifiers must exist in the active Profile or produce an
`unknown-macro` diagnostic. Expression evaluation visits both operands of
`&&` and `||` so diagnostics do not depend on boolean short-circuiting.

`defined(NAME)` returns whether the Profile owns the key and does not report an
unknown macro when the key is absent.

Reason: `defined` must support intentional feature-presence checks, while bare
macro typos must remain visible and deterministic in editor and CI diagnostics.

## D008 - Validate every expression, report only active errors

Date: 2026-06-21

Every `#if` and `#elif` expression is parsed and checked even when its parent
branch is inactive. `#error` produces a diagnostic only when its branch is
active. Unknown and malformed directive lines are included in directive ranges
so projection can hide them from TypeScript while retaining diagnostics.

Reason: Inactive regional code must not silently decay, while `#error` remains
an intentional assertion about the selected Profile only.

## D009 - Projection consumes conditional analysis ranges

Date: 2026-06-21

`projectSource` is the shared projection entry point. It combines the directive
and inactive ranges returned by `analyzeConditionals`, normalizes overlaps, and
replaces every non-CR/LF UTF-16 code unit with an ASCII space. It does not scan
or evaluate macro rules independently.

Reason: VSCode, tsserver, CLI, and CI need one projection implementation and
must preserve exact source offsets, including surrogate pairs.

## D010 - Profile selection is separate from profile loading

Date: 2026-06-21

Profile selection returns a name and its source using fixed precedence: CLI,
`HOK_TS_PROFILE`, VSCode local configuration, then Junction inference. Junction
inference requires an explicit development-mode opt-in. Loading separately
reads and validates an immutable boolean macro map from UTF-8 JSON.

Reason: emit, check, watch, VSCode, and CI must share precedence and validation
without coupling those rules to a particular command-line parser. Formal builds
must never infer their target environment from a developer workstation.

## D011 - Emit prepares a complete profile directory before replacement

Date: 2026-06-21

Emit discovers and analyzes every TypeScript-family source file before writing.
Any macro diagnostic aborts without changing existing output. A successful run
writes a temporary sibling directory and then replaces
`Build/.macrobuild/<PROFILE>` as a whole.

Reason: `tsc` and ESLint must never observe a partially projected tree, stale
files from prior runs, or output from a source set containing macro errors.

## D012 - Check is read-only with stable process outcomes

Date: 2026-06-21

Check analyzes source directly for one selected profile or every JSON profile
under `Build/macros`. It never emits projected files. CLI exit codes are `0`
for success, `1` for macro diagnostics, and `2` for usage, profile, or I/O
failure. Diagnostics use one-based line and column positions.

Reason: CI must distinguish source failures from tool/configuration failures,
and check must be safe to run without changing a developer's generated tree.

## D013 - Incremental cache is an optimization, not an output mode

Date: 2026-06-21

Per-profile cache manifests store successful projected text under
`Build/.macrobuild/.cache`. Keys hash source content, sorted profile
definitions, the core API version, and macro-config version. Cache hits still
participate in a complete staged output-directory replacement. Watch reloads
the profile each time and serializes/coalesces rebuilds.

Reason: cache corruption or invalidation must never change macro semantics, and
watch must preserve the same no-partial-tree guarantee as a one-shot emit.

## D014 - Macro definitions are external, global, and immutable

Date: 2026-06-21

One selected Profile supplies the same read-only macro map to every source file
in a check, emit, watch rebuild, or language-service view. Source files cannot
define or mutate macros. Imports, dependency order, and module evaluation do
not affect macro values. Conditional nesting must open and close within one
physical file.

Reason: regional build selection is project configuration, not C/C++-style
translation-unit state, and must remain deterministic regardless of imports.

## D015 - Tsserver projection always analyzes a whole snapshot

Date: 2026-06-21

The plugin obtains the complete current file text from
`getScriptSnapshot(fileName)` using `getText(0, getLength())`, analyzes every
directive in that file, and returns a complete equal-length projected snapshot.
Later slice reads are served from that projection. Unsaved snapshots are never
replaced with disk content.

Reason: branch activity and directive pairing cannot be determined correctly
from an arbitrary requested slice, especially when its opening directive lies
outside that slice.

## D016 - Uncached projection is the correctness baseline

Date: 2026-06-21

Caching is optional and justified only by measured repeated-projection cost.
Packaged one-shot emit and check commands run uncached; packaged watch enables
the incremental cache.
Removing, disabling, corrupting, or missing a cache must cause full recompute,
and cached output must be byte-for-byte identical to uncached output. Cache
state never decides macro semantics or whether diagnostics exist.

Reason: invalidation adds failure modes. Correctness and debuggability take
priority over avoiding scans whose performance cost has not been demonstrated.

## D017 - Source encoding failures are explicit

Date: 2026-06-21

CLI source loading must not silently replace malformed UTF-8 byte sequences or
rewrite such files as normalized UTF-8. Unsupported source encoding is a
configuration/input failure with file context. Correctly encoded `U+FFFD` text
remains valid source. Supporting legacy encodings requires a future explicit
configuration and byte/offset design rather than automatic detection.

Reason: the TsScripts pilot found four legacy-encoded files whose bytes changed
during a no-directive emit. Silent decoding replacement can corrupt strings and
comments even when TypeScript still happens to compile the projected tree.

## D018 - VSCode shell depends on an injected host, not the `vscode` module

Date: 2026-06-21

The extension logic lives in a `vscode`-free `ProfileStateController` that
depends only on an `ExtensionHost` interface. `src/vscode/extension.ts` resolves
the real `vscode` module lazily at activation through `createRequire` and adapts
it to that interface. The package therefore builds and tests without
`@types/vscode` or a `vscode` dependency, and the controller runs under the
standard Node test runner.

The controller resolves the effective Profile through the shared core
`selectProfile` precedence and shares `Build/macros/*.json` discovery with
`check` via `discoverProfileNames`. It does not reimplement macro scanning,
evaluation, or projection.

Reason: SPEC section 9 requires CI to run without the VSCode extension host, and
D001 requires one shared macro and selection core. An injected host keeps editor
behavior testable and prevents the extension from forking macro semantics.
