# Historical design research and implementation sequence

The following content was moved from `SPEC.md` on 2026-06-22. It records alternatives evaluated and completed
Implementation plan, not part of current product requirements.

## Positioning of Babel and Bun

### Babel

`babel-plugin-transform-define` can only replace constants and is not guaranteed to delete inactive branches before `tsc`. The current Pipeline is `tsc -> Babel`, so it cannot solve the missing regional interface on its own.

Babel can be used as a post-processing optimization for constant folding and dead-code elimination, but correctness is still guaranteed by the `#if` preprocessor.

### Bun

Bun Build supports `define`, macro and dead-code elimination, but Bun is not a TypeScript type checker; VSCode's static semantics are still provided by tsserver. Bun's official VSCode extension mainly provides running, debugging, testing, runtime diagnostics and lockfile support, and will not let tsserver understand the macro results of Bun Build.

If Bun is introduced, it is suitable for running macro CLI, build tools and test speedup, but not as the basis for conditional compilation correctness.

Only the official `oven.bun-vscode` should be considered in the VSCode market. The third-party `Pandy.bun` only provides the `bun run` command to execute the current file and cannot provide language services or macro views.

## Original implementation sequence

1. Implement `core` and golden use case tests without VSCode dependencies.
2. Implement the conventional CLI precompile and access stock `tsc` and CI.
3. Implement VSCode graying, folding, Profile and macro structure diagnosis.
4. Implement tsserver `ScriptSnapshot` Hack and verify TypeScript 5.5.4.
5. Connect to the existing `init.mjs -> compile.mjs -> build.mjs` Pipeline.
6. Publish VSIX and CLI packages of the same version, and add version consistency checks.

The first five items were completed at the time of filing; the sixth item is continued to be tracked by `REL-001` of the current roadmap.
