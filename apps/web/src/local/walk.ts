// A folder without git, read file by file: each `.gitignore` applies to the folder it sits in and below, a deeper one
// overrides, and an ignored folder is never listed, so `node_modules` costs one name, not its thousands of files.
import { MAX_FILES } from "@citymap/ground-plan";
import type { Ignore } from "ignore";
import { LocalError } from "./errors";
import type { Folder } from "./folder";

/** Folders listed at once. */
export const WALK_IN_FLIGHT = 8;
/** Files between two progress reports. */
export const WALK_REPORT = 1000;

/** A folder still to list, with the rules that apply in it. */
interface Folder_ {
  readonly path: string;
  readonly rules: readonly Rules[];
}

interface Rules {
  /** The folder whose `.gitignore` this is. */
  readonly base: string;
  readonly matcher: Ignore;
}

/** Whether the last rule to decide a path, from the top folder's down to the deepest, ignores it. */
function ignored(rules: readonly Rules[], path: string, folder: boolean): boolean {
  let decision = false;
  for (const { base, matcher } of rules) {
    const relative = (base === "" ? path : path.slice(base.length + 1)) + (folder ? "/" : "");
    const result = matcher.test(relative);
    if (result.ignored) decision = true;
    else if (result.unignored) decision = false;
  }
  return decision;
}

/** Runs `task` over the items, `WALK_IN_FLIGHT` at a time, results in the items' order. */
async function inBatches<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const now = await Promise.all(items.slice(0, WALK_IN_FLIGHT).map(task));
  return [...now, ...(await inBatches(items.slice(WALK_IN_FLIGHT), task))];
}

/** Every file of the folder that its `.gitignore` files keep, folder by folder from the top. */
export async function walkFolder(
  folder: Folder,
  onCount: (files: number) => void,
  limit: number = MAX_FILES,
): Promise<string[]> {
  // Loaded only here, so the page carries the matcher only when a folder without git is opened.
  const { default: ignore } = await import("ignore");
  const files: string[] = [];
  const visit = async ({ path, rules }: Folder_): Promise<Folder_[]> => {
    const entries = await folder.list(path);
    const join = (name: string) => (path === "" ? name : `${path}/${name}`);
    const own = entries.some((e) => e.name === ".gitignore" && e.kind === "file")
      ? [
          ...rules,
          {
            base: path,
            matcher: ignore({ ignorecase: false }).add(new TextDecoder().decode(await folder.read(join(".gitignore")))),
          },
        ]
      : rules;
    const folders: Folder_[] = [];
    for (const entry of entries) {
      const at = join(entry.name);
      if (entry.name === ".git" || ignored(own, at, entry.kind === "directory")) continue;
      if (entry.kind === "directory") {
        folders.push({ path: at, rules: own });
        continue;
      }
      files.push(at);
      if (files.length > limit)
        throw new LocalError("local/too-large", `more than ${limit} files`, { files: files.length, limit });
      if (files.length % WALK_REPORT === 0) onCount(files.length);
    }
    return folders;
  };
  // Level by level from the top, so each folder's rules are known before its folders are listed.
  const descend = async (level: readonly Folder_[]): Promise<void> => {
    if (level.length > 0) await descend((await inBatches(level, visit)).flat());
  };
  await descend([{ path: "", rules: [] }]);
  return files;
}
