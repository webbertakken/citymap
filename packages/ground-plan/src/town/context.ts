import type { DistrictForm, Form } from "../archetype/forms";
import type { Block, District, Road } from "../city/city";
import type { RoadClass } from "../constants";
import { fnv1a } from "../fixed/hash";
import type { Poly, Pt } from "../fixed/polygon";
import type { LandUse } from "../land-use/land-use";
import type { TownPlat } from "../plat/plat";
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
  | { kind: "park"; key: string; demand: number; massMille: number; firstSeen: number; district: string };

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

/** The mutable state of laying out one town. */
export interface Ctx {
  readonly options: LayoutOptions;
  readonly plat: TownPlat;
  readonly root: TreeNode;
  readonly rootForm: Form | undefined;
  readonly events: PlatEvent[];
  readonly roads: Road[];
  readonly blocks: DraftBlock[];
  readonly lots: DraftLot[];
  readonly districts: District[];
  readonly water: Pt[][];
  readonly landArea2: number;
  readonly cache: TownCache | undefined;
  form: Form;
  overflow: number;
  lotArea2: number;
}

export const emit = (ctx: Ctx, code: string, detail: Record<string, string | number>) =>
  ctx.events.push({ code, detail });

export const road = (ctx: Ctx, pts: readonly Pt[] | null, cls: RoadClass) => {
  if (pts) ctx.roads.push({ pts: [...pts], cls });
};

export const massOf = (items: readonly Item[]) => items.reduce((sum, i) => sum + i.massMille, 0);
export const demandOf = (items: readonly Item[]) => items.reduce((sum, i) => sum + i.demand, 0);

/** A district's tint seed: its key without pinwheel separators. */
export const seedKey = (key: string) => key.replaceAll(">", "");

/** True when key belongs to the folder at path (the folder itself, its descendants, or its sub-keys). */
export const owned = (key: string, path: string) =>
  path === "" || key === path || key.startsWith(`${path}/`) || key.startsWith(`${path}>`) || key.startsWith(`${path}#`);

/** Drops every remembered cut, grid and radial layout of the folder at path. */
export function forget(ctx: Ctx, path: string) {
  let count = 0;
  for (const records of [ctx.plat.cuts, ctx.plat.grids, ctx.plat.radial] as Record<string, unknown>[])
    for (const key of Object.keys(records))
      if (owned(key, path)) {
        delete records[key];
        count++;
      }
  if (count > 0) emit(ctx, "plat/forget", { key: path, count });
}

export const tint = (district: string) => fnv1a(district);

export const toPoly = (pts: readonly Pt[], width = 0): Poly => ({ p: pts, w: pts.map(() => width) });
