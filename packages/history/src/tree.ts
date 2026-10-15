// One commit's tree as a snapshot, every file born together: the single state of a repository, without its history.
import { execFile } from "node:child_process";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { CitymapError, MAX_PATH_BYTES, compareKeys, type Snapshot } from "@citymap/ground-plan";
import { BlobReader } from "./blobs";
import { gitEnvironment } from "./env";
import { isManifest, patternsOf, resolveWorkspaces, type Patterns } from "./manifests";
import type { HistoryEvent } from "./read";

const run = promisify(execFile);
const SUBMODULE = "160000";
const encoder = new TextEncoder();
const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

export interface TreeOptions {
  /** The repository's display name; the folder name by default. */
  readonly repository?: string;
  readonly onEvent?: (event: HistoryEvent) => void;
}

/** The tree at `commit` as a snapshot at index 0: every file and folder born at once, members from its manifests. */
export async function readTree(repoDir: string, commit: string, options: TreeOptions = {}): Promise<Snapshot> {
  const dir = resolve(repoDir);
  const onEvent = options.onEvent ?? (() => {});
  const args = ["-C", dir, "-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit];
  const { stdout } = await run("git", args, { env: gitEnvironment(), maxBuffer: 1 << 30 });
  const files: { path: string; blob: string }[] = [];
  for (const entry of stdout.split("\0").filter(Boolean)) {
    // "<mode> <type> <hash>\t<path>"
    const [meta, path] = [entry.slice(0, entry.indexOf("\t")), entry.slice(entry.indexOf("\t") + 1)];
    const [mode, , blob] = meta.split(" ");
    if (mode === SUBMODULE) {
      onEvent({ code: "history/skip-submodule", detail: { path, index: 0 } });
      continue;
    }
    if (path.length * 3 > MAX_PATH_BYTES && encoder.encode(path).length > MAX_PATH_BYTES)
      throw new CitymapError("snapshot/bad-path", `a path is longer than ${MAX_PATH_BYTES} bytes`, {
        index: 0,
        start: path.slice(0, 80),
      });
    files.push({ path, blob: blob! });
  }
  files.sort((a, b) => compareKeys(a.path, b.path));
  const folders = new Set<string>([""]);
  for (const { path } of files) for (let f = folderOf(path); f !== ""; f = folderOf(f)) folders.add(f);
  // The root manifests' members, matched against the folders that hold files.
  const manifests = files.filter((f) => isManifest(f.path));
  const reader = new BlobReader(dir);
  const texts = await reader.readAll(manifests.map((m) => m.blob));
  await reader.close();
  const patterns: Patterns[] = [];
  for (const m of manifests) {
    const text = texts.get(m.blob);
    if (typeof text !== "string") onEvent({ code: "history/manifest-unavailable", detail: { path: m.path, index: 0 } });
    else {
      const declared = patternsOf(m.path, text);
      if (declared) patterns.push(declared);
    }
  }
  const sortedFolders = [...folders].toSorted(compareKeys);
  return {
    repository: options.repository ?? basename(dir),
    commit,
    index: 0,
    files: files.map(({ path }) => ({ path, identity: `${path}@0`, firstSeen: 0 })),
    folderFirstSeen: new Map(sortedFolders.map((f) => [f, 0])),
    ...(patterns.length > 0
      ? {
          workspaces: resolveWorkspaces(
            patterns,
            sortedFolders.filter((f) => f !== ""),
          ),
        }
      : {}),
  };
}
