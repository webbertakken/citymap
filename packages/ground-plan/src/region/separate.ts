// Separate towns: the kinds of folder whose members a setting lays as towns of their own.
import { compareKeys } from "../fixed/hash";
import type { Snapshot } from "../snapshot/snapshot";

/** The separations, in the spec's order: declared workspaces, submodules, then folders named by their kind. */
export const SEPARATIONS = [
  "workspaces",
  "submodules",
  "apps",
  "packages",
  "libs",
  "crates",
  "services",
  "modules",
  "extensions",
  "plugins",
] as const;
export type Separation = (typeof SEPARATIONS)[number];

/** Declared workspaces, submodules and apps stand apart unless a setting says otherwise. */
export const DEFAULT_SEPARATIONS: readonly Separation[] = ["workspaces", "submodules", "apps"];

/** Separations named by a folder of their own name at the root: its child folders are the members. */
export const ROOT_KINDS: readonly Separation[] = [
  "apps",
  "packages",
  "libs",
  "crates",
  "services",
  "modules",
  "extensions",
];

/** The separations declared workspaces decide while the workspaces separation is on. */
export const OVERRIDDEN: readonly Separation[] = ["apps", "packages"];

/** The one file an unread submodule is laid as, in its folder. */
export const GITLINK_FILE = ".gitlink";

export const isSeparation = (name: string): name is Separation => SEPARATIONS.some((s) => s === name);

/** The separations named, in `SEPARATIONS` order and once each; the defaults when none are named. */
export const separationList = (separate: readonly Separation[] | undefined): Separation[] =>
  SEPARATIONS.filter((s) => (separate ?? DEFAULT_SEPARATIONS).includes(s));

/** A folder laid as a town of its own, and the separation that names it. */
export interface SeparateMember {
  readonly folder: string;
  readonly by: Separation;
}

type Input = Pick<Snapshot, "files" | "workspaces" | "submodules">;

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const isPluginsFolder = (folder: string) => folder === "plugins" || folder.endsWith("/plugins");

/** True when the root manifests declare at least one workspace member. */
export const declaresWorkspaces = (snapshot: Pick<Snapshot, "workspaces">) => (snapshot.workspaces?.length ?? 0) > 0;

/** The folders that hold a file now: every ancestor of every file but the root. */
const heldFolders = new WeakMap<readonly unknown[], ReadonlySet<string>>();
function foldersOf(snapshot: Input): ReadonlySet<string> {
  const kept = heldFolders.get(snapshot.files);
  if (kept) return kept;
  const folders = new Set<string>();
  for (const { path } of snapshot.files)
    for (let f = folderOf(path); f !== "" && !folders.has(f); f = folderOf(f)) folders.add(f);
  heldFolders.set(snapshot.files, folders);
  return folders;
}

/** The folders of a set with no other folder of the set above them. */
function outermost(folders: readonly string[]): string[] {
  const set = new Set(folders);
  const nested = (folder: string) => {
    for (let up = folderOf(folder); up !== ""; up = folderOf(up)) if (set.has(up)) return true;
    return false;
  };
  return folders.filter((f) => !nested(f));
}

/** One separation's candidate folders. */
function candidates(snapshot: Input, held: ReadonlySet<string>, s: Separation, overridden: boolean): string[] {
  if (s === "workspaces") return [...(snapshot.workspaces ?? [])];
  if (s === "submodules") return [...(snapshot.submodules ?? [])];
  if (overridden && OVERRIDDEN.includes(s)) return [];
  if (s === "plugins") return [...held].filter((f) => isPluginsFolder(folderOf(f)));
  return [...held].filter((f) => folderOf(f) === s);
}

/** The folders the separations on lay apart, each once, sorted. */
export function separateMembers(snapshot: Input, separate?: readonly Separation[]): SeparateMember[] {
  const list = separationList(separate);
  const held = foldersOf(snapshot);
  const overridden = list.includes("workspaces") && declaresWorkspaces(snapshot);
  const byFolder = new Map<string, Separation>();
  for (const s of list) {
    const own = outermost([...new Set(candidates(snapshot, held, s, overridden))].filter((f) => held.has(f)));
    for (const folder of own) if (!byFolder.has(folder)) byFolder.set(folder, s);
  }
  return [...byFolder].map(([folder, by]) => ({ folder, by })).toSorted((a, b) => compareKeys(a.folder, b.folder));
}

/** The separations that, each alone, lay something apart: the ones a viewer offers for this city. */
export const separable = (snapshot: Input): Separation[] =>
  SEPARATIONS.filter((s) => separateMembers(snapshot, [s]).length > 0);

/**
 * The separations a bundled variant is named by: those on that the city records, except that while declared workspaces
 * decide (workspaces on, the city declaring them) apps and packages take their defaults.
 */
export function effectiveSeparations(
  separate: readonly Separation[] | undefined,
  recorded: readonly Separation[],
  declared: boolean,
): Separation[] {
  const on = separationList(separate);
  const decided = declared && on.includes("workspaces");
  return recorded.filter((s) => (decided && OVERRIDDEN.includes(s) ? DEFAULT_SEPARATIONS.includes(s) : on.includes(s)));
}

/** Every state of the recorded separations a viewer can name, each once: the variants a bundled city lays. */
export function separationStates(recorded: readonly Separation[], declared: boolean): Separation[][] {
  const subsets = Array.from({ length: 2 ** recorded.length }, (_unused, mask) =>
    recorded.filter((_separation, bit) => (mask >> bit) & 1),
  );
  return subsets.filter((state) => effectiveSeparations(state, recorded, declared).join() === state.join());
}
