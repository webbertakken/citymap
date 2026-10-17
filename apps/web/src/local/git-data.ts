// Where a picked folder keeps its git data, how wide its object ids are, and the commit its HEAD names.
import { LocalError } from "./errors";
import type { Folder } from "./folder";

export interface GitData {
  /** The git data's path inside the folder: `.git`, or where a `.git` file points. */
  readonly dir: string;
  /** Object id width: 20 bytes (SHA-1) or 32 (SHA-256). */
  readonly idBytes: 20 | 32;
}

export interface Head {
  /** The commit's id, or "worktree" when HEAD names none that can be read. */
  readonly commit: string;
  readonly how: "detached" | "ref" | "packed" | "none";
}

const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REF = /^refs\/(?:[^/\s]+\/)*[^/\s]+$/;
const text = async (folder: Folder, path: string) => new TextDecoder().decode(await folder.read(path));
const fileText = async (folder: Folder, path: string) =>
  (await folder.kind(path)) === "file" ? text(folder, path) : null;

/** A `gitdir:` path as a path inside the folder, or null when it is absolute or climbs out. */
export function inside(path: string): string | null {
  if (/^(?:[/\\]|[A-Za-z]:)/.test(path)) return null;
  const kept: string[] = [];
  for (const segment of path.split(/[/\\]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") kept.push(segment);
    else if (kept.pop() === undefined) return null;
  }
  return kept.join("/");
}

/** Whether a git config sets `key = value` in `section`, names and values compared without case. */
function configSets(config: string | null, section: string, key: string, value: string): boolean {
  let current = "";
  for (const line of (config ?? "").split("\n")) {
    const header = /^\s*\[\s*([^\]\s]+)/.exec(line);
    if (header) current = header[1]!.toLowerCase();
    else if (current === section && new RegExp(`^\\s*${key}\\s*=\\s*${value}\\s*$`, "i").test(line)) return true;
  }
  return false;
}

/** 32 when the config's `[extensions]` section sets `objectformat = sha256`, else 20. */
export async function objectIdBytes(folder: Folder, dir: string): Promise<20 | 32> {
  return configSets(await fileText(folder, `${dir}/config`), "extensions", "objectformat", "sha256") ? 32 : 20;
}

/** The folder's git data, or null for a folder without git; git data elsewhere, or git's own data, is refused. */
export async function findGit(folder: Folder): Promise<GitData | null> {
  const kind = await folder.kind(".git");
  if (kind === "directory") return { dir: ".git", idBytes: await objectIdBytes(folder, ".git") };
  if (kind === "file") {
    const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(await text(folder, ".git"));
    if (!pointer) throw new LocalError("local/bad-git-file", "the .git file does not say where the git data is");
    const dir = inside(pointer[1]!);
    if (dir === null)
      throw new LocalError("local/outside", "the git data lies outside the folder", { gitdir: pointer[1]! });
    return { dir, idBytes: await objectIdBytes(folder, dir) };
  }
  // Git's own data: HEAD beside objects and refs, or a config that says it is bare (the folder input lists no empty
  // folders, so a fresh bare repository shows neither).
  const [head, objects, refs] = await Promise.all([folder.kind("HEAD"), folder.kind("objects"), folder.kind("refs")]);
  const bare = head === "file" && configSets(await fileText(folder, "config"), "core", "bare", "true");
  if (head === "file" && ((objects === "directory" && refs === "directory") || bare))
    throw new LocalError("local/no-working-tree", "the folder is git's own data, not a working tree");
  return null;
}

/** The commit HEAD names: detached, through a loose ref, or through `packed-refs`; "worktree" when none is found. */
export async function headCommit(folder: Folder, dir: string): Promise<Head> {
  const head = (await fileText(folder, `${dir}/HEAD`))?.trim() ?? "";
  if (COMMIT.test(head)) return { commit: head, how: "detached" };
  const ref = /^ref:\s*(\S+)$/.exec(head)?.[1] ?? "";
  if (REF.test(ref) && !ref.split("/").includes("..")) {
    const loose = (await fileText(folder, `${dir}/${ref}`))?.trim() ?? "";
    if (COMMIT.test(loose)) return { commit: loose, how: "ref" };
    const packed = (await fileText(folder, `${dir}/packed-refs`)) ?? "";
    for (const line of packed.split("\n")) {
      const [id = "", name] = line.trim().split(" ");
      if (name === ref && COMMIT.test(id)) return { commit: id, how: "packed" };
    }
  }
  return { commit: "worktree", how: "none" };
}
