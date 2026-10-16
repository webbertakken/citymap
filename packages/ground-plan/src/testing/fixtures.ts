// Test fixtures: synthetic repositories as snapshots and trees.
import { compareKeys } from "../fixed/hash";
import type { Poly } from "../fixed/polygon";
import { DEFAULT_LAND_USES } from "../land-use/land-use";
import { emptyTownPlat } from "../plat/plat";
import type { FileEntry, Snapshot } from "../snapshot/snapshot";
import type { Ctx } from "../town/context";
import { buildTree, type Shares, type TreeNode } from "../tree/tree";

/** n source files in a folder, born at increasing indices from `born`. */
export const files = (folder: string, n: number, born = 0, ext = "ts", stem = "f"): FileEntry[] =>
  Array.from({ length: n }, (_, i) => {
    const path = `${folder ? `${folder}/` : ""}${stem}${String(i).padStart(4, "0")}.${ext}`;
    return { path, identity: `${path}@${born + i}`, firstSeen: born + i };
  });

export function snapshotOf(
  entries: readonly FileEntry[],
  folders: Record<string, number> = {},
  repository = "demo",
): Snapshot {
  return {
    repository,
    commit: "worktree",
    index: 0,
    files: entries.toSorted((a, b) => compareKeys(a.path, b.path)),
    folderFirstSeen: new Map(Object.entries(folders)),
  };
}

export function treeOf(
  entries: readonly FileEntry[],
  folders: Record<string, number> = {},
  shares: Shares = {},
): TreeNode {
  return buildTree(
    snapshotOf(entries, folders),
    { root: "", exclude: [], landUses: DEFAULT_LAND_USES, densityPct: 50 },
    shares,
  ).tree;
}

/** An empty layout context, for laying single neighbourhoods and items directly. */
export function emptyCtx(root: TreeNode = treeOf([]), landArea2 = 0): Ctx {
  return {
    options: { order: "centre-out", jog: "top-level", warp: false, densityPct: 50 },
    plat: emptyTownPlat(),
    root,
    rootForm: undefined,
    events: [],
    roads: [],
    blocks: [],
    lots: [],
    districts: [],
    water: [],
    landArea2,
    cache: undefined,
    hooks: undefined,
    form: "neighbourhood",
    overflow: 0,
    lotArea2: 0,
  };
}

/** An axis-aligned rectangle as a polygon. */
export const rect = (w: number, h: number): Poly => ({
  p: [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ],
  w: [0, 0, 0, 0],
});
