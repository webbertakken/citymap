import { compareKeys } from "../fixed/hash";
import type { Snapshot } from "./snapshot";

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/**
 * One commit's tree as a snapshot at index 0, every file and folder born together: the single state of a repository,
 * without its history. The CLI's `--no-history`, the bench and the browser all lay what this builds.
 */
export function stateSnapshot(
  repository: string,
  commit: string,
  paths: readonly string[],
  workspaces?: readonly string[],
  submodules: readonly string[] = [],
): Snapshot {
  const folders = new Set<string>([""]);
  for (const path of paths)
    for (let folder = folderOf(path); folder !== "" && !folders.has(folder); folder = folderOf(folder))
      folders.add(folder);
  return {
    repository,
    commit,
    index: 0,
    files: paths.toSorted(compareKeys).map((path) => ({ path, identity: `${path}@0`, firstSeen: 0 })),
    folderFirstSeen: new Map([...folders].toSorted(compareKeys).map((f) => [f, 0])),
    ...(workspaces === undefined ? {} : { workspaces: workspaces.toSorted(compareKeys) }),
    ...(submodules.length === 0 ? {} : { submodules: submodules.toSorted(compareKeys) }),
  };
}
