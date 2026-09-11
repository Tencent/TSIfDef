# Contributing to TSIfDef

Thank you for helping improve TSIfDef.

## Development setup

Requirements:

- Node.js 18.17 or newer
- npm
- VSCode 1.85 or newer for extension changes

Install dependencies and build the project:

```bash
npm install
npm run build
```

## Making changes

- Keep changes focused on one problem.
- Add or update tests when behavior changes.
- Use English for code comments and public API documentation.
- Do not commit generated `dist/`, `.test-dist/`, `release/`, or `node_modules/` files.
- Update `CHANGELOG.md` for user-visible changes.

Run the full test suite before opening a pull request:

```bash
npm test
```

Maintainers can verify release artifacts with:

```bash
npm run release
```

This command builds, packages, installs, and smoke-tests both the npm tarball and
the VSIX.

## Pull requests

Describe the problem, the chosen solution, and any compatibility impact. Keep
commits reviewable and avoid unrelated formatting changes.

Report security issues through the process in [`SECURITY.md`](./SECURITY.md),
not through a public issue.
