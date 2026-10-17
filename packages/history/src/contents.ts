// The files of one commit and their contents, read without fetching: what the CLI counts a city's measures from.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { BlobReader, type OnBlob } from "./blobs";
import { gitEnvironment } from "./env";

const run = promisify(execFile);
const SUBMODULE = "160000";

/** A file of a commit's tree: its path and its blob. */
export interface TreeFile {
  readonly path: string;
  readonly blob: string;
}

/** Every file of the tree at `commit`, submodules left out, in git's order. */
export async function listTree(repoDir: string, commit: string): Promise<TreeFile[]> {
  const args = ["-C", resolve(repoDir), "-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit];
  const { stdout } = await run("git", args, { env: gitEnvironment(), maxBuffer: 1 << 30 });
  const files: TreeFile[] = [];
  for (const entry of stdout.split("\0")) {
    // "<mode> <type> <hash>\t<path>"
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const [mode, , blob = ""] = entry.slice(0, tab).split(" ");
    if (mode !== SUBMODULE) files.push({ path: entry.slice(tab + 1), blob });
  }
  return files;
}

/**
 * Hands each distinct blob's bytes to `onBlob` once, as it arrives; a blob the repository does not hold (a partial
 * clone's) is never asked for, so nothing is fetched, and arrives as null. The bytes are lent: copy what is kept.
 */
export async function readBlobs(repoDir: string, blobs: readonly string[], onBlob: OnBlob): Promise<void> {
  const reader = new BlobReader(resolve(repoDir));
  try {
    await reader.readBytes([...new Set(blobs)], onBlob);
  } finally {
    await reader.close();
  }
}
