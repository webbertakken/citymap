/**
 * `tsc --build` checks only the projects the root `tsconfig.json` references, and says nothing about a workspace it
 * never reached. These rules make that gap fail loudly: every workspace has a `tsconfig.json`, and the root references
 * each one.
 */

/** One workspace directory, relative to the repository root, and whether it holds a `tsconfig.json`. */
export interface Workspace {
  readonly dir: string;
  readonly hasTsconfig: boolean;
}

/** Normalises a reference path (`./packages/a`, `packages/a/tsconfig.json`) to its directory (`packages/a`). */
export function referencedDir(path: string): string {
  return path
    .replace(/^\.\//, "")
    .replace(/\/?tsconfig\.json$/, "")
    .replace(/\/$/, "");
}

/** Every rule a workspace layout breaks, one line each; empty when the type check reaches every workspace. */
export function referenceProblems(workspaces: readonly Workspace[], references: readonly string[]): string[] {
  const referenced = new Set(references.map(referencedDir));
  return workspaces.flatMap(({ dir, hasTsconfig }) => {
    if (!hasTsconfig) return [`${dir} has no tsconfig.json`];
    if (!referenced.has(dir)) return [`${dir} is missing from the root tsconfig.json references`];
    return [];
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The `workspaces` globs of the root `package.json`; throws when they are not a list of strings. */
export function workspacePatterns(manifest: unknown): string[] {
  const patterns = isRecord(manifest) ? manifest["workspaces"] : undefined;
  if (!Array.isArray(patterns) || !patterns.every((pattern) => typeof pattern === "string")) {
    throw new TypeError("package.json: `workspaces` must be a list of globs");
  }
  return patterns;
}

/** The reference paths of the root `tsconfig.json`; throws when a reference has no `path`. */
export function referencePaths(tsconfig: unknown): string[] {
  const references = isRecord(tsconfig) ? tsconfig["references"] : undefined;
  if (!Array.isArray(references)) throw new TypeError("tsconfig.json: `references` must be a list");
  return references.map((reference) => {
    const path = isRecord(reference) ? reference["path"] : undefined;
    if (typeof path !== "string") throw new TypeError("tsconfig.json: every reference needs a `path`");
    return path;
  });
}
