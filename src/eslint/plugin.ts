import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parseProfileFile } from "../cli/config.js";
import { projectSource, type MacroDefinitions } from "../core/index.js";

// TSIfDef ESLint processor
//
// 与 tsserver 插件对称：tsserver 劫持 getScriptSnapshot 让语言服务只看到投影后的
// 源码；这里用 ESLint 的 processor.preprocess 让 ESLint 的 parser 也只看到投影后的
// 源码。等长遮盖保证行列不变，因此 postprocess 直接透传诊断，位置无需换算。
//
// 用法（工程 .eslintrc）：
//   { "plugins": ["tsifdef"],
//     "overrides": [{ "files": ["*.ts","*.mts"], "processor": "tsifdef/macros" }] }
//
// Profile 来源与 CLI/tsserver 一致：从被检查文件向上查找带 "tsifdef" 指针的
// package.json，指针指向启用宏名的 JSON 数组。找不到时降级为原文本（不阻断 lint）。

interface ProfileCacheEntry {
  readonly mtimeMs: number;
  readonly definitions: MacroDefinitions;
}

// 按 profile 文件路径缓存，避免每个文件都重复读、重复解析。以 mtime 失效。
const profileCache = new Map<string, ProfileCacheEntry>();
// 按目录缓存"向上找到的 profile 路径"，避免每个文件都走一遍 findUp。
const pointerCache = new Map<string, string | null>();

const macroFilePattern = /\.(?:d\.)?(?:ts|tsx|mts|cts)$/i;

/** 从文件所在目录向上查找带 tsifdef 指针的 package.json，返回 profile 绝对路径。 */
function resolveProfilePath(filename: string): string | undefined {
  let dir = dirname(resolve(filename));
  const chain: string[] = [];
  for (;;) {
    const cached = pointerCache.get(dir);
    if (cached !== undefined) {
      // 命中缓存：把途经目录也填上，回填结果。
      for (const d of chain) pointerCache.set(d, cached);
      return cached ?? undefined;
    }
    chain.push(dir);

    const packagePath = join(dir, "package.json");
    let pointer: string | undefined;
    try {
      const raw = JSON.parse(readFileSync(packagePath, "utf8").replace(/^﻿/, "")) as unknown;
      const value =
        raw !== null && typeof raw === "object"
          ? (raw as Record<string, unknown>).tsifdef
          : undefined;
      if (typeof value === "string" && value.trim() !== "") {
        pointer = resolve(dir, value);
      } else if (raw !== null && typeof raw === "object") {
        // 有 package.json 但没有 tsifdef 指针：这是包边界，停止上查。
        for (const d of chain) pointerCache.set(d, null);
        return undefined;
      }
    } catch {
      // 该目录没有 package.json（或无法读取）：继续向上。
    }
    if (pointer !== undefined) {
      for (const d of chain) pointerCache.set(d, pointer);
      return pointer;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      // 到达文件系统根仍未找到。
      for (const d of chain) pointerCache.set(d, null);
      return undefined;
    }
    dir = parent;
  }
}

/** 读取并解析 profile，按 mtime 缓存。失败返回 undefined（降级）。 */
function loadDefinitions(profilePath: string): MacroDefinitions | undefined {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(profilePath).mtimeMs;
  } catch {
    return undefined;
  }
  const cached = profileCache.get(profilePath);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.definitions;
  }
  try {
    const text = readFileSync(profilePath, "utf8");
    const definitions = parseProfileFile(text, profilePath).definitions;
    profileCache.set(profilePath, { mtimeMs, definitions });
    return definitions;
  } catch {
    return undefined;
  }
}

interface LintMessage {
  readonly line?: number;
  readonly column?: number;
  [key: string]: unknown;
}

export const processors = {
  macros: {
    supportsAutofix: false,
    preprocess(text: string, filename: string): string[] {
      if (!macroFilePattern.test(filename)) {
        return [text];
      }
      const profilePath = resolveProfilePath(filename);
      if (profilePath === undefined) {
        return [text];
      }
      const definitions = loadDefinitions(profilePath);
      if (definitions === undefined) {
        return [text];
      }
      // 等长遮盖：未激活分支与宏指令行变为空格，保留 CR/LF 与总长度。
      return [projectSource(text, definitions).projectedText];
    },
    postprocess(messages: LintMessage[][]): LintMessage[] {
      // 投影等长，行列不变，诊断位置直接透传。
      return messages.flat();
    },
  },
};

export default { processors };
