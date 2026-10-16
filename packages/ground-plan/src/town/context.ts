import type { DistrictForm, Form } from "../archetype/forms";
import type { Toggle } from "../archetype/toggles";
import type { Block, District, Road } from "../city/city";
import type { RoadClass } from "../constants";
import { fnv1a } from "../fixed/hash";
import type { Poly, Pt } from "../fixed/polygon";
import type { LandUse } from "../land-use/land-use";
import type { TownPlat } from "../plat/plat";
import type { TierRule } from "../roads";
import type { LotSeed, TreeNode } from "../tree/tree";

/** A decision the layout made, for logs: a stable code and its detail. */
export interface PlatEvent {
  readonly code: string;
  readonly detail: Readonly<Record<string, string | number>>;
}

export interface LayoutOptions {
  readonly order: "centre-out" | "first-seen";
  readonly jog: "off" | "top-level" | "all";
  readonly warp: boolean;
  readonly densityPct: number;
  /** Lanes joining nearby dead ends (on unless false). */
  readonly loops?: boolean;
  /** The archetype toggles on; `DEFAULT_TOGGLES` when absent. */
  readonly toggles?: readonly Toggle[];
}

/** What a folder's land is cut between: a child folder, the folder's own lots, or its own park. */
export type Item =
  | { kind: "folder"; key: string; demand: number; massMille: number; firstSeen: number; node: TreeNode }
  | {
      kind: "lots";
      key: string;
      demand: number;
      massMille: number;
      firstSeen: number;
      lots: readonly LotSeed[];
      district: string;
    }
  | { kind: "park"; key: string; demand: number; massMille: number; firstSeen: number; district: string }
  /** Items laid together: an archipelago's island of several packages, or its mainland. */
  | { kind: "group"; key: string; demand: number; massMille: number; firstSeen: number; items: readonly Item[] }
  /** A planned quarter of small folders, cut square to its own frame. */
  | { kind: "quarter"; key: string; demand: number; massMille: number; firstSeen: number; items: readonly Item[] };

/** A lot as laid, before tints are hashed. */
export interface DraftLot {
  pts: Pt[];
  key: string;
  address: string;
  vacant: boolean;
  path: string;
  use: LandUse;
  district: string;
  form?: DistrictForm;
}

export interface DraftBlock {
  pts: Pt[];
  district: string;
  kind: Block["kind"];
  form?: DistrictForm;
}

/** What laying out one folder appended, to replay when nothing about it changed. */
export interface CacheEntry {
  readonly key: string;
  readonly roads: readonly Road[];
  readonly blocks: readonly DraftBlock[];
  readonly lots: readonly DraftLot[];
  readonly districts: readonly District[];
  readonly water: readonly Pt[][];
  readonly canals: readonly Pt[][];
  readonly overflow: number;
  readonly lotArea2: number;
  readonly overflowEvents: readonly PlatEvent[];
}

/** One town's locality cache: per folder path, its last layout; valid while the town's constants hold. */
export interface TownCache {
  constants: string;
  readonly entries: Map<string, CacheEntry>;
  hits: number;
}

/** Who hears how far a lay has come, in lot seeds: placed by a neighbourhood, then shaped by the warp. */
export interface LayHooks {
  readonly placed: (seeds: number) => void;
  readonly shaped: (seeds: number) => void;
}

/** The lot seeds of a folder and everything in it. */
export const seedsOf = (node: TreeNode): number => node.children.reduce((sum, c) => sum + seedsOf(c), node.lots.length);

/** The mutable state of laying out one town. */
export interface Ctx {
  readonly options: LayoutOptions;
  /** The archetype toggles on, in their own order. */
  readonly toggles: readonly Toggle[];
  /** The town's tier as its roads read it, when tiers are on. */
  readonly tier: TierRule | undefined;
  readonly plat: TownPlat;
  readonly root: TreeNode;
  readonly rootForm: Form | undefined;
  readonly events: PlatEvent[];
  readonly roads: Road[];
  readonly blocks: DraftBlock[];
  readonly lots: DraftLot[];
  readonly districts: District[];
  readonly water: Pt[][];
  readonly canals: Pt[][];
  readonly landArea2: number;
  readonly cache: TownCache | undefined;
  readonly hooks: LayHooks | undefined;
  form: Form;
  overflow: number;
  lotArea2: number;
}

export const emit = (ctx: Ctx, code: string, detail: Record<string, string | number>) =>
  ctx.events.push({ code, detail });

export const road = (ctx: Ctx, pts: readonly Pt[] | null, cls: RoadClass, width?: number) => {
  if (pts) ctx.roads.push(width === undefined ? { pts: [...pts], cls } : { pts: [...pts], cls, width });
};

export const massOf = (items: readonly Item[]) => items.reduce((sum, i) => sum + i.massMille, 0);
export const demandOf = (items: readonly Item[]) => items.reduce((sum, i) => sum + i.demand, 0);

/** A district's tint seed: its key without pinwheel separators. */
export const seedKey = (key: string) => key.replaceAll(">", "");

/** True when key belongs to the folder at path (the folder itself, its descendants, or its sub-keys). */
export const owned = (key: string, path: string) =>
  path === "" || key === path || key.startsWith(`${path}/`) || key.startsWith(`${path}>`) || key.startsWith(`${path}#`);

/** Drops every remembered cut, grid, radial layout, island and quarter of the folder at path. */
export function forget(ctx: Ctx, path: string) {
  let count = 0;
  const { plat } = ctx;
  const records: Record<string, unknown>[] = [plat.cuts, plat.grids, plat.radial];
  if (plat.islands) records.push(plat.islands);
  if (plat.quarters) records.push(plat.quarters);
  for (const record of records)
    for (const key of Object.keys(record))
      if (owned(key, path)) {
        delete record[key];
        count++;
      }
  // The toggles' records are present only while they hold something.
  if (plat.islands && Object.keys(plat.islands).length === 0) delete plat.islands;
  if (plat.quarters && Object.keys(plat.quarters).length === 0) delete plat.quarters;
  if (count > 0) emit(ctx, "plat/forget", { key: path, count });
}

export const tint = (district: string) => fnv1a(district);

export const toPoly = (pts: readonly Pt[], width = 0): Poly => ({ p: pts, w: pts.map(() => width) });
