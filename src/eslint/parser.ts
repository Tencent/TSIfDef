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

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { VERSION } from "../version.js";
import { projectSourceForEslint } from "./projection.js";

interface ParserOptions {
  readonly filePath?: string;
  readonly [key: string]: unknown;
}

interface TypeScriptEslintParser {
  parse(code: string, options?: ParserOptions): unknown;
  parseForESLint(code: string, options?: ParserOptions): ParserResult;
  readonly meta?: unknown;
}

interface ParserResult {
  readonly ast: unknown;
  readonly services?: unknown;
  readonly visitorKeys?: unknown;
  readonly scopeManager?: unknown;
}

const parserCache = new Map<string, TypeScriptEslintParser>();

/** Resolve the peer parser relative to the file currently being linted. */
function loadTypeScriptEslintParser(filePath: string | undefined): TypeScriptEslintParser {
  const anchor = filePath === undefined
    ? join(process.cwd(), "package.json")
    : join(dirname(resolve(filePath)), "__tsifdef_eslint_parser__.js");
  const hostRequire = createRequire(anchor);
  const parserPath = hostRequire.resolve("@typescript-eslint/parser");
  const cached = parserCache.get(parserPath);
  if (cached !== undefined) return cached;
  const parser = hostRequire(parserPath) as TypeScriptEslintParser;
  parserCache.set(parserPath, parser);
  return parser;
}

/**
 * ESLint parser wrapper that projects TSIfDef source before delegating to
 * `@typescript-eslint/parser`.
 *
 * The processor still owns ESLint's primary projection and synthetic-message
 * filtering. This wrapper additionally covers consumers such as
 * `eslint-plugin-import` that bypass processors, read dependencies from disk,
 * and invoke the configured parser directly.
 */
export function parseForESLint(code: string, options?: ParserOptions): ParserResult {
  const filePath = typeof options?.filePath === "string" ? options.filePath : undefined;
  const projected = projectSourceForEslint(code, filePath).projectedText;
  return loadTypeScriptEslintParser(filePath).parseForESLint(projected, options);
}

export function parse(code: string, options?: ParserOptions): unknown {
  const filePath = typeof options?.filePath === "string" ? options.filePath : undefined;
  const projected = projectSourceForEslint(code, filePath).projectedText;
  return loadTypeScriptEslintParser(filePath).parse(projected, options);
}

export const meta = { name: "eslint-plugin-tsifdef/parser", version: VERSION };

export default { parse, parseForESLint, meta };
