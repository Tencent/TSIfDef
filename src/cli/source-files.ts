import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const sourceExtensionPattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;
const ignoredDirectories = new Set([".git", "node_modules"]);

/** A source file whose bytes are not valid UTF-8 and cannot be decoded safely. */
export class SourceEncodingError extends Error {
  public readonly code = "source-encoding" as const;

  public constructor(public readonly file: string, public readonly cause: unknown) {
    super(`Source file '${file}' is not valid UTF-8.`);
    this.name = "SourceEncodingError";
  }
}

// `fatal` rejects malformed byte sequences instead of substituting U+FFFD, and
// `ignoreBOM` keeps a leading BOM so projection offsets match `readFile(..,"utf8")`.
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Read a source file as strictly validated UTF-8 text.
 *
 * Unlike `readFile(file, "utf8")`, malformed UTF-8 throws a `SourceEncodingError`
 * identifying `displayPath` rather than silently producing U+FFFD replacements.
 * Correctly encoded U+FFFD characters remain valid source.
 */
export async function readSourceText(file: string, displayPath = file): Promise<string> {
  const bytes = await readFile(file);
  try {
    return utf8Decoder.decode(bytes);
  } catch (cause) {
    throw new SourceEncodingError(displayPath, cause);
  }
}

/** Discover TypeScript-family files in deterministic relative-path order. */
export async function discoverSourceFiles(
  root: string,
  excludedRoot?: string,
): Promise<string[]> {
  const files: string[] = [];
  const resolvedExcludedRoot = excludedRoot === undefined ? undefined : resolve(excludedRoot);
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name) || resolve(path) === resolvedExcludedRoot) {
          continue;
        }
        await visit(path);
      } else if (entry.isFile() && sourceExtensionPattern.test(entry.name)) {
        files.push(path);
      }
    }
  };
  await visit(resolve(root));
  return files;
}
