# TSIfDef: Conditional Compilation for TypeScript

Product name: **TSIfDef**.

## 1. Background and goals

A TypeScript codebase often targets multiple incompatible platforms, runtimes,
regions, or product variants from the same source tree. Those targets may have
different `.d.ts` files, protocols, SDKs, data definitions, or business APIs.
Some logic must participate in parsing and type checking only for a particular
target, while every target must remain healthy even when a developer has only
one target environment available locally.

TSIfDef provides true source-level conditional compilation. Inactive branches
must disappear before TypeScript builds an AST or performs type checking.
VSCode must also gray and fold inactive code while retaining the native
TypeScript Language Service for completion, navigation, refactoring, and other
editor features.

## 2. Architecture

The product combines three layers:

1. A C/C++-style `#if` preprocessor provides build correctness. It masks
   inactive code with equal-length whitespace before `tsc` builds an AST.
   Builds use projected compilation: TSIfDef intercepts TypeScript
   CompilerHost file reads, supplies masked text under the original file name,
   and drives `program.emit()` without writing a shadow source tree.
2. A TypeScript Server Plugin intercepts `ScriptSnapshot` instances so the
   editor language service ignores inactive code.
3. A VSCode extension provides Profile display, inactive-code decorations and
   folding, diagnostics, and local commands.

All adapters must share the same macro scanner, evaluator, ranges, and masking
implementation. VSCode, tsserver, local builds, CI, and ESLint must not
reimplement macro semantics.

## 3. Macro syntax

Directives use C/C++-style, line-oriented syntax. `#` must be the first
non-whitespace character on its line.

```ts
#if BROWSER
const storage = new BrowserStorage();
#elif NODE
const storage = new FileStorage();
#else
#error Unknown target
#endif
```

Raw source containing directives does not need to be valid TypeScript. Every
view supplied to `tsc`, ESLint, or a language service must mask directive lines
with equal-length whitespace. Directive-like text inside strings, template
strings, line comments, or block comments is not a directive.

The first release supports:

```text
#if
#elif
#else
#endif
#error
defined(NAME)
!
&&
||
()
```

Source-level `#define`, text-replacement macros, and function macros are not
supported. Identifiers absent from the active Profile evaluate to `false`;
`#if UNKNOWN_MACRO` is valid and does not produce an unknown-macro diagnostic.

Macro definitions are external, global, immutable inputs to a check,
projection, build, or language-service session. A selected Profile applies to
every file in the project. Imports and module-loading order do not propagate,
add, or override macros. A source-level `#define` is always an error and cannot
affect any file. Directive nesting and pairing are confined to one physical
file.

Directives should surround complete imports, exports, declarations,
statements, class members, or object properties. They should not split an
expression or parameter list into syntax fragments.

## 4. Profile and project configuration

```json
// package.json
{
  "tsifdef": "./Profiles/browser.json",
  "scripts": {
    "compile": "tsifdef build"
  }
}
```

```json
// Profiles/browser.json
["BROWSER", "EXPERIMENTAL"]
```

A Profile contains only a JSON array of enabled macro names. Every unlisted
macro is `false`. It must not duplicate `source`, `tsconfig`, `outDir`,
`include`, `exclude`, or any build-file manifest. Existing package scripts,
tsconfig files, and build scripts remain the sole build graph; TSIfDef must
transparently process every TypeScript file that graph includes.

The `package.json` `tsifdef` field is the single active Profile pointer for the
build, VSCode, tsserver, and ESLint. External tools may switch environments by
changing that field. TSIfDef does not infer a Profile from CLI flags,
environment variables, private VSCode settings, junctions, or directory names.

## 5. Equal-length masking

Preprocessing does not delete inactive code. It replaces every non-newline
character in inactive ranges and directive lines with a space:

```text
original source
  -> calculate inactive ranges
  -> preserve CR/LF characters and total text length
  -> replace inactive characters and directive-line characters with spaces
```

This guarantees that:

- TypeScript diagnostic line and column positions do not move.
- Definition, rename, and quick-fix offsets map directly to the original file.
- Source maps receive no extra line-number shift from preprocessing.
- VSCode, tsserver, CLI, and ESLint can share identical ranges.

All public offsets and lengths use JavaScript/TypeScript UTF-16 code units.

## 6. VSCode extension

The extension must:

- Monitor `package.json` and the active Profile file.
- Show the Profile file name in the status bar and its full path in the tooltip.
- Gray inactive ranges with `TextEditorDecorationType`.
- Fold inactive ranges with `FoldingRangeProvider`.
- Report malformed or unmatched directives; unconfigured macros remain valid
  and evaluate to `false`.
- Send the resolved active Profile path to the TypeScript Server Plugin.

Decoration and folding are presentation only. They cannot make TypeScript
ignore inactive code, so the tsserver plugin is required for semantic parity.

## 7. TypeScript Server Plugin

The plugin reuses the native TypeScript Language Service and changes only the
source text visible to it. Its central integration point wraps
`LanguageServiceHost.getScriptSnapshot()`:

```ts
const original = host.getScriptSnapshot.bind(host);

host.getScriptSnapshot = fileName => {
    const snapshot = original(fileName);
    if (!snapshot || !isMacroFile(fileName)) {
        return snapshot;
    }

    const source = snapshot.getText(0, snapshot.getLength());
    const projected = maskInactiveCode(source, activeProfile());
    return ts.ScriptSnapshot.fromString(projected);
};
```

`getScriptSnapshot(fileName)` returns a complete snapshot;
`snapshot.getText(start, end)` reads a range from it. The plugin must read,
scan, validate, and project the complete current snapshot before returning a
same-length replacement. It must never evaluate a request fragment in
isolation. Unsaved editor text comes from the current snapshot and must never
be replaced with an older disk copy.

The Profile version participates in `getScriptVersion()` so tsserver cannot
reuse an AST from another Profile. A Profile change marks affected projects
dirty; VSCode may restart the TS server if cache refresh proves unreliable.

Inactive code then:

- does not enter the TypeScript AST;
- does not participate in inference, completion, references, or rename;
- produces no semantic diagnostics; and
- cannot create duplicate declarations or type pollution.

This is a compatibility integration with the tsserver host. The supported
workspace TypeScript version is pinned to `5.5.4`; the complete integration
suite must pass before upgrading it.

## 8. Build pipeline

Macro processing must happen before TypeScript builds an AST, emits output, or
is parsed by ESLint. `tsifdef build` uses projected compilation: it intercepts
CompilerHost reads, supplies equal-length masked text under each original file
name, and drives `program.emit()` itself.

```text
original TypeScript (containing #if)
  -> tsifdef build (wrap CompilerHost.getSourceFile/readFile)
       read original text -> equal-length mask -> SourceFile with original name
       -> ts.createProgram / createIncrementalProgram
       -> getPreEmitDiagnostics (respect noEmitOnError)
       -> program.emit() into the project's configured outDir
  -> downstream packaging/transpilation/source-map tools, if any
```

Because the compiler always sees original file names, `.js.map` `sources`,
`.d.ts` output, and diagnostic paths point naturally to the original source.
No post-processing, absolute paths, or ignored shadow source tree is required.

```bash
tsifdef build
tsifdef build -p ./custom.tsconfig.json
tsifdef build --watch
tsifdef build -p ./tsconfig.json -- --module commonjs --outDir dist
```

Arguments after `--` are parsed with `ts.parseCommandLine` and merged over the
tsconfig options. With no project argument, TSIfDef reads the current
directory's `package.json` Profile pointer and `tsconfig.json`. `-p` or
`--project` selects another tsconfig. `ts.parseJsonConfigFileContent` remains
the authority for TypeScript compiler options.

| Category | Options | Required behavior |
| --- | --- | --- |
| Explicit handling | `incremental`, `tsBuildInfoFile`, `composite` | A Profile change invalidates old `.tsbuildinfo` and forces a full build. |
| Explicit handling | `noEmitOnError` | Check diagnostics before emit; errors skip emit and return exit code 1. |
| Explicit handling | `noEmit` | Type-check only; never call emit. |
| Explicit handling | `watch` | Dispatch through TypeScript watch APIs as described in §8.2. |
| Special care | `inlineSources` | Embed original disk text, never the masked projection. |
| Test-locked | `sourceMap`, `inlineSourceMap`, `declaration`, `declarationMap` | Preserve TypeScript's native behavior and original-source paths. |
| Pass-through | `target`, `module`, `moduleResolution`, `lib`, `paths`, `strict`, and other compiler options | Pass unchanged to the Program. |
| Unsupported | `outFile`, `tsc -b` multi-project composite references | Fail with a clear unsupported-operation diagnostic. |

Disk decoding must match TypeScript 5.5.4 `ts.sys.readFile`: recognize
UTF-16BE, UTF-16LE, and UTF-8 BOMs, and otherwise decode as non-fatal UTF-8.
TSIfDef neither guesses legacy encodings such as GBK nor modifies source bytes.

ESLint must parse the same equal-length target view. Macro-structure validation
always runs against the original source.

### 8.1 Incremental builds and Profile invalidation

Incremental and composite builds use file versions in `.tsbuildinfo`, but those
versions describe disk source and cannot represent a projection changed only
by the active Profile. Reusing a previous Profile's build can silently emit
incorrect JavaScript.

Therefore, any Profile change forces a full rebuild. TSIfDef stores the prior
Profile content hash in `tsifdef.profilehash` beside build output. A missing or
mismatched hash causes it to ignore old `.tsbuildinfo`, build in full, and write
the new hash. A matching hash allows normal TypeScript incremental behavior.
Profile switching is rare, and correctness takes priority over incremental
speed.

### 8.2 Watch mode

`tsifdef build --watch` uses `ts.createWatchCompilerHost` with the same wrapped
reads and `projectSource` implementation as one-shot builds. Source changes are
re-read through masking and compiled incrementally.

Because a Profile is not a TypeScript source file, TSIfDef watches it
separately. A Profile change disposes the current WatchProgram and constructs a
new one for a full refresh. No watch code path may expose unmasked source to the
compiler.

### 8.3 Implementation constraints

- Reuse `ts.parseJsonConfigFileContent`; do not reimplement tsc option parsing.
- Wrap `host.readFile` and `host.getSourceFile`, then create SourceFiles with
  original file names. Pass `.d.ts` and `node_modules` content through unchanged.
- Abort without emit when macro-structure diagnostics exist.
- Run `getPreEmitDiagnostics` before emit and respect `noEmitOnError`.
- Use `createIncrementalProgram` and Profile-hash invalidation for incremental
  builds.
- Use `createWatchCompilerHost` plus a separate Profile watcher for watch mode.
- Restore original disk content when producing `inlineSources`.
- Reject unsupported `outFile` and multi-project `tsc -b` configurations.
- Preserve UTF-16 coordinates, line endings, and total projected length at
  every stage.
- Keep projections in memory. `--emit-projection <dir>` may write an optional
  audit dump, but that dump is never a compiler input or source-controlled file.

## 9. CI

CI must not depend on a VSCode Extension Host or a developer's extension
installation. Every target Profile must run at least once:

```text
for each Profile P:
  set package.json tsifdef -> P
  run npm run compile (tsifdef build)
  publish the emitted artifacts
```

This keeps targets healthy even when developers normally view only one target.

## 10. Product and release form

The repository contains five modules:

```text
core/      macro scanning, evaluation, ranges, and equal-length masking
vscode/    decorations, folding, Profile UI, and status bar
tsserver/  ScriptSnapshot projection
eslint/    processor exposing only the active target view to ESLint
cli/       configuration, projected compilation, watch mode, and CI entry point
```

One release produces version-matched deliverables from the same `core`, Git
revision, and product version:

```text
tsifdef-1.0.0.vsix
tsifdef-1.0.0.tgz
```

Developers install the VSIX; CI or consumers install the npm/tgz CLI package.
Both deliverables must be self-contained for their target runtime.

## 11. Required tests

### 11.1 Core and projection

- Nested `if/elif/else` and expression precedence.
- Unmatched directives, absent macros defaulting to `false`, and `#error`.
- Directive-like text in strings, templates, and comments.
- CRLF, Chinese fixture text, and UTF-16 surrogate-pair offsets.
- Projected length, line endings, and line/column coordinates remain unchanged.
- VSCode, tsserver, CLI, and ESLint produce byte-identical projections.

### 11.2 Editor and language service

- Unsaved VSCode document snapshots.
- Profile switching and tsserver cache invalidation.
- Completion, definition, references, rename, and quick fixes.

### 11.3 One-shot projected compilation

- Emitted JavaScript is semantically equivalent to stock tsc run against a
  manually selected active branch.
- Source-map paths are relative, portable, and resolve to original files at
  multiple directory depths; mappings preserve line and column positions.
- `inlineSources` embeds original disk source.
- `declaration` and `declarationMap` omit inactive declarations and point to
  original source.
- TypeScript diagnostics identify original source paths.
- `noEmitOnError`, `noEmit`, and macro-structure failures have correct output
  and exit behavior.
- Unsupported options fail clearly.
- Each Profile can compile independently against its corresponding `.d.ts` set.

### 11.4 Incremental builds

- Repeated builds with one Profile use `.tsbuildinfo` incrementally.
- Active source changes update only relevant artifacts.
- Switching only the Profile never reuses the prior Profile's output.
- A missing `tsifdef.profilehash` forces a full build.

### 11.5 Watch mode

- Active-branch changes rebuild and update artifacts.
- Inactive-branch-only changes leave the projection and artifacts unchanged.
- Malformed directives report diagnostics without crashing and recover after a
  valid edit.
- Profile changes rebuild the WatchProgram in full.
- Source-file additions and deletions are detected.
- Rapid edits neither lose events nor cause runaway rebuilds.

### 11.6 Integration

- Run the full integration suite against TypeScript `5.5.4`; rerun it before
  every TypeScript upgrade.

## 12. Final principle

Preprocessing owns build correctness. The TypeScript Server Plugin owns editor
semantic consistency. The VSCode extension owns interaction and presentation.
The CLI owns local and CI builds. All of them share one macro core; no adapter
may interpret macro semantics independently.

## 13. Why projected compilation is used

Conditional compilation must remove inactive code before `tsc` builds an AST.
Two implementation strategies were evaluated.

**On-disk projection (rejected):** write masked source below
`Output/project/<rel>`, generate a tsconfig, and run stock `tsc -p` on the
shadow tree. This makes source-map `sources` and diagnostic paths refer to the
shadow tree, and requires git, VSCode, and ESLint ignore rules. An absolute
`sourceRoot` harms portability, while one relative `sourceRoot` cannot correct
maps emitted at different directory depths.

**Projected compilation (selected):** intercept CompilerHost reads, provide
masked text under original file names, and drive `program.emit()`. The compiler
then generates relative source-map paths and diagnostics for original files
natively, without a shadow tree or path rewriting.

| Strategy | `.map` sources | Diagnostic path | Portable | Shadow-tree ignores | Complexity |
| --- | --- | --- | --- | --- | --- |
| On-disk, default options | Shadow tree ✗ | Shadow path ✗ | — | Required | Low |
| On-disk, relative `sourceRoot` | Incorrect at varying map depths ✗ | Shadow path ✗ | — | Required | Low |
| On-disk, absolute `sourceRoot` | Original source with embedded absolute path | Shadow path ✗ | ✗ | Required | Low |
| **Projected compilation** | **Relative original source ✓** | **Original path ✓** | ✓ | **None** | High |

Controlled tests confirmed that, when SourceFiles retain original names,
TypeScript calculates the correct relative `sources` path for each emitted map
regardless of directory depth. The additional implementation complexity is
accepted to preserve correctness, portability, and native diagnostics.

Profile invalidation likewise favors correctness: any Profile change triggers
a full rebuild instead of attempting fine-grained invalidation that could
silently reuse output from another conditional-compilation target.
