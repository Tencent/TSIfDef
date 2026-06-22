# Effective Architecture Decisions

This document is the developer-facing view of constraints that still apply.
The append-only decision record, including superseded prototypes and full
rationale, is archived in
[`History/DECISIONS_001-031.md`](History/DECISIONS_001-031.md).

## Shared Core and Coordinates

- `core` is the only implementation of directive scanning, expression
  evaluation, diagnostics, inactive ranges, and projection. CLI, VSCode, and
  tsserver are adapters over it. (D001)
- Public offsets and projected text use JavaScript/TypeScript UTF-16 code-unit
  coordinates. Projection preserves source length and line endings. (D002,
  D009)
- Directive syntax is C/C++-style, line-oriented, and ignored inside strings,
  templates, and comments. Every expression is validated; `#error` reports
  only in an active branch. (D006, D008)
- Macro definitions are external, global, immutable for one operation, and do
  not propagate through imports. (D014)

## TypeScript Integration

- TypeScript `5.5.4` is the pinned compatibility target. Upgrade only with the
  language-service integration suite. (D003)
- The tsserver plugin wraps complete current `ScriptSnapshot` instances and
  returns equal-length projections. It never substitutes disk content for an
  unsaved snapshot. (D015, D021)
- Profile changes participate in script versions and invalidate affected
  projects. VSCode sends the resolved package-selected Profile path to the
  plugin. (D022, D024, D025, D031)
- Disk decoding matches TypeScript 5.5.4 `ts.sys.readFile`, including BOM
  handling and non-fatal UTF-8 replacement. Original bytes are never modified.
  (D030)

## Configuration and Build

- `package.json` has the only active Profile pointer:
  `"tsifdef": "./Profiles/HOK.json"`. The Profile JSON is an array of enabled
  macro names; absent macros evaluate to `false`. No component infers or stores
  another active Profile. (D027, D029, D031)
- `tsifdef` performs one precompile operation. `--project <path>` is its only
  override. It derives participating files from the TypeScript Program rather
  than a separate source list. (D029, D031)
- Precompile atomically replaces `.tsifdef/Output` with equal-length projected
  sources, a generated stock-tsc config, and an auditable manifest. Stock `tsc`
  consumes `.tsifdef/Output/tsconfig.json`. (D029, D031)
- VSCode presentation reuses core analysis and exists independently from
  language-service projection. Decorations alone never define TypeScript
  semantics. (D019, D021)

## Packaging

- Runtime package output is CommonJS and must work on Node.js 18. (D005)
- VSIX and npm/tgz are separate, self-contained deliverables produced from the
  same core, package version, and Git revision. This requirement is specified
  in `SPEC.md`; implementation is tracked by `REL-001`.

## History Policy

Add a decision here only when it constrains future implementation. When a new
decision supersedes an old one, keep only the effective rule here and append
the full dated record to the historical decision log.
