// A picked folder to the snapshot `citymap --no-history` lays: the paths git tracks (or, without git, the files its
// `.gitignore` files keep), the commit HEAD names, and the members its root manifests declare in the working tree.
import { MAX_FILES, MAX_PATH_BYTES, stateSnapshot, type Snapshot } from "@citymap/ground-plan";
import { isManifest, patternsOf, resolveWorkspaces, type Patterns } from "@citymap/history/manifests";
import { LocalError } from "./errors";
import type { Folder } from "./folder";
import { findGit, headCommit, type Head } from "./git-data";
import { readIndex } from "./git-index";
import type { LocalPhase } from "./phases";
import { readSubmodules, type SubmoduleUnread } from "./submodules";
import { walkFolder } from "./walk";

export interface LocalRead {
  readonly snapshot: Snapshot;
  readonly source: "index" | "walk";
  /** The index read, for the log; null for a folder without git. */
  readonly index: { readonly version: number; readonly entries: number; readonly submodules: number } | null;
  /** How HEAD's commit was found; null for a folder without git. */
  readonly head: Head["how"] | null;
  /** Tracked root manifests the working tree does not hold, left out as the CLI leaves out one it cannot read. */
  readonly unread: readonly string[];
  /** Each top submodule read, with the files it holds; and each submodule laid as its .gitlink file, with why. */
  readonly submodules: {
    readonly read: readonly { readonly path: string; readonly files: number }[];
    readonly unread: readonly { readonly path: string; readonly reason: SubmoduleUnread }[];
  };
}

const encoder = new TextEncoder();
const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** The tracked paths and HEAD's commit of a folder with git data. */
async function fromIndex(folder: Folder, dir: string, idBytes: 20 | 32) {
  const at = `${dir}/index`;
  if ((await folder.kind(at)) !== "file")
    throw new LocalError("local/no-index", "the repository has no git index: nothing is checked out or staged");
  const listing = readIndex(await folder.read(at), idBytes);
  const head = await headCommit(folder, dir);
  return { paths: listing.paths, head, listing };
}

/** The snapshot of a picked folder, reporting each phase as it begins. */
export async function readLocal(
  folder: Folder,
  onPhase: (phase: LocalPhase) => void,
  limit: number = MAX_FILES,
): Promise<LocalRead> {
  onPhase({ phase: "index" });
  const git = await findGit(folder);
  let paths: readonly string[];
  let commit = "worktree";
  let index: LocalRead["index"] = null;
  let head: LocalRead["head"] = null;
  let submodules: readonly string[] = [];
  let submodulesRead: LocalRead["submodules"] = { read: [], unread: [] };
  if (git) {
    const read = await fromIndex(folder, git.dir, git.idBytes);
    commit = read.head.commit;
    head = read.head.how;
    const { gitlinks } = read.listing;
    index = { version: read.listing.version, entries: read.paths.length, submodules: gitlinks.length };
    const inner = await readSubmodules(folder, gitlinks);
    paths = [...read.paths, ...inner.paths];
    submodules = inner.submodules;
    const missed = new Set(inner.unread.map((u) => u.path));
    submodulesRead = {
      read: gitlinks
        .filter((path) => !missed.has(path))
        .map((path) => ({ path, files: inner.paths.filter((p) => p.startsWith(`${path}/`)).length })),
      unread: inner.unread,
    };
  } else {
    onPhase({ phase: "folder", files: 0 });
    paths = await walkFolder(folder, (files) => onPhase({ phase: "folder", files }), limit);
  }
  if (paths.length === 0) throw new LocalError("local/empty", "there are no files to lay");
  if (paths.length > limit)
    throw new LocalError("local/too-large", `more than ${limit} files`, { files: paths.length, limit });
  const long = paths.find((p) => p.length * 3 > MAX_PATH_BYTES && encoder.encode(p).length > MAX_PATH_BYTES);
  if (long !== undefined)
    throw new LocalError("local/long-path", `a path is longer than ${MAX_PATH_BYTES} bytes`, {
      start: long.slice(0, 80),
    });

  onPhase({ phase: "manifests" });
  const manifests = await Promise.all(
    paths.filter(isManifest).map(async (path) => {
      try {
        return { path, text: new TextDecoder().decode(await folder.read(path)) };
      } catch (error) {
        if (!(error instanceof LocalError && error.code === "local/vanished")) throw error;
        return { path, text: null };
      }
    }),
  );
  const unread = manifests.filter((m) => m.text === null).map((m) => m.path);
  const patterns = manifests
    .map((m) => (m.text === null ? null : patternsOf(m.path, m.text)))
    .filter((p): p is Patterns => p !== null);
  const folders = new Set<string>();
  for (const path of paths) for (let f = folderOf(path); f !== "" && !folders.has(f); f = folderOf(f)) folders.add(f);
  const members = patterns.length > 0 ? resolveWorkspaces(patterns, folders) : undefined;
  return {
    snapshot: stateSnapshot(folder.name, commit, paths, members, [...submodules]),
    source: git ? "index" : "walk",
    index,
    head,
    unread,
    submodules: submodulesRead,
  };
}
