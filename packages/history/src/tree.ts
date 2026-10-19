// One commit's tree as a snapshot, every file born together: the single state of a repository, without its history.
import { execFile } from "node:child_process";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { CitymapError, MAX_PATH_BYTES, compareKeys, stateSnapshot, type Snapshot } from "@citymap/ground-plan";
import { BlobReader } from "./blobs";
import { gitEnvironment } from "./env";
import { fetchManifests } from "./fetch-manifests";
import { isManifest, patternsOf, resolveWorkspaces, type Patterns } from "./manifests";
import type { HistoryEvent } from "./read";
import { GITLINK_MODE, SubmoduleReader } from "./submodules";

const run = promisify(execFile);
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
  const gitlinks = new Map<string, string>();
  for (const entry of stdout.split("\0").filter(Boolean)) {
    // "<mode> <type> <hash>\t<path>"
    const [meta, path] = [entry.slice(0, entry.indexOf("\t")), entry.slice(entry.indexOf("\t") + 1)];
    const [mode, , blob] = meta.split(" ");
    if (mode === GITLINK_MODE) gitlinks.set(path, blob!);
    else files.push({ path, blob: blob! });
  }
  // A partial clone fetches the commit's root manifests first; then they and .gitmodules are read in one pass.
  const fetched = await fetchManifests(dir, async () => [`${commit}^{tree}`]);
  if (fetched) onEvent(fetched);
  const manifests = files.filter((f) => isManifest(f.path));
  const gitmodules = files.find((f) => f.path === ".gitmodules");
  const reader = new BlobReader(dir);
  const texts = await reader.readAll([...manifests.map((m) => m.blob), ...(gitmodules ? [gitmodules.blob] : [])]);
  await reader.close();
  // Each submodule's files at its pin, under its folder; one it cannot read is its .gitlink file.
  const submodules: string[] = [];
  if (gitlinks.size > 0) {
    const text = gitmodules ? texts.get(gitmodules.blob) : null;
    const expanded = await new SubmoduleReader(dir).expandAll(gitlinks, typeof text === "string" ? text : null);
    for (const [path, found] of expanded) {
      for (const [file, blob] of found.files) files.push({ path: file, blob });
      submodules.push(...found.submodules);
      for (const unread of found.unread)
        onEvent({
          code: "history/submodule-unavailable",
          detail: { path: unread.path, index: 0, reason: unread.reason },
        });
      if (!found.unread.some((u) => u.path === path))
        onEvent({ code: "history/submodule", detail: { path, index: 0, files: found.files.size } });
    }
  }
  for (const { path } of files)
    if (path.length * 3 > MAX_PATH_BYTES && encoder.encode(path).length > MAX_PATH_BYTES)
      throw new CitymapError("snapshot/bad-path", `a path is longer than ${MAX_PATH_BYTES} bytes`, {
        index: 0,
        start: path.slice(0, 80),
      });
  files.sort((a, b) => compareKeys(a.path, b.path));
  const folders = new Set<string>([""]);
  for (const { path } of files) for (let f = folderOf(path); f !== ""; f = folderOf(f)) folders.add(f);
  // The root manifests' members, matched against the folders that hold files.
  const patterns: Patterns[] = [];
  for (const m of manifests) {
    const text = texts.get(m.blob);
    if (typeof text !== "string") onEvent({ code: "history/manifest-unavailable", detail: { path: m.path, index: 0 } });
    else {
      const declared = patternsOf(m.path, text);
      if (declared) patterns.push(declared);
    }
  }
  const paths = files.map(({ path }) => path);
  const members =
    patterns.length > 0
      ? resolveWorkspaces(
          patterns,
          [...folders].filter((f) => f !== ""),
        )
      : undefined;
  const snapshot = stateSnapshot(options.repository ?? basename(dir), commit, paths, members, submodules);
  return fetched?.detail.status === "unfetchable" ? { ...snapshot, manifests: "unfetchable" } : snapshot;
}
