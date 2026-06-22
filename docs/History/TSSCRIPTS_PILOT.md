# TsScripts Pilot Integration

Date: 2026-06-21

## Scope

The pilot inspected `E:\HOK_Trunk\Program\TsScripts` without modifying its
tracked source or build configuration. All pilot profiles, projected source,
and temporary tsconfig files were created below
`Program\TsScripts\Build\.macrobuild\pilot-project` and removed after the
experiment.

The discovered project constraints are:

- Source root: `SystemScripts\src`.
- Source set: 582 `.ts`, `.tsx`, `.mts`, and `.cts` files.
- Build config: `SystemScripts\tsconfig.build.json` extends the generated
  `SystemScripts\tsconfig.json`.
- The current workspace is configured for HOK declarations under
  `DevelopmentReference\HOK`; required Domestic declaration packages are not
  present.
- Region selection changes `exclude`, `typeRoots`, `types`, and `rootDirs`, so
  compiling a projected tree requires a matching generated tsconfig rather
  than only changing the source directory.
- The existing source set contains no C/C++-style TSIfDef directives.

## Commands

After `npm run build` in `E:\TsIfDef`, the pilot used an isolated project root:

```powershell
$pilot = "E:\HOK_Trunk\Program\TsScripts\Build\.macrobuild\pilot-project"
$source = "E:\HOK_Trunk\Program\TsScripts\SystemScripts\src"

node E:\TsIfDef\dist\cli\main.js check --all --root $pilot --source $source
node E:\TsIfDef\dist\cli\main.js emit --profile HOK --root $pilot --source $source
node E:\TsIfDef\dist\cli\main.js emit --profile DOMESTIC --root $pilot --source $source
```

The isolated root contained temporary `Build\macros\hok.json` and
`domestic.json` files. Therefore the generated trees remained under the
allowed pilot directory:

```text
Build\.macrobuild\pilot-project\Build\.macrobuild\HOK
Build\.macrobuild\pilot-project\Build\.macrobuild\DOMESTIC
```

The original HOK baseline was checked with:

```powershell
npx tsc -p SystemScripts/tsconfig.build.json --noEmit --incremental false
```

A temporary tsconfig with the same HOK `typeRoots`, `types`, `rootDirs`,
`strictNullChecks=false`, and `strictPropertyInitialization=false` was then
used to type-check the projected HOK tree.

## Results

- Original HOK typecheck: passed.
- `check --all`: passed for both profiles with no macro diagnostics.
- HOK emit: 582 files.
- Domestic emit: 582 files.
- Projected HOK typecheck against the real HOK declarations: passed.
- Projected Domestic typecheck: blocked because this workspace lacks
  `csharp`, `msdkpixwebview`, `sgame`, `tdr`, and `tga-puer` under the Domestic
  declaration root.
- 578 of 582 no-directive files were byte-for-byte identical after emit.
- Four files contain invalid UTF-8 byte sequences. Node's UTF-8 decoder
  replaced those sequences with `U+FFFD`, so the emitted bytes differed even
  though there were no macros:

```text
HOK/GameScripts/GameSystem/Championship/CChampionshipSelectTicketLogic.mts
HOK/GameScripts/GameSystem/Championship/CChampionshipSelectTicketView.mts
HOK/GameScripts/GameSystem/Championship/CChampionshipTicketItemView.mts
HOK/Kernel/shortcuts_all.ts
```

The four files produced 1050 replacement characters in total. This is a
blocking safety issue for one-shot emit: TSIfDef must reject unsupported source
encodings with file context instead of silently normalizing bytes. Encoding
support beyond UTF-8 requires a separate explicit design.

