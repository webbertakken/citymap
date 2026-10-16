import type { Form } from "../archetype/forms";
import type { Town } from "../city/city";
import { mulDiv } from "../fixed/arithmetic";
import { fnv1a } from "../fixed/hash";
import { area2, type Pt } from "../fixed/polygon";
import { densify, memoised, warper } from "../fixed/warp";
import type { TownPlat } from "../plat/plat";
import type { TreeNode } from "../tree/tree";
import { loopConnectors } from "./connectors";
import {
  seedsOf,
  tint,
  toPoly,
  type Ctx,
  type LayHooks,
  type LayoutOptions,
  type PlatEvent,
  type TownCache,
} from "./context";
import { diameterOf } from "./cut";
import { partition } from "./partition";

export interface LaidTown {
  readonly town: Town;
  readonly plat: TownPlat;
  readonly events: readonly PlatEvent[];
}

const LABEL_MILLE = 15;

/** Warps last from lay to lay: one memoised warp per town and diameter, the oldest dropped beyond a bound. */
const WARPS = new Map<string, (q: Pt) => Pt>();
const WARP_TOWNS = 64;
const WARP_POINTS = 2 ** 21;
function warpOf(key: string, diameter: number, make: () => (q: Pt) => Pt): (q: Pt) => Pt {
  const id = `${key}|${diameter}`;
  const known = WARPS.get(id);
  if (known) return known;
  if (WARPS.size >= WARP_TOWNS) WARPS.delete(WARPS.keys().next().value!);
  const warp = memoised(make(), WARP_POINTS);
  WARPS.set(id, warp);
  return warp;
}

/** The organic layer: one smooth warp per town, scaled by its remembered diameter; it never feeds back. */
function warpTown(ctx: Ctx, key: string, outline: readonly Pt[]) {
  if (ctx.plat.diameter === 0) ctx.plat.diameter = diameterOf(ctx.landArea2);
  const diameter = ctx.plat.diameter;
  const warp = warpOf(key, diameter, () =>
    warper(fnv1a(key), [
      [32, 1280],
      [mulDiv(diameter, 15, 1000, "floor"), Math.max(1, mulDiv(diameter, 350, 1000, "floor"))],
      [mulDiv(diameter, 70, 1000, "floor"), Math.max(1, mulDiv(diameter, 1100, 1000, "floor"))],
    ]),
  );
  const bend = (pts: readonly Pt[], closed: boolean, step: number) => densify(pts, step, closed).map(warp);
  // The town's seeds count as shaped a quarter at a time, as its four kinds of shape are bent.
  const seeds = ctx.hooks ? seedsOf(ctx.root) : 0;
  const quarter = Math.floor(seeds / 4);
  const outlineBent = bend(outline, true, 80);
  const roads = ctx.roads.map((r) => ({ ...r, pts: bend(r.pts, false, 48) }));
  ctx.hooks?.shaped(quarter);
  const blocks = ctx.blocks.map((b) => ({ ...b, pts: bend(b.pts, true, 64) }));
  ctx.hooks?.shaped(quarter);
  const lots = ctx.lots.map((l) => ({ ...l, pts: l.pts.map(warp) }));
  ctx.hooks?.shaped(quarter);
  const districts = ctx.districts.map((d) => ({ ...d, pts: bend(d.pts, true, 80) }));
  const water = ctx.water.map((w) => bend(w, true, 64));
  ctx.hooks?.shaped(seeds - 3 * quarter);
  return { outline: outlineBent, roads, blocks, lots, districts, water };
}

/** Lays out one town on its outline. Pure: the plat given is copied, and the new plat returned. */
export function layoutTown(
  name: string,
  key: string,
  root: TreeNode,
  outline: readonly Pt[],
  plat: TownPlat,
  options: LayoutOptions,
  rootForm?: Form,
  cache?: TownCache,
  hooks?: LayHooks,
): LaidTown {
  // A town's cached folders hold only while its constants do: its options, its land and its root.
  const landArea2 = area2(outline);
  const constants = `${options.order}|${options.jog}|${options.densityPct}|${landArea2}|${root.path}`;
  if (cache && cache.constants !== constants) {
    cache.constants = constants;
    cache.entries.clear();
  }
  const ctx: Ctx = {
    options,
    // Layout never changes a town's shares (its tree made them): they are kept, and the rest copied.
    plat: { ...structuredClone({ ...plat, shares: {} }), shares: plat.shares },
    root,
    rootForm,
    events: [],
    roads: [],
    blocks: [],
    lots: [],
    districts: [],
    water: [],
    landArea2,
    cache,
    hooks,
    form: "neighbourhood",
    overflow: 0,
    lotArea2: 0,
  };
  partition(ctx, root, toPoly(outline), "");
  // Dead ends near each other are joined by lanes through open ground only.
  if (options.loops ?? true)
    ctx.roads.push(
      ...loopConnectors(ctx.roads, [...ctx.lots.map((l) => l.pts), ...ctx.blocks.map((b) => b.pts)], outline),
    );
  if (!options.warp) hooks?.shaped(seedsOf(root));
  const laid = options.warp
    ? warpTown(ctx, key, outline)
    : {
        outline: [...outline],
        roads: ctx.roads,
        blocks: ctx.blocks,
        lots: ctx.lots,
        districts: ctx.districts,
        water: ctx.water,
      };
  const town: Town = {
    key,
    name,
    form: ctx.form,
    old: false,
    outline: laid.outline,
    water: laid.water,
    roads: laid.roads,
    blocks: laid.blocks.map((b) => ({ ...b, district: tint(b.district) })),
    lots: laid.lots.map((l) => ({ ...l, district: tint(l.district) })),
    // A folder is labelled when it is top-level or holds at least 15 ‰ of the town's mass; wards always.
    districts: laid.districts.filter(
      (d) => d.ward || d.depth === 1 || d.massMille * 1000 >= LABEL_MILLE * root.massMille,
    ),
    stats: {
      lots: ctx.lots.filter((l) => !l.vacant).length,
      overflow: ctx.overflow,
      offLand: 0,
      docs: 0,
      lotArea2: ctx.lotArea2,
      landArea2: ctx.landArea2,
    },
  };
  return { town, plat: ctx.plat, events: ctx.events };
}
