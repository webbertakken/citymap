// The files of one commit and their contents, read without fetching: what the CLI counts a city's measures from. A
// submodule's files are listed at its pin, as the city lays them, each with the git data that holds its blob.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { BlobReader, type OnBlob } from "./blobs";
import { gitEnvironment } from "./env";
import { GITLINK_MODE, SubmoduleReader } from "./submodules";

const run = promisify(execFile);

/** A file of a commit's tree, as the city lays it: its path and its blob. */
export interface TreeFile {
  readonly path: string;
  readonly blob: string;
  /**
   * Where its blob is held: the repository itself when absent; a submodule's git data; or null, held nowhere (the
   * `.gitlink` file of a submodule that could not be read, which is never asked for).
   */
  readonly store?: string | null;
}

/** The submodule store of a path: the git data of the deepest submodule folder holding it, or null. */
const storeOf = (path: string, stores: readonly (readonly [string, string])[]) =>
  stores.find(([folder]) => path.startsWith(`${folder}/`))?.[1] ?? null;

/**
 * Every file of the tree at `commit`, in git's order, then each submodule's files at its pin (named by the commit's
 * `.gitmodules`), as the single state and the fold lay them.
 */
export async function listTree(repoDir: string, commit: string): Promise<TreeFile[]> {
  const dir = resolve(repoDir);
  const args = ["-C", dir, "-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit];
  const { stdout } = await run("git", args, { env: gitEnvironment(), maxBuffer: 1 << 30 });
  const files: TreeFile[] = [];
  const gitlinks = new Map<string, string>();
  for (const entry of stdout.split("\0")) {
    // "<mode> <type> <hash>\t<path>"
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const [mode, , blob = ""] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    if (mode === GITLINK_MODE) gitlinks.set(path, blob);
    else files.push({ path, blob });
  }
  if (gitlinks.size === 0) return files;
  const gitmodules = files.find((f) => f.path === ".gitmodules");
  let names: string | null = null;
  if (gitmodules) {
    const reader = new BlobReader(dir);
    // The reader answers every blob it is asked for.
    names = (await reader.readAll([gitmodules.blob])).get(gitmodules.blob)!;
    await reader.close();
  }
  for (const found of (await new SubmoduleReader(dir).expandAll(gitlinks, names)).values()) {
    // Deepest first, so a nested submodule's files name its own git data.
    const stores = [...found.stores].toSorted(([a], [b]) => b.length - a.length);
    for (const [path, blob] of found.files) files.push({ path, blob, store: storeOf(path, stores) });
  }
  return files;
}

/**
 * Hands each distinct blob's bytes to `onBlob` once, as it arrives, each read from the git data that holds it; a blob
 * the git data does not hold (a partial clone's) is never asked for, so nothing is fetched, and arrives as null, as does
 * one held nowhere. The bytes are lent: copy what is kept.
 */
export async function readBlobs(
  repoDir: string,
  files: readonly Pick<TreeFile, "blob" | "store">[],
  onBlob: OnBlob,
): Promise<void> {
  // The repository's own blobs first, then each submodule's git data's; none are asked of no store.
  const stores = new Map<string, { readonly gitData: boolean; readonly blobs: Set<string> }>([
    [resolve(repoDir), { gitData: false, blobs: new Set() }],
  ]);
  const all = new Set<string>();
  for (const { blob, store } of files) {
    all.add(blob);
    if (store === null) continue;
    const at = store ?? resolve(repoDir);
    const found = stores.get(at) ?? { gitData: true, blobs: new Set<string>() };
    found.blobs.add(blob);
    stores.set(at, found);
  }
  const answered = new Set<string>();
  const once: OnBlob = (blob, bytes) => {
    if (answered.has(blob)) return;
    answered.add(blob);
    onBlob(blob, bytes);
  };
  for (const [at, { gitData, blobs }] of stores) {
    const reader = new BlobReader(at, { gitData });
    try {
      // One store at a time: each is its own git process.
      // oxlint-disable-next-line no-await-in-loop
      await reader.readBytes(
        [...blobs].filter((blob) => !answered.has(blob)),
        (blob, bytes) => bytes !== null && once(blob, bytes),
      );
    } finally {
      // oxlint-disable-next-line no-await-in-loop
      await reader.close();
    }
  }
  // What no store held arrives as null.
  for (const blob of all) once(blob, null);
}
