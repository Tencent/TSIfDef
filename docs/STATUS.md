# Development Status

Last updated: 2026-06-22

## Current Task

`REL-001 - Version-matched VSIX and tgz artifacts`

Produce self-contained, version-matched VSIX and npm/tgz artifacts from the same
core and revision. HOK owns CI and downstream pipeline integration; this
repository does not add or configure HOK CI jobs.

## Completed This Session

- Replaced the fixed multi-Profile map and all CLI/Profile selection precedence
  with one package field: `"tsifdef": "./Profiles/HOK.json"`. The referenced
  Profile JSON contains only its enabled macro-name array.
- Reduced the CLI to one operation. `tsifdef` defaults to the current
  `package.json`, its Profile pointer, `tsconfig.json`, and
  `.tsifdef/Output`; `--project <path>` is the only override.
- Removed the emit/check/watch/tsc command surface, compiler wrapper, optional
  cache/watch implementation, VSCode local build commands, and their tests.
- Added Program-derived precompile output with equal-length projected sources,
  a generated stock-tsc config, and an auditable manifest. Generated config
  clears inherited include and remaps internal baseUrl, paths, rootDir,
  rootDirs, and typeRoots into the projected tree.
- Adopted D030: disk decoding exactly matches TypeScript 5.5.4
  `ts.sys.readFile`, including BOM handling and non-fatal UTF-8 replacement.
  TSIfDef does not modify or reject the four GBK-compatible HOK source files.
- Made package.json the only VSCode Profile state. The extension watches package
  and Profile JSON changes, displays the selected file name/full path, refreshes
  decorations/folding/diagnostics, and sends the resolved path to tsserver.
  The plugin versions and invalidates projected snapshots after a change.
- Updated the demo to the final minimal contract:
  `precompile: tsifdef` followed by stock
  `tsc -p .tsifdef/Output/tsconfig.json`. No VSCode Profile setting exists.
- Made the demo a real local package consumer through
  `devDependencies.tsifdef: file:../..`; `npm install` creates the `tsifdef`
  executable link, so no script reaches into the repository's `dist` path.
- Recorded D029-D031 and updated INT-002 acceptance criteria. HOK-specific
  integration and region inference are explicitly outside TSIfDef ownership.
- Completed `INT-002`.

## Verification

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed; 70 tests.
- Demo `npm run compile`: passed; npm automatically ran no-argument precompile,
  emitted 5 Program files to `.tsifdef/Output`, then stock tsc passed.
- Program/precompile integration covers tsconfig roots, transitive imports,
  path aliases, fixed output, manifest hashes, BOMs, malformed UTF-8 parity,
  equal-length projection, and stock-tsc diagnostics.
- VSCode integration covers a package pointer changing from HOK.json to
  Domestic.json and verifies status, definitions, and tsserver configuration
  change together.
- Before D031, a non-invasive HOK pilot precompiled 596 files and stock tsc
  passed with the existing CommonJS/incremental flags. Its generated pilot
  directory was removed after the output convention changed.
- `git diff --check`: passed.

## Known Issues

- During the live pilot on 2026-06-22, one command was run from the TsScripts
  directory and accidentally invoked its existing `npm run build`. The HOK
  build succeeded and updated normal `.localbuild`, declaration, DLL,
  package-lock, and RawAssets outputs. `E:\HOK_Trunk` is an SVN working copy;
  their prior dirty state is unknown, so none were reverted. TSIfDef pilot
  directories created there were removed.
- Four HOK files are GBK-compatible rather than valid UTF-8. Under D030 they
  intentionally produce exactly the replacement-character behavior of stock
  TypeScript 5.5.4; their original SVN bytes remain untouched.
- Raw macro source is intentionally invalid TypeScript. Parser/ESLint consumers
  must use `.tsifdef/Output`; VSCode language semantics use the tsserver
  equal-length in-memory snapshot projection for unsaved documents.
- The generated project currently remaps the path-valued compiler options seen
  in the pilot. Project references and uncommon path-bearing compiler options
  need explicit integration coverage before claiming support for them.

## Handoff

Start by reading the files listed in `AGENTS.md` and inspecting the worktree.
Continue only `REL-001`: define artifact acceptance criteria before
implementation, then package a self-contained VSIX and npm/tgz with matching
version and revision metadata. Do not add CI configuration and do not modify or
integrate the external HOK/SVN workspace.
