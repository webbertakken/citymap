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

const areaOf = (pts: readonly Pt[]) => {
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

/** What an entry is, and the order a point looks through them: 0 lot, 1 block, 2 road, 3 district, 4 town. */
type Layer = 0 | 1 | 2 | 3 | 4;
const LAYERS = [0, 1, 2, 3, 4] as const;
const LOT = 0;
const BLOCK = 1;
const ROAD = 2;
const DISTRICT = 3;
const TOWN = 4;

/**
 * The pick index's data: typed arrays only, so the layout worker builds it and hands it over without a copy
 * (`pickBuffers`). Entries are numbered per town (its lots, blocks, roads, labelled districts, then its outline), then
 * the highways; each column holds one slot per entry (`box` four, `ends` two).
 */
export interface PickGrid {
  readonly layer: Uint8Array<ArrayBuffer>;
  /** The entry's town, by its index in `city.towns`; −1 for a highway. */
  readonly town: Int32Array<ArrayBuffer>;
  /** Its index in the town's lots, blocks, roads or districts (wards counted), or in `city.highways`; 0 for a town. */
  readonly item: Uint32Array<ArrayBuffer>;
  /** x0, y0, x1, y1 in fixed units; a road's grown by half its width. */
  readonly box: Float64Array<ArrayBuffer>;
  /** The bounding box's area: the smallest district holding a point is the deepest folder there. */
  readonly area: Float64Array<ArrayBuffer>;
  /** A lot's folder's live lots; a district's live lots at or below it. */
  readonly lots: Uint32Array<ArrayBuffer>;
  /** A district's folders below it that lead to lots; a town's top-level labelled districts. */
  readonly folders: Uint32Array<ArrayBuffer>;
  /** A highway's towns nearest its two ends, by index in `city.towns`; −1 for none. */
  readonly ends: Int32Array<ArrayBuffer>;
  /** The first cell's column and row (`floor(coordinate / CELL)`), and how many of each the grid holds. */
  readonly column0: number;
  readonly row0: number;
  readonly columns: number;
  readonly rows: number;
  /** Cell c lists the entries `members[starts[c]]` to `members[starts[c + 1] − 1]`, in entry order. */
  readonly starts: Uint32Array<ArrayBuffer>;
  readonly members: Uint32Array<ArrayBuffer>;
}

/**
 * A grid over the city, answering what lies at a point: the grid's data, the city it was built from, the one town that
 * answers (`only`, its index; null for every town), and every labelled folder's entry by town and path. Hits are made
 * from the city on demand and kept (`hits`, shared by every view of the same grid).
 */
export interface PickIndex {
  readonly city: City;
  readonly grid: PickGrid;
  readonly only: number | null;
  readonly folders: ReadonlyMap<string, number>;
  readonly hits: Map<number, Hit>;
}

/** Cells of 8 street widths, in fixed units. */
const CELL = 8 * UNIT;

/** How many entries the grid lists for a city. */
const entriesIn = (city: City) =>
  city.towns.reduce(
    (n, t) => n + t.lots.length + t.blocks.length + t.roads.length + t.districts.filter((d) => !d.ward).length + 1,
    city.highways.length,
  );

/** The index of the town whose outline lies nearest a point (the first, on a tie), or −1 without towns. */
const nearestTown = (city: City, p: Pt) =>
  city.towns.reduce<{ index: number; d: number }>(
    (best, t, index) => {
      const d = away(p, t.outline);
      return best.index >= 0 && best.d <= d ? best : { index, d };
    },
    { index: -1, d: Infinity },
  ).index;

/** Builds the pick index's data for a city: every lot, block, road, district and town by its bounding box. */
export function pickGrid(city: City): PickGrid {
  const n = entriesIn(city);
  const layer = new Uint8Array(n);
  const town = new Int32Array(n);
  const item = new Uint32Array(n);
  const box = new Float64Array(4 * n);
  const area = new Float64Array(n);
  const lots = new Uint32Array(n);
  const folders = new Uint32Array(n);
  const ends = new Int32Array(2 * n).fill(-1);
  let e = 0;
  const add = (kind: Layer, t: number, i: number, bounds: readonly number[]) => {
    layer[e] = kind;
    town[e] = t;
    item[e] = i;
    box.set(bounds, 4 * e);
    return e++;
  };
  const polygon = (kind: Layer, t: number, i: number, pts: readonly Pt[]) => {
    const at = add(kind, t, i, boxOf(pts));
    area[at] = areaOf(pts);
    return at;
  };
  city.towns.forEach((t, ti) => {
    const counts = countsOf(t);
    const root = townRoot(city, t);
    t.lots.forEach((lot, i) => {
      const folder = lot.vacant ? (parseAddress(lot.address)?.folder ?? root) : folderOf(lot.path);
      lots[polygon(LOT, ti, i, lot.pts)] = counts.direct.get(folder) ?? 0;
    });
    t.blocks.forEach((b, i) => polygon(BLOCK, ti, i, b.pts));
    t.roads.forEach((r, i) => add(ROAD, ti, i, boxOf(r.pts, roadWidth(r) / 2)));
    t.districts.forEach((d, i) => {
      if (d.ward) return;
      const at = polygon(DISTRICT, ti, i, d.pts);
      lots[at] = counts.below.get(d.path) ?? 0;
      folders[at] = counts.folders.get(d.path) ?? 0;
    });
    folders[polygon(TOWN, ti, 0, t.outline)] = t.districts.filter((d) => !d.ward && d.depth === 1).length;
  });
  city.highways.forEach((h, i) => {
    const at = add(ROAD, -1, i, boxOf(h.pts, roadWidth(h) / 2));
    ends[2 * at] = nearestTown(city, h.pts[0]!);
    ends[2 * at + 1] = nearestTown(city, h.pts.at(-1)!);
  });
  return { layer, town, item, box, area, lots, folders, ends, ...cellsOf(box, n) };
}

/** The cells (columns, rows) an entry's box touches; empty for a shape without points. */
const spanOf = (box: Float64Array, e: number) => ({
  c0: Math.floor(box[4 * e]! / CELL),
  r0: Math.floor(box[4 * e + 1]! / CELL),
  c1: Math.floor(box[4 * e + 2]! / CELL),
  r1: Math.floor(box[4 * e + 3]! / CELL),
});

/** A dense grid over the cells the entries touch, listing per cell its entries in order. */
function cellsOf(box: Float64Array, n: number) {
  let [column0, row0, columnEnd, rowEnd] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let e = 0; e < n; e++) {
    const { c0, r0, c1, r1 } = spanOf(box, e);
    if (c0 > c1 || r0 > r1) continue;
    column0 = Math.min(column0, c0);
    row0 = Math.min(row0, r0);
    columnEnd = Math.max(columnEnd, c1);
    rowEnd = Math.max(rowEnd, r1);
  }
  if (column0 > columnEnd)
    return { column0: 0, row0: 0, columns: 0, rows: 0, starts: new Uint32Array(1), members: new Uint32Array(0) };
  const columns = columnEnd - column0 + 1;
  const rows = rowEnd - row0 + 1;
  // Each entry's cells, visited twice: once to count each cell's entries, once to list them.
  const visit = (each: (cell: number, e: number) => void) => {
    for (let e = 0; e < n; e++) {
      const { c0, r0, c1, r1 } = spanOf(box, e);
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) each((r - row0) * columns + (c - column0), e);
    }
  };
  const starts = new Uint32Array(columns * rows + 1);
  visit((cell) => starts[cell + 1]!++);
  for (let c = 1; c < starts.length; c++) starts[c]! += starts[c - 1]!;
  const members = new Uint32Array(starts.at(-1)!);
  const filled = starts.slice(0, -1);
  visit((cell, e) => (members[filled[cell]!++] = e));
  return { column0, row0, columns, rows, starts, members };
}

/** Every buffer under the grid's columns, each once: what the worker transfers. */
export const pickBuffers = (grid: PickGrid): ArrayBuffer[] =>
  [
    grid.layer,
    grid.town,
    grid.item,
    grid.box,
    grid.area,
    grid.lots,
    grid.folders,
    grid.ends,
    grid.starts,
    grid.members,
  ].map((column) => column.buffer);

/**
 * Attaches a grid to the city it was built from (the same towns, in the same order): the index answers for every
 * town. Walks only the districts, to find a labelled folder by its town and path.
 */
export function pickFrom(city: City, grid: PickGrid): PickIndex {
  const folders = new Map<string, number>();
  for (let e = 0; e < grid.layer.length; e++)
    if (grid.layer[e] === DISTRICT) {
      const t = city.towns[grid.town[e]!]!;
      folders.set(`${t.key}\n${t.districts[grid.item[e]!]!.path}`, e);
    }
  return { city, grid, only: null, folders, hits: new Map() };
}

/** Builds the picking grid for a city and attaches it: lots, blocks, roads, districts and towns by their boxes. */
export const pickIndex = (city: City): PickIndex => pickFrom(city, pickGrid(city));

/**
 * The same index answering for one town alone, without highways: what the city with only that town would answer. A
 * key the city does not hold answers nothing. Labelled folders (`folderHit`) still answer for the whole city.
 */
export function onlyTown(index: PickIndex, townKey: string): PickIndex {
  return { ...index, only: index.city.towns.findIndex((t) => t.key === townKey) };
}

/** True when an entry's town answers in this index. */
const answers = (index: PickIndex, e: number) =>
  index.only === null || (index.only >= 0 && index.grid.town[e] === index.only);

/** The outline or line of an entry, in fixed units. */
function ptsOf({ city, grid }: PickIndex, e: number): readonly Pt[] {
  const item = grid.item[e]!;
  const t = city.towns[grid.town[e]!];
  switch (grid.layer[e]) {
    case LOT:
      return t!.lots[item]!.pts;
    case BLOCK:
      return t!.blocks[item]!.pts;
    case ROAD:
      return (t ? t.roads[item]! : city.highways[item]!).pts;
    case DISTRICT:
      return t!.districts[item]!.pts;
    default:
      return t!.outline;
  }
}

/** True when an entry's shape holds the point: inside its outline, or for a road within half its width of its line. */
function holds(index: PickIndex, e: number, p: Pt): boolean {
  const pts = ptsOf(index, e);
  if (index.grid.layer[e] !== ROAD) return inside(p, pts);
  const t = index.city.towns[index.grid.town[e]!];
  const half = roadWidth(t ? t.roads[index.grid.item[e]!]! : index.city.highways[index.grid.item[e]!]!) / 2;
  return pts.some((a, i) => i > 0 && distance(p, pts[i - 1]!, a) <= half);
}

/** An entry's hit, made from the city; `folder` is the deepest folder recorded at the point (for a block). */
function hitOf({ city, grid }: PickIndex, e: number, folder: string | null): Hit {
  const item = grid.item[e]!;
  const ti = grid.town[e]!;
  if (ti < 0) {
    const h = city.highways[item]!;
    const names = [grid.ends[2 * e]!, grid.ends[2 * e + 1]!].filter((i) => i >= 0).map((i) => city.towns[i]!.name);
    return { kind: "road", town: null, townKey: null, root: null, cls: h.cls, joins: [...new Set(names)] };
  }
  const t = city.towns[ti]!;
  const where: InTown = { town: t.name, townKey: t.key, root: townRoot(city, t) };
  switch (grid.layer[e]) {
    case LOT: {
      const lot = t.lots[item]!;
      return {
        kind: "lot",
        ...where,
        key: lot.key,
        path: lot.path,
        use: lot.use,
        address: lot.address,
        vacant: lot.vacant,
        folder: lot.vacant ? (parseAddress(lot.address)?.folder ?? where.root) : folderOf(lot.path),
        folderLots: grid.lots[e]!,
      };
    }
    case BLOCK:
      return { kind: "block", ...where, block: t.blocks[item]!.kind, folder: folder ?? where.root };
    case ROAD:
      return { kind: "road", ...where, cls: t.roads[item]!.cls, joins: [] };
    case DISTRICT: {
      const d = t.districts[item]!;
      return {
        kind: "district",
        ...where,
        district: d.name,
        path: d.path,
        form: d.form ?? null,
        lots: grid.lots[e]!,
        folders: grid.folders[e]!,
      };
    }
    default:
      return { kind: "town", ...where, form: t.form, old: t.old, lots: t.stats.lots, districts: grid.folders[e]! };
  }
}

/** An entry's hit, kept once made; a block's is made each time, as its folder depends on the point. */
function keptHit(index: PickIndex, e: number, folder: string | null): Hit {
  if (index.grid.layer[e] === BLOCK) return hitOf(index, e, folder);
  const kept = index.hits.get(e);
  if (kept) return kept;
  const hit = hitOf(index, e, null);
  index.hits.set(e, hit);
  return hit;
}

/** The hit of a labelled folder, by its town's key and its path: what a search for it selects. Null when unknown. */
export function folderHit(index: PickIndex, townKey: string, path: string): Hit | null {
  const e = index.folders.get(`${townKey}\n${path}`);
  return e === undefined ? null : keptHit(index, e, null);
}

/** The entries of the cell holding a point whose boxes hold it too, in entry order; none outside the grid. */
function entriesAt(index: PickIndex, p: Pt): number[] {
  const { grid } = index;
  const column = Math.floor(p.x / CELL) - grid.column0;
  const row = Math.floor(p.y / CELL) - grid.row0;
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return [];
  const cell = row * grid.columns + column;
  const here: number[] = [];
  for (let m = grid.starts[cell]!; m < grid.starts[cell + 1]!; m++) {
    const e = grid.members[m]!;
    const b = 4 * e;
    if (
      answers(index, e) &&
      p.x >= grid.box[b]! &&
      p.x <= grid.box[b + 2]! &&
      p.y >= grid.box[b + 1]! &&
      p.y <= grid.box[b + 3]!
    )
      here.push(e);
  }
  return here;
}

/** The topmost thing at a map point (scene units): a lot, else a block, a road, a district, a town; or null. */
export function pick(index: PickIndex, x: number, z: number): Hit | null {
  const p = { x: x * UNIT, y: -z * UNIT };
  const here = entriesAt(index, p);
  const { layer, area, item, town } = index.grid;
  // Districts smallest first (in entry order on a tie): the smallest holding the point is the deepest folder the city
  // records there, for blocks.
  const districts = here.filter((e) => layer[e] === DISTRICT).toSorted((a, b) => area[a]! - area[b]!);
  const deepest = districts.find((e) => holds(index, e, p));
  const folder = deepest === undefined ? null : index.city.towns[town[deepest]!]!.districts[item[deepest]!]!.path;
  for (const kind of LAYERS) {
    const ordered = kind === DISTRICT ? districts : here.filter((e) => layer[e] === kind);
    const e = ordered.find((candidate) => holds(index, candidate, p));
    if (e !== undefined) return keptHit(index, e, folder);
  }
  return null;
}
