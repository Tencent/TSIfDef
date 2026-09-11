// Copyright (C) 2026 Tencent. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export * from "../core/index.js";
export {
  configs as eslintConfigs,
  default as eslintPlugin,
  meta as eslintPluginMeta,
  processors,
} from "./plugin.js";

import { configs as pluginConfigs, legacyRecommended, meta as pluginMeta } from "./plugin.js";

// The legacy `.eslintrc` system resolves a plugin by package name, which lands
// on this entry rather than on `./eslint-plugin`. It then reads `configs`,
// `processors`, and `meta` off the module, so `extends: ["plugin:tsifdef/
// recommended"]` only works if those names are present here too.
//
// `recommended` must be the eslintrc shape here: the legacy schema rejects a
// top-level `files` key. The flat shape stays reachable under the same names
// it has on the flat entry, so a flat config that reaches this entry through
// the `eslint-plugin-tsifdef` alias still works.
export const meta = pluginMeta;
export const configs = {
  ...pluginConfigs,
  recommended: legacyRecommended,
};
