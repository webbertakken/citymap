// A picked folder's submodules: each one's tracked paths, read through its own index, under its folder. One that
// cannot be read is the one file `<folder>/.gitlink`, as the CLI lays a submodule it cannot read.
import { GITLINK_FILE, compareKeys } from "@citymap/ground-plan";
import type { Folder } from "./folder";
import { inside, objectIdBytes } from "./git-data";
import { readIndex } from "./git-index";

/** Nesting deeper than this is not followed. */
export const SUBMODULE_DEPTH = 8;

export type SubmoduleUnread = "not-checked-out" | "outside" | "bad-git-file" | "no-index" | "index" | "depth";

export interface SubmoduleRead {
  /** Every submodule's tracked paths, prefixed with its folder; `.gitlink` for one not read. */
  readonly paths: readonly string[];
  /** Each read path's size in bytes, from its submodule's own index. */
  readonly sizes: ReadonlyMap<string, number>;
  /** Every submodule folder, nested ones included, sorted. */
  readonly submodules: readonly string[];
  /** Each submodule laid as its `.gitlink` file, and why, by path. */
  readonly unread: readonly { readonly path: string; readonly reason: SubmoduleUnread }[];
}

class Unread extends Error {
  constructor(readonly reason: SubmoduleUnread) {
    super(reason);
  }
}

/** Where a submodule keeps its git data, inside the picked folder; why not, when it cannot be found there. */
async function gitDataOf(folder: Folder, path: string): Promise<string> {
  const kind = await folder.kind(`${path}/.git`);
  if (kind === "directory") return `${path}/.git`;
  if (kind === null) throw new Unread("not-checked-out");
  const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(new TextDecoder().decode(await folder.read(`${path}/.git`)));
  if (!pointer) throw new Unread("bad-git-file");
  const dir = inside(`${path}/${pointer[1]!}`);
  if (dir === null) throw new Unread("outside");
  return dir;
}

/** One submodule's own tracked paths and gitlinks, or why it cannot be read. */
async function readOne(folder: Folder, path: string) {
  const dir = await gitDataOf(folder, path);
  if ((await folder.kind(`${dir}/index`)) !== "file") throw new Unread("no-index");
  const [bytes, idBytes] = await Promise.all([folder.read(`${dir}/index`), objectIdBytes(folder, dir)]);
  try {
    return readIndex(bytes, idBytes);
  } catch {
    // The decoder's every refusal is a LocalError: an index of a kind not read, which leaves the submodule unread.
    throw new Unread("index");
  }
}

/** Reads every gitlink's submodule, nested ones in turn; those it cannot read are laid as their `.gitlink` file. */
export async function readSubmodules(folder: Folder, gitlinks: readonly string[]): Promise<SubmoduleRead> {
  const paths: string[] = [];
  const sizes = new Map<string, number>();
  const submodules: string[] = [];
  const unread: { path: string; reason: SubmoduleUnread }[] = [];
  const visit = async (path: string, depth: number): Promise<void> => {
    submodules.push(path);
    try {
      if (depth >= SUBMODULE_DEPTH) throw new Unread("depth");
      const listing = await readOne(folder, path);
      listing.paths.forEach((p, i) => {
        paths.push(`${path}/${p}`);
        sizes.set(`${path}/${p}`, listing.sizes[i]!);
      });
      await Promise.all(listing.gitlinks.map((inner) => visit(`${path}/${inner}`, depth + 1)));
    } catch (error) {
      if (!(error instanceof Unread)) throw error;
      unread.push({ path, reason: error.reason });
      paths.push(`${path}/${GITLINK_FILE}`);
    }
  };
  await Promise.all(gitlinks.map((path) => visit(path, 0)));
  return {
    paths,
    sizes,
    submodules: submodules.toSorted(compareKeys),
    unread: unread.toSorted((a, b) => compareKeys(a.path, b.path)),
  };
}
