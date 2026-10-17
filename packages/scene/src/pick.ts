import {
  UNIT,
  roadWidth,
  type BlockKind,
  type City,
  type Form,
  type LandUse,
  type Pt,
  type RoadClass,
  type Town,
} from "@citymap/ground-plan";
import { folderOf, parseAddress } from "./address";

/** The town a hit lies in: its name, its key, and the folder it is laid from (`root`). */
interface InTown {
  readonly town: string;
  readonly townKey: string;
  readonly root: string;
}

/** What lies under a point of the map: the topmost thing there, with what a card needs to say what it is. */
export type Hit =
  | (InTown & {
      readonly kind: "lot";
      /** The lot's key: with its town's, it names the lot's building and measures. */
      readonly key: string;
      /** The file's path; empty for a vacant lot. */
      readonly path: string;
      readonly use: LandUse;
      readonly address: string;
      readonly vacant: boolean;
      /** The file's folder; for a vacant lot, its address's folder. Empty at the top. */
      readonly folder: string;
      /** The live lots whose folder is `folder`. */
      readonly folderLots: number;
    })
  | (InTown & {
      readonly kind: "block";
      readonly block: BlockKind;
      /** The deepest folder the city records round it (its smallest labelled district), else the town's root. */
      readonly folder: string;
    })
  | {
      readonly kind: "road";
      readonly town: string | null;
      readonly townKey: string | null;
      readonly root: string | null;
      readonly cls: RoadClass;
      /** For a highway, the towns nearest its two ends (one name when both are one town); empty for a town's road. */
      readonly joins: readonly string[];
    }
  | (InTown & {
      readonly kind: "district";
      /** The folder's name. */
      readonly district: string;
      readonly path: string;
      readonly form: Form | null;
      /** Live lots at or below the folder. */
      readonly lots: number;
      /** Folders below it that hold lots, or lead to folders that do. */
      readonly folders: number;
    })
  | (InTown & {
      readonly kind: "town";
      readonly form: Form;
      readonly old: boolean;
      readonly lots: number;
      /** Its top-level labelled districts. */
      readonly districts: number;
    });

interface Entry {
  readonly layer: 0 | 1 | 2 | 3 | 4;
  readonly pts: readonly Pt[];
  readonly box: readonly [number, number, number, number];
  readonly hit: (p: Pt, folder: string | null) => Hit | null;
  readonly area: number;
  /** A district's path. */
  readonly path: string;
}

/** A grid over the city, listing per cell what may lie there, and every labelled folder's hit by town and path. */
export interface PickIndex {
  readonly cells: ReadonlyMap<string, readonly Entry[]>;
  readonly folders: ReadonlyMap<string, Hit>;
}

/** Cells of 8 street widths, in fixed units. */
const CELL = 8 * UNIT;

const boxOf = (pts: readonly Pt[], pad = 0): [number, number, number, number] => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};

/** Ray casting: true when p lies inside the polygon (any shape). */
function inside(p: Pt, pts: readonly Pt[]): boolean {
  let within = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
}

/** Distance from p to the segment a-b. */
function distance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from p to a polygon: 0 inside, else to its nearest edge. */
const away = (p: Pt, pts: readonly Pt[]) =>
  inside(p, pts) ? 0 : Math.min(...pts.map((a, i) => distance(p, a, pts[(i + 1) % pts.length]!)));

const area = (pts: readonly Pt[]) => {
  const [x0, y0, x1, y1] = boxOf(pts);
  return (x1 - x0) * (y1 - y0);
};

/** The folder a town is laid from: empty for the main town and its old towns, else the member's path. */
export function townRoot(city: Pick<City, "repository">, town: Pick<Town, "key">): string {
  const prefix = `${city.repository}/`;
  return town.key.startsWith(prefix) ? town.key.slice(prefix.length).replace(/ old town( \d+)?$/, "") : "";
}

/** The folders above a path, nearest first, down to the top (""). */
function* ancestors(folder: string): Generator<string> {
  for (let f = folder; f !== "";) {
    f = folderOf(f);
    yield f;
  }
}

/** Live lots per folder, directly and at or below it, and the folders below each that lead to lots. */
function countsOf(town: Town) {
  const direct = new Map<string, number>();
  for (const lot of town.lots)
    if (!lot.vacant) direct.set(folderOf(lot.path), (direct.get(folderOf(lot.path)) ?? 0) + 1);
  const below = new Map<string, number>();
  const leading = new Set<string>();
  for (const [folder, n] of direct) {
    below.set(folder, (below.get(folder) ?? 0) + n);
    leading.add(folder);
    for (const a of ancestors(folder)) {
      below.set(a, (below.get(a) ?? 0) + n);
      leading.add(a);
    }
  }
  const folders = new Map<string, number>();
  for (const folder of leading) for (const a of ancestors(folder)) folders.set(a, (folders.get(a) ?? 0) + 1);
  return { direct, below, folders };
}

/** Builds the picking grid for a city: lots, blocks, roads, districts and towns by their bounding boxes. */
export function pickIndex(city: City): PickIndex {
  const entries: Entry[] = [];
  const folderHits = new Map<string, Hit>();
  const polygon = (layer: Entry["layer"], pts: readonly Pt[], path: string, hit: Entry["hit"]) =>
    entries.push({
      layer,
      pts,
      box: boxOf(pts),
      hit: (p, f) => (inside(p, pts) ? hit(p, f) : null),
      area: area(pts),
      path,
    });
  const road = (pts: readonly Pt[], width: number, hit: Hit) => {
    const half = width / 2;
    entries.push({
      layer: 2,
      pts,
      box: boxOf(pts, half),
      hit: (p) => (pts.some((a, i) => i > 0 && distance(p, pts[i - 1]!, a) <= half) ? hit : null),
      area: 0,
      path: "",
    });
  };
  for (const t of city.towns) {
    const where: InTown = { town: t.name, townKey: t.key, root: townRoot(city, t) };
    const counts = countsOf(t);
    for (const lot of t.lots) {
      const folder = lot.vacant ? (parseAddress(lot.address)?.folder ?? where.root) : folderOf(lot.path);
      const hit: Hit = {
        kind: "lot",
        ...where,
        key: lot.key,
        path: lot.path,
        use: lot.use,
        address: lot.address,
        vacant: lot.vacant,
        folder,
        folderLots: counts.direct.get(folder) ?? 0,
      };
      polygon(0, lot.pts, "", () => hit);
    }
    for (const b of t.blocks)
      polygon(1, b.pts, "", (_, folder) => ({ kind: "block", ...where, block: b.kind, folder: folder ?? where.root }));
    for (const r of t.roads) road(r.pts, roadWidth(r), { kind: "road", ...where, cls: r.cls, joins: [] });
    for (const d of t.districts.filter((x) => !x.ward)) {
      const hit: Hit = {
        kind: "district",
        ...where,
        district: d.name,
        path: d.path,
        form: d.form ?? null,
        lots: counts.below.get(d.path) ?? 0,
        folders: counts.folders.get(d.path) ?? 0,
      };
      folderHits.set(`${t.key}\n${d.path}`, hit);
      polygon(3, d.pts, d.path, () => hit);
    }
    const town: Hit = {
      kind: "town",
      ...where,
      form: t.form,
      old: t.old,
      lots: t.stats.lots,
      districts: t.districts.filter((d) => !d.ward && d.depth === 1).length,
    };
    polygon(4, t.outline, "", () => town);
  }
  const nearest = (p: Pt) =>
    city.towns.reduce<{ name: string; d: number } | null>((best, t) => {
      const d = away(p, t.outline);
      return best && best.d <= d ? best : { name: t.name, d };
    }, null)?.name;
  for (const h of city.highways) {
    const ends = [nearest(h.pts[0]!), nearest(h.pts.at(-1)!)].filter((name) => name !== undefined);
    road(h.pts, roadWidth(h), {
      kind: "road",
      town: null,
      townKey: null,
      root: null,
      cls: h.cls,
      joins: [...new Set(ends)],
    });
  }
  const cells = new Map<string, Entry[]>();
  for (const e of entries)
    for (let cx = Math.floor(e.box[0] / CELL); cx <= Math.floor(e.box[2] / CELL); cx++)
      for (let cy = Math.floor(e.box[1] / CELL); cy <= Math.floor(e.box[3] / CELL); cy++) {
        const key = `${cx},${cy}`;
        const list = cells.get(key);
        if (list) list.push(e);
        else cells.set(key, [e]);
      }
  return { cells, folders: folderHits };
}

/** The hit of a labelled folder, by its town's key and its path: what a search for it selects. Null when unknown. */
export const folderHit = (index: PickIndex, townKey: string, path: string): Hit | null =>
  index.folders.get(`${townKey}\n${path}`) ?? null;

/** The topmost thing at a map point (scene units): a lot, else a block, a road, a district, a town; or null. */
export function pick(index: PickIndex, x: number, z: number): Hit | null {
  const p = { x: x * UNIT, y: -z * UNIT };
  const here = (index.cells.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`) ?? []).filter(
    (e) => p.x >= e.box[0] && p.x <= e.box[2] && p.y >= e.box[1] && p.y <= e.box[3],
  );
  // The smallest district holding the point is the deepest folder the city records there, for blocks.
  const folder =
    here.filter((e) => e.layer === 3 && inside(p, e.pts)).toSorted((a, b) => a.area - b.area)[0]?.path ?? null;
  for (const layer of [0, 1, 2, 3, 4] as const) {
    const candidates = here.filter((e) => e.layer === layer);
    const ordered = layer === 3 ? candidates.toSorted((a, b) => a.area - b.area) : candidates;
    for (const e of ordered) {
      const hit = e.hit(p, folder);
      if (hit) return hit;
    }
  }
  return null;
}
