# eslint-plugin-tsifdef

ESLint companion package for [TSIfDef](https://github.com/Tencent/TsIfDef).
It exposes the `tsifdef/macros` processor from the version-matched `tsifdef`
package under the package name expected by ESLint's legacy `eslintrc` resolver.

Install both packages at the same version:

```bash
npm install --save-dev tsifdef eslint-plugin-tsifdef
```

Then configure ESLint:

```json
{
  "plugins": ["tsifdef"],
  "overrides": [
    {
      "files": ["*.ts", "*.mts", "*.cts", "*.tsx"],
      "processor": "tsifdef/macros"
    }
  ]
}
```

See the main repository's [integration guide](https://github.com/Tencent/TsIfDef/blob/main/INTEGRATION.md)
for Profile, VSCode, build, and lint configuration.
