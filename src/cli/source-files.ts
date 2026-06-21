import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const sourceExtensionPattern = /(?:\.d)?\.(?:ts|tsx|mts|cts)$/i;
const ignoredDirectories = new Set([".git", "node_modules"]);

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
