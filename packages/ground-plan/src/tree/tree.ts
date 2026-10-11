import { LOT_AREA, MARGIN } from "../constants";
import { floorDiv, isqrt } from "../fixed/arithmetic";
import { compareKeys } from "../fixed/hash";
import { LAND_USES, WEIGHT_MILLE, classifyLandUse, lotCapacity, type LandUse } from "../land-use/land-use";
import type { FileEntry, Snapshot } from "../snapshot/snapshot";

/** The file a lot stands for: its oldest live member, keyed by the lot. */
export interface LotSeed {
  readonly key: string;
  readonly path: string;
  readonly use: LandUse;
  readonly firstSeen: number;
}

/** A folder of the town's tree, with its land demand in fixed units². */
export interface TreeNode {
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly firstSeen: number;
  readonly lots: readonly LotSeed[];
  readonly docs: number;
  readonly children: readonly TreeNode[];
  readonly massMille: number;
  readonly demand: number;
}

/** A shared lot: its key (its founding identity) and its member identities. */
export interface ShareRecord {
  readonly key: string;
  readonly members: readonly string[];
}

export type Shares = Readonly<Record<string, readonly ShareRecord[]>>;

export interface TreeOptions {
  readonly root: string;
  readonly exclude: readonly string[];
  readonly landUses: readonly LandUse[];
  readonly densityPct: number;
}

/** Land a neighbourhood needs for the given lot area: lots over density, plus a road margin round a square. */
export function landFor(lotArea: number, densityPct: number): number {
  if (lotArea <= 0) return 0;
  return (isqrt(floorDiv(lotArea * 100, densityPct)) + 2 * MARGIN) ** 2;
}

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const parentOf = (path: string) => (path.includes("/") ? folderOf(path) : "");
const byAge = <T extends { firstSeen: number; path: string }>(a: T, b: T) =>
  a.firstSeen - b.firstSeen || compareKeys(a.path, b.path);

interface Raw {
  files: { entry: FileEntry; use: LandUse }[];
  docs: number;
  kids: Set<string>;
}

/** Shares a folder's files into lots, remembering members; returns the lot seeds and the new share records. */
function shareLots(
  folder: string,
  files: readonly { entry: FileEntry; use: LandUse }[],
  shares: Shares,
  out: Record<string, ShareRecord[]>,
): LotSeed[] {
  const seeds: LotSeed[] = [];
  for (const use of LAND_USES) {
    const list = files.filter((f) => f.use === use);
    if (list.length === 0) continue;
    const capacity = lotCapacity(use);
    const live = new Map(list.map((f) => [f.entry.identity, f.entry]));
    const key = `${folder}|${use}`;
    const lots = (shares[key] ?? [])
      .map((lot) => ({ key: lot.key, members: lot.members.filter((m) => live.has(m)) }))
      .filter((lot) => lot.members.length > 0);
    const placed = new Set(lots.flatMap((lot) => lot.members));
    for (const { entry } of list) {
      if (placed.has(entry.identity)) continue;
      const open = lots.find((lot) => lot.members.length < capacity);
      if (open) open.members.push(entry.identity);
      else lots.push({ key: entry.identity, members: [entry.identity] });
    }
    out[key] = lots;
    for (const lot of lots) {
      const oldest = lot.members.map((m) => live.get(m)!).toSorted(byAge)[0]!;
      seeds.push({ key: lot.key, path: oldest.path, use, firstSeen: oldest.firstSeen });
    }
  }
  return seeds.toSorted(byAge);
}

/** A chain of folders without land of their own, each with one child, merged into its last folder. */
function collapseChain(node: TreeNode): TreeNode {
  let n = node;
  while (n.lots.length === 0 && n.docs === 0 && n.children.length === 1) {
    const child = n.children[0]!;
    n = {
      ...child,
      name: `${n.name}/${child.name}`,
      depth: n.depth,
      firstSeen: Math.min(n.firstSeen, child.firstSeen),
    };
  }
  return n;
}

/** The town's folder tree: lots shared, chains collapsed, mass and demand summed. Pure: shares are copied. */
export function buildTree(
  snapshot: Snapshot,
  options: TreeOptions,
  shares: Shares,
  useOf: (path: string) => LandUse = classifyLandUse,
): { tree: TreeNode; shares: Record<string, ShareRecord[]>; offLand: number; docs: number } {
  const { root, exclude, densityPct } = options;
  const takesLand = new Set(options.landUses);
  const prefix = root === "" ? "" : `${root}/`;
  const raw = new Map<string, Raw>();
  const get = (path: string): Raw => {
    let entry = raw.get(path);
    if (!entry) {
      entry = { files: [], docs: 0, kids: new Set() };
      raw.set(path, entry);
    }
    return entry;
  };
  get(root);
  let offLand = 0;
  let docs = 0;
  for (const entry of snapshot.files) {
    if (!entry.path.startsWith(prefix) || exclude.some((e) => entry.path.startsWith(`${e}/`))) continue;
    const use = useOf(entry.path);
    if (!takesLand.has(use)) {
      offLand++;
      continue;
    }
    const folder = folderOf(entry.path);
    if (use === "docs") {
      get(folder).docs++;
      docs++;
    } else get(folder).files.push({ entry, use });
    for (let f = folder; f !== root; f = parentOf(f)) get(parentOf(f)).kids.add(f);
  }
  const nextShares: Record<string, ShareRecord[]> = {};
  const make = (path: string, depth: number): TreeNode => {
    const entry = raw.get(path)!;
    const lots = shareLots(path, entry.files, shares, nextShares);
    const children = [...entry.kids].toSorted(compareKeys).map((kid) => make(kid, depth + 1));
    const ownMass = entry.files.reduce((sum, f) => sum + WEIGHT_MILLE[f.use], 0);
    return {
      path,
      name: path === root ? root || snapshot.repository : path.slice(path.lastIndexOf("/") + 1),
      depth,
      firstSeen: snapshot.folderFirstSeen.get(path) ?? 0,
      lots,
      docs: entry.docs,
      children,
      massMille: ownMass + children.reduce((sum, c) => sum + c.massMille, 0),
      demand:
        landFor(lots.length * LOT_AREA, densityPct) +
        landFor((entry.docs * LOT_AREA) / 2, densityPct) +
        children.reduce((sum, c) => sum + c.demand, 0),
    };
  };
  // Below the root, a folder with no land of its own and a single child merges into that child.
  const collapse = (node: TreeNode, isRoot: boolean): TreeNode => {
    const n = isRoot ? node : collapseChain(node);
    return { ...n, children: n.children.map((c) => collapse({ ...c, depth: n.depth + 1 }, false)) };
  };
  return { tree: collapse(make(root, 0), true), shares: nextShares, offLand, docs };
}
