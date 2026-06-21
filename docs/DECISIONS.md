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
