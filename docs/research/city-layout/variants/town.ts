// Neighbourhood prototype: a town's outline is cut recursively between its folders (every cut is a street, ranked by
// folder depth), small folders flatten into neighbourhoods with their own block grid, lots sit back to back in blocks.
// Tests and fixtures get no land; docs become parks. Everything is bent by one smooth deterministic warp.
import type { FileRecord, RepoData } from "./extract";
import {
  area,
  centroid,
  chord,
  clip,
  densify,
  extent,
  fnv1a,
  inset,
  longestEdgeAngle,
  unit,
  warper,
  type Poly,
  type Pt,
} from "./geometry";
import { LAND_USE_WEIGHT, type LandUse } from "./land-use";

export type RoadClass = "lane" | "street" | "collector" | "avenue" | "boulevard" | "highway";
export const ROAD_WIDTH: Record<RoadClass, number> = {
  lane: 5,
  street: 8,
  collector: 12,
  avenue: 18,
  boulevard: 26,
  highway: 22,
};

const U = ROAD_WIDTH.street; // one local street width
const BLOCK_SHORT = 6 * U;
const BLOCK_LONG = 12 * U;
const MODULE = 4; // lot frontage, 0.5 u
const PAVEMENT = 1.5;
const LOT_AREA = MODULE * (BLOCK_SHORT / 2);
const FLATTEN_BLOCKS = 9;
const MAX_CLASS = 4;
/** A cut at least this share of its town's diameter long is a long cut, and jogs when it can. */
const LONG_CUT = 0.3;
/** The sideways step of a jogging cut, and the least gap between its cross cuts that makes a plaza. */
const JOG = 3 * U;
const MIN_JOG = 2 * U; // a folder smaller than this many blocks is one neighbourhood
/** Land uses that take no land unless the land dimension includes them. */
export const DEFAULT_NO_LAND: LandUse[] = ["tests", "fixtures"];
const MARGIN = ROAD_WIDTH.street / 2 + PAVEMENT;

/** A side may grow to this multiple of its demand at the last cut before its cut moves (the hysteresis band). */
export const GROWTH_ROOM = 1.35;
/** A flattened folder stays flat up to this multiple of the flatten limit; a cut folder stays cut down to its inverse. */
const FLATTEN_HYSTERESIS = 1.5;
/** A neighbourhood whose remembered lots are more than this share vacant is renewed: its lots are re-laid in order. */
const RENEWAL_THRESHOLD = 0.5;

/** A remembered cut: its line, its class, the items on each side, and each side's capacity before it must move. */
export interface CutRecord {
  nx: number;
  ny: number;
  c: number;
  cls: RoadClass;
  left: string[];
  right: string[];
  capLeft: number;
  capRight: number;
}
/** A remembered neighbourhood: its grid origin, angle and pitch, its park strip, and the slot of every lot. */
export interface GridRecord {
  theta: number;
  a0: number;
  b0: number;
  rowPitch: number;
  colPitch: number;
  /** Lot class in modules (1 to MAX_CLASS): set at first lay so lots fill the blocks they need. */
  span: number;
  park: { nx: number; ny: number; c: number } | null;
  slots: Record<string, string>;
}
/** A remembered shared lot: its key (its founding file's identity) and its member identities. */
export interface ShareRecord {
  key: string;
  members: string[];
}
/** The plat of one town: everything the layout remembers between commits. */
export interface TownPlat {
  centre: Pt | null;
  area: number;
  cap: number;
  diameter: number;
  cuts: Record<string, CutRecord>;
  grids: Record<string, GridRecord>;
  shares: Record<string, ShareRecord[]>;
}
export const emptyTownPlat = (): TownPlat => ({
  centre: null,
  area: 0,
  cap: 0,
  diameter: 0,
  cuts: {},
  grids: {},
  shares: {},
});

/** Land a neighbourhood needs for the given lot area: lots over density, plus a road margin round a square. */
function landFor(lotArea: number, density: number): number {
  if (lotArea <= 0) return 0;
  return (Math.sqrt(lotArea / density) + 2 * MARGIN) ** 2;
}

export interface Options {
  /** Share of a town's land covered by lots, before streets of the outline. */
  density: number;
  /** The land dimension: land uses that take no land (tests and fixtures by default). */
  noLand: LandUse[];
  order: "centre-out" | "first-seen";
  /** Jogging cuts: long cuts whose sides split again become pinwheels round a plaza; everywhere or top-level only. */
  jog: "off" | "top-level" | "all";
  warp: boolean;
}

export interface Road {
  pts: Pt[];
  cls: RoadClass;
}
export interface Block {
  pts: Pt[];
  district: string;
  kind: "built" | "open" | "park" | "plaza";
}
export interface Lot {
  pts: Pt[];
  /** Stable lot identity: the identity of the file that founded it. */
  key: string;
  /** A vacant lot: its files were deleted; it holds its slot until renewal. */
  vacant: boolean;
  path: string;
  landUse: LandUse;
  district: string;
}
export interface District {
  pts: Pt[];
  path: string;
  name: string;
  depth: number;
  mass: number;
}
export interface Town {
  name: string;
  outline: Pt[];
  roads: Road[];
  blocks: Block[];
  lots: Lot[];
  districts: District[];
  stats: { lots: number; overflow: number; tests: number; docs: number; lotArea: number; landArea: number };
}

interface Node {
  path: string;
  name: string;
  depth: number;
  firstSeen: number;
  lots: FileRecord[]; // representative file per lot, after sharing
  docs: number;
  children: Node[];
  gross: number; // land area the subtree needs
  mass: number;
}

const identityOf = (file: FileRecord) => file.identity ?? file.path;

// Shared lots: files of one land use in a folder share a lot, round(1 / weight) per lot. Membership is remembered, so
// a deletion empties a place in its own lot and never regroups the lots after it; a new file joins a lot with room.
// Each returned record stands for one lot: its oldest live member, with the lot key as identity.
function shareLots(folder: string, files: FileRecord[], shares: Record<string, ShareRecord[]>): FileRecord[] {
  const out: FileRecord[] = [];
  const byUse = new Map<LandUse, FileRecord[]>();
  for (const file of files) byUse.set(file.landUse, [...(byUse.get(file.landUse) ?? []), file]);
  for (const [use, list] of byUse) {
    const capacity = Math.max(1, Math.round(1 / LAND_USE_WEIGHT[use]));
    const live = new Map(list.map((f) => [identityOf(f), f]));
    const key = `${folder}|${use}`;
    const lots = (shares[key] ?? [])
      .map((l) => ({ key: l.key, members: l.members.filter((m) => live.has(m)) }))
      .filter((l) => l.members.length > 0);
    const placed = new Set(lots.flatMap((l) => l.members));
    for (const file of list) {
      const id = identityOf(file);
      if (placed.has(id)) continue;
      const open = lots.find((l) => l.members.length < capacity);
      if (open) open.members.push(id);
      else lots.push({ key: id, members: [id] });
    }
    shares[key] = lots;
    for (const lot of lots) {
      const oldest = lot.members.map((m) => live.get(m)!).sort((a, b) => a.firstSeen - b.firstSeen)[0];
      out.push({ ...oldest, identity: lot.key });
    }
  }
  return out.sort((a, b) => a.firstSeen - b.firstSeen || byPath(a.path, b.path));
}

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildNodes(
  data: RepoData,
  rootPath: string,
  exclude: string[],
  density: number,
  noLand: LandUse[],
  shares: Record<string, ShareRecord[]> = {},
) {
  const NO_LAND = new Set(noLand);
  const prefix = rootPath === "" ? "" : `${rootPath}/`;
  const raw = new Map<string, { files: FileRecord[]; docs: number; kids: Set<string> }>();
  const get = (path: string) => {
    let entry = raw.get(path);
    if (!entry) {
      entry = { files: [], docs: 0, kids: new Set() };
      raw.set(path, entry);
    }
    return entry;
  };
  get(rootPath);
  let tests = 0;
  let docs = 0;
  for (const file of data.files) {
    if (!file.path.startsWith(prefix) || exclude.some((e) => file.path.startsWith(`${e}/`))) continue;
    if (NO_LAND.has(file.landUse)) {
      tests++;
      continue;
    }
    const folder = file.path.slice(0, Math.max(file.path.lastIndexOf("/"), 0));
    if (file.landUse === "docs") {
      get(folder).docs++;
      docs++;
    } else get(folder).files.push(file);
    for (let f = folder; f !== rootPath;) {
      const parent = f.lastIndexOf("/") === -1 ? "" : f.slice(0, f.lastIndexOf("/"));
      get(parent).kids.add(f);
      f = parent;
      if (rootPath !== "" && !f.startsWith(rootPath)) break;
    }
  }
  const make = (path: string, depth: number): Node => {
    const entry = raw.get(path)!;
    const files = [...entry.files].sort((a, b) => a.firstSeen - b.firstSeen || byPath(a.path, b.path));
    const node: Node = {
      path,
      name: path === rootPath ? rootPath || data.name : path.slice(path.lastIndexOf("/") + 1),
      depth,
      firstSeen: data.folderFirstSeen[path] ?? 0,
      lots: shareLots(path, files, shares),
      docs: entry.docs,
      children: [...entry.kids].sort(byPath).map((k) => make(k, depth + 1)),
      gross: 0,
      mass: 0,
    };
    node.mass =
      files.reduce((s, f) => s + LAND_USE_WEIGHT[f.landUse], 0) + node.children.reduce((s, c) => s + c.mass, 0);
    node.gross =
      landFor(node.lots.length * LOT_AREA, density) +
      landFor(node.docs * LOT_AREA * 0.5, density) +
      node.children.reduce((s, c) => s + c.gross, 0);
    return node;
  };
  // Corridor collapse: a folder without land of its own and one child merges into that child.
  const collapse = (node: Node, root: boolean): Node => {
    let n = node;
    while (!root && n.lots.length === 0 && n.docs === 0 && n.children.length === 1) {
      const c = n.children[0];
      n = { ...c, name: `${n.name}/${c.name}`, depth: n.depth, firstSeen: Math.min(n.firstSeen, c.firstSeen) };
    }
    return { ...n, children: n.children.map((c) => collapse({ ...c, depth: n.depth + 1 }, false)) };
  };
  return { root: collapse(make(rootPath, 0), true), tests, docs };
}

// Partition items: a child folder, a folder's own lots, or a folder's own park.
type Item =
  | { kind: "folder"; node: Node; gross: number; mass: number; firstSeen: number; key: string }
  | { kind: "lots"; lots: FileRecord[]; gross: number; mass: number; firstSeen: number; key: string; district: string }
  | { kind: "park"; gross: number; mass: number; firstSeen: number; key: string; district: string };

function centreOut<T>(ordered: T[]): T[] {
  // Oldest in the middle, then alternately to either side, so newcomers join the edges.
  const left: T[] = [];
  const right: T[] = [];
  ordered.forEach((item, i) => (i % 2 === 0 ? right : left).push(item));
  return [...left.reverse(), ...right];
}

function flatten(node: Node): { lots: FileRecord[]; docs: number } {
  const lots = [...node.lots];
  let docs = node.docs;
  for (const c of [...node.children].sort((a, b) => a.firstSeen - b.firstSeen || byPath(a.path, b.path))) {
    const f = flatten(c);
    lots.push(...f.lots);
    docs += f.docs;
  }
  return { lots, docs };
}

export function layoutTown(
  name: string,
  root: Node,
  options: Options,
  outline: Pt[],
  seedKey: string,
  plat: TownPlat = emptyTownPlat(),
): Town {
  const town: Town = {
    name,
    outline,
    roads: [],
    blocks: [],
    lots: [],
    districts: [],
    stats: { lots: 0, overflow: 0, tests: 0, docs: 0, lotArea: 0, landArea: area(outline) },
  };
  const blockArea = (BLOCK_SHORT + U) * (BLOCK_LONG + U);
  const flattenLimit = FLATTEN_BLOCKS * blockArea;

  // Road class follows the tier of the folder being cut (mass by decade): only a city earns a boulevard, and only
  // its first cut; the rest of its cuts are one class lower.
  const TIERS: [number, RoadClass, RoadClass][] = [
    [3000, "boulevard", "avenue"],
    [300, "avenue", "collector"],
    [30, "collector", "street"],
    [0, "street", "street"],
  ];
  const cutClass = (mass: number, top: boolean): RoadClass => {
    const tier = TIERS.find(([threshold]) => mass >= threshold)!;
    return top ? tier[1] : tier[2];
  };

  // Plat keys: a folder's cut is keyed by its path, deeper cuts append ">L" or ">R", item grids append "#lots".
  const owned = (key: string, path: string) =>
    path === "" ||
    key === path ||
    key.startsWith(`${path}/`) ||
    key.startsWith(`${path}>`) ||
    key.startsWith(`${path}#`);
  const seedOf = (key: string) => key.replace(/>/g, "");
  const forget = (path: string) => {
    for (const key of Object.keys(plat.cuts)) if (owned(key, path)) delete plat.cuts[key];
    for (const key of Object.keys(plat.grids)) if (owned(key, path)) delete plat.grids[key];
  };

  const place = (poly: Poly, item: Item, district: string) => {
    if (item.kind === "folder") partition(item.node, poly, district);
    else if (item.kind === "lots") neighbourhood(poly, item.lots, 0, item.key, item.district);
    else park(poly, item.district);
  };

  const massOf = (items: Item[]) => items.reduce((s, i) => s + i.mass, 0);
  const demandOf = (items: Item[]) => items.reduce((s, i) => s + i.gross, 0);

  /** The offset along (nx, ny) that leaves the given share of the polygon's area below the line. */
  const offsetFor = (poly: Poly, nx: number, ny: number, fraction: number) => {
    const [lo, hi] = extent(poly.p, nx, ny);
    const target = area(poly.p) * fraction;
    let a = lo;
    let b = hi;
    for (let it = 0; it < 40; it++) {
      const mid = (a + b) / 2;
      if (area(clip(poly, nx, ny, mid, 0).p) < target) a = mid;
      else b = mid;
    }
    return (a + b) / 2;
  };

  const wards = (poly: Poly, rec: CutRecord, left: Item[], right: Item[], key: string) => {
    // Land bounded by collectors or bigger roads takes its own tint, named after its heaviest folder.
    for (const [side, part] of [
      [clip(poly, rec.nx, rec.ny, rec.c, 0), left],
      [clip(poly, -rec.nx, -rec.ny, -rec.c, 0), right],
    ] as const) {
      const heaviest = part.filter((i) => i.kind === "folder").sort((p, q) => q.mass - p.mass)[0];
      if (heaviest && heaviest.kind === "folder" && part.length > 1)
        town.districts.push({
          pts: side.p,
          path: `${key}#ward`,
          name: heaviest.node.name,
          depth: 9,
          mass: massOf(part),
        });
    }
  };

  /**
   * The remembered binary decision at a key: which items go to which side of which line. A forced normal (a pinwheel's
   * cross cuts) replaces the longest-extent rule and the tilt. Null when one item is left and no cut is remembered.
   */
  const decide = (
    items: Item[],
    poly: Poly,
    mass: number,
    top: boolean,
    key: string,
    normal?: [number, number],
  ): { rec: CutRecord; left: Item[]; right: Item[] } | null => {
    let rec: CutRecord | undefined = plat.cuts[key];
    if (
      rec &&
      (!chord(poly.p, rec.nx, rec.ny, rec.c) ||
        !items.some((i) => rec!.left.includes(i.key) || rec!.right.includes(i.key)))
    ) {
      // The remembered cut no longer crosses its land, or none of its items remain: this land is laid afresh.
      forget(key);
      rec = undefined;
    }
    if (!rec) {
      if (items.length === 1) return null;
      // A fresh cut: split the ordered items where the land is halved, across the longer extent, path-seeded tilt.
      const total = demandOf(items);
      let acc = 0;
      let k = 1;
      let best = Infinity;
      for (let i = 1; i < items.length; i++) {
        acc += items[i - 1].gross;
        const d = Math.abs(acc - total / 2);
        if (d < best) {
          best = d;
          k = i;
        }
      }
      let nx: number;
      let ny: number;
      if (normal) [nx, ny] = normal;
      else {
        const theta = longestEdgeAngle(poly.p);
        const along = extent(poly.p, Math.cos(theta), Math.sin(theta));
        const across = extent(poly.p, -Math.sin(theta), Math.cos(theta));
        const base = along[1] - along[0] >= across[1] - across[0] ? theta : theta + Math.PI / 2;
        // Seeds and tints use the key without separators, so a first lay draws exactly what STATE A drew.
        const tilt = (unit(`${seedOf(key)}#tilt`) - 0.5) * 0.35;
        nx = Math.cos(base + tilt);
        ny = Math.sin(base + tilt);
      }
      const left = items.slice(0, k);
      const right = items.slice(k);
      rec = {
        nx,
        ny,
        c: offsetFor(poly, nx, ny, demandOf(left) / total),
        cls: cutClass(mass, top),
        left: left.map((i) => i.key),
        right: right.map((i) => i.key),
        capLeft: demandOf(left) * GROWTH_ROOM,
        capRight: demandOf(right) * GROWTH_ROOM,
      };
      plat.cuts[key] = rec;
    } else {
      // A remembered cut: newcomers join the side with more spare land; the cut moves only when a side outgrows
      // its band, and then to the split of today's demand.
      const r = rec;
      const sideOf = (i: Item) => (r.left.includes(i.key) ? "L" : r.right.includes(i.key) ? "R" : null);
      for (const item of items.filter((i) => sideOf(i) === null)) {
        const spareLeft = r.capLeft - demandOf(items.filter((i) => sideOf(i) === "L"));
        const spareRight = r.capRight - demandOf(items.filter((i) => sideOf(i) === "R"));
        (spareLeft >= spareRight ? r.left : r.right).push(item.key);
      }
      const dl = demandOf(items.filter((i) => sideOf(i) === "L"));
      const dr = demandOf(items.filter((i) => sideOf(i) === "R"));
      if ((dl > r.capLeft || dr > r.capRight) && dl > 0 && dr > 0) {
        console.log(
          `[plat] recut ${key || "(root)"} demand ${Math.round(dl)}/${Math.round(dr)} over ${Math.round(r.capLeft)}/${Math.round(r.capRight)}`,
        );
        r.c = offsetFor(poly, r.nx, r.ny, dl / (dl + dr));
        r.capLeft = dl * GROWTH_ROOM;
        r.capRight = dr * GROWTH_ROOM;
      } else if (dl > r.capLeft || dr > r.capRight) {
        // One side is empty: the growing side may take the empty side's land without moving anything.
        r.capLeft = Math.max(r.capLeft, dl * GROWTH_ROOM);
        r.capRight = Math.max(r.capRight, dr * GROWTH_ROOM);
      }
    }
    const r = rec;
    return {
      rec: r,
      left: items.filter((i) => r.left.includes(i.key)),
      right: items.filter((i) => r.right.includes(i.key)),
    };
  };

  /** The part of a road segment whose coordinate along (mx, my) lies within [lo, hi]. */
  const trim = (seg: [Pt, Pt], mx: number, my: number, lo: number, hi: number): Pt[] | null => {
    const v0 = mx * seg[0].x + my * seg[0].y;
    const v1 = mx * seg[1].x + my * seg[1].y;
    if (Math.abs(v1 - v0) < 1e-9) return v0 >= lo && v0 <= hi ? seg : null;
    const at = (v: number) => Math.min(1, Math.max(0, (v - v0) / (v1 - v0)));
    const [u0, u1] = [at(lo), at(hi)].sort((a, b) => a - b);
    if (u1 - u0 < 1e-6) return null;
    const point = (u: number): Pt => ({
      x: seg[0].x + (seg[1].x - seg[0].x) * u,
      y: seg[0].y + (seg[1].y - seg[0].y) * u,
    });
    return [point(u0), point(u1)];
  };

  /**
   * Jogging cuts: a long cut whose sides each split again becomes a pinwheel. The two cross cuts are forced square to
   * the main cut; where they fall at different points along it, the main cut steps sideways between them by JOG, and
   * the four roads end in T-junctions round a small plaza. Every piece stays convex: two half-planes of the land.
   */
  const pinwheel = (
    decision: { rec: CutRecord; left: Item[]; right: Item[] },
    poly: Poly,
    key: string,
    district: string,
  ): boolean => {
    const { rec: r, left, right } = decision;
    if (options.jog === "off" || left.length < 2 || right.length < 2) return false;
    // Top-level cuts divide the town's top-level folders: the root's own cuts, before any child folder's.
    if (options.jog === "top-level" && !(key === root.path || key.startsWith(`${root.path}>`))) return false;
    const seg = chord(poly.p, r.nx, r.ny, r.c);
    const diameter = 2 * Math.sqrt(town.stats.landArea / Math.PI);
    if (!seg || Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y) < LONG_CUT * diameter) return false;
    const mx = -r.ny;
    const my = r.nx;
    const below = decide(left, clip(poly, r.nx, r.ny, r.c, 0), massOf(left), false, `${key}>L`, [mx, my]);
    const above = decide(right, clip(poly, -r.nx, -r.ny, -r.c, 0), massOf(right), false, `${key}>R`, [mx, my]);
    if (!below || !above) return false;
    const square = (rec: CutRecord) => rec.nx * mx + rec.ny * my > 0.9999;
    if (!square(below.rec) || !square(above.rec)) return false;
    if ([below.left, below.right, above.left, above.right].some((part) => part.length === 0)) return false;
    const t1 = below.rec.c;
    const t2 = above.rec.c;
    if (Math.abs(t1 - t2) < MIN_JOG) return false;
    const sigma = t1 > t2 ? -1 : 1;
    const sLeft = r.c + (sigma * JOG) / 2;
    const sRight = r.c - (sigma * JOG) / 2;
    const [lo, hi] = [Math.min(t1, t2), Math.max(t1, t2)];
    const wMain = ROAD_WIDTH[r.cls];
    const wBelow = ROAD_WIDTH[below.rec.cls];
    const wAbove = ROAD_WIDTH[above.rec.cls];
    const n = (p: Poly, nx: number, ny: number, c: number, w: number) => clip(p, nx, ny, c, w);
    // Pieces in rotation: below-left, below-right, above-right, above-left; each is the land within two half-planes.
    const pieces: [Item[], Poly, string][] = [
      [below.left, n(n(poly, r.nx, r.ny, sLeft, wMain), mx, my, t1, wBelow), `${key}>L>L`],
      [below.right, n(n(poly, r.nx, r.ny, sRight, wMain), -mx, -my, -t1, wBelow), `${key}>L>R`],
      [above.right, n(n(poly, -r.nx, -r.ny, -sRight, wMain), -mx, -my, -t2, wAbove), `${key}>R>R`],
      [above.left, n(n(poly, -r.nx, -r.ny, -sLeft, wMain), mx, my, t2, wAbove), `${key}>R>L`],
    ];
    // Roads: each runs from the town edge to the far side of the plaza, where it meets the next in a T.
    const roads: [Pt[] | null, RoadClass][] = [];
    const along = (c: number) => chord(poly.p, r.nx, r.ny, c);
    const across = (c: number) => chord(poly.p, mx, my, c);
    const leftRoad = along(sLeft);
    const rightRoad = along(sRight);
    const belowRoad = across(t1);
    const aboveRoad = across(t2);
    const [sLo, sHi] = [Math.min(sLeft, sRight), Math.max(sLeft, sRight)];
    if (leftRoad) roads.push([trim(leftRoad, mx, my, -Infinity, hi), r.cls]);
    if (rightRoad) roads.push([trim(rightRoad, mx, my, lo, Infinity), r.cls]);
    if (belowRoad) roads.push([trim(belowRoad, r.nx, r.ny, -Infinity, sHi), below.rec.cls]);
    if (aboveRoad) roads.push([trim(aboveRoad, r.nx, r.ny, sLo, Infinity), above.rec.cls]);
    for (const [pts, cls] of roads) if (pts) town.roads.push({ pts, cls });
    const plazaLand = n(
      n(
        n(n(poly, mx, my, hi, t1 > t2 ? wBelow : wAbove), -mx, -my, -lo, t1 > t2 ? wAbove : wBelow),
        r.nx,
        r.ny,
        sHi,
        wMain,
      ),
      -r.nx,
      -r.ny,
      -sLo,
      wMain,
    );
    const plaza = inset(plazaLand, PAVEMENT);
    if (plaza.p.length >= 3) town.blocks.push({ pts: plaza.p, district, kind: "plaza" });
    // Districts and wards follow the same keys and tints as an unjogged cut would.
    const major = (cls: RoadClass) => cls !== "street" && cls !== "lane";
    if (major(r.cls)) wards(poly, r, left, right, key);
    const sideDistrict = (sub: string) => (major(r.cls) ? seedOf(sub) : district);
    const subDistrict = (rec: CutRecord, side: string, sub: string) =>
      major(rec.cls) ? seedOf(sub) : sideDistrict(side);
    for (const [part, piece, sub] of pieces) {
      const side = sub.slice(0, -2);
      const rec = side.endsWith(">L") ? below.rec : above.rec;
      split(part, piece, massOf(part), false, sub, subDistrict(rec, side, sub));
    }
    return true;
  };

  const split = (items: Item[], poly: Poly, mass: number, top: boolean, key: string, district: string) => {
    const decision = decide(items, poly, mass, top, key);
    if (!decision) return place(poly, items[0], district);
    if (pinwheel(decision, poly, key, district)) return;
    const { rec: r, left, right } = decision;
    const seg = chord(poly.p, r.nx, r.ny, r.c);
    const major = r.cls !== "street" && r.cls !== "lane";
    if (seg && left.length > 0 && right.length > 0) town.roads.push({ pts: seg, cls: r.cls });
    if (major) wards(poly, r, left, right, key);
    const halves: [Item[], Poly, string][] = [
      [left, clip(poly, r.nx, r.ny, r.c, left.length && right.length ? ROAD_WIDTH[r.cls] : 0), `${key}>L`],
      [right, clip(poly, -r.nx, -r.ny, -r.c, left.length && right.length ? ROAD_WIDTH[r.cls] : 0), `${key}>R`],
    ];
    for (const [part, half, sub] of halves) {
      if (part.length === 0) reserve(half, district);
      else split(part, half, massOf(part), false, sub, major ? seedOf(sub) : district);
    }
  };

  function partition(node: Node, poly: Poly, district: string) {
    if (node.depth >= 1 && (node.depth === 1 || node.mass >= 0.015 * root.mass))
      town.districts.push({ pts: poly.p, path: node.path, name: node.name, depth: node.depth, mass: node.mass });
    // Flattening with hysteresis: a flat folder stays flat while it grows a little, a cut one stays cut.
    const wasFlat = node.path in plat.grids;
    const wasCut = node.path in plat.cuts;
    let flat = node.children.length === 0 || node.gross <= flattenLimit;
    if (wasFlat && node.children.length > 0) flat = node.gross <= flattenLimit * FLATTEN_HYSTERESIS;
    if (wasCut) flat = node.children.length === 0 || node.gross <= flattenLimit / FLATTEN_HYSTERESIS;
    if ((flat && wasCut) || (!flat && wasFlat)) {
      console.log(`[plat] ${flat ? "flatten" : "unflatten"} ${node.path || "(root)"} gross ${Math.round(node.gross)}`);
      forget(node.path);
    }
    if (flat) {
      const f = flatten(node);
      return neighbourhood(poly, f.lots, landFor(f.docs * LOT_AREA * 0.5, options.density), node.path, district);
    }
    const items: Item[] = node.children.map((c) => ({
      kind: "folder" as const,
      node: c,
      gross: c.gross,
      mass: c.mass,
      firstSeen: c.firstSeen,
      key: c.path,
    }));
    if (node.lots.length > 0) {
      const gross = landFor(node.lots.length * LOT_AREA, options.density);
      const mass = node.lots.reduce((s, f) => s + LAND_USE_WEIGHT[f.landUse], 0);
      items.push({
        kind: "lots",
        lots: node.lots,
        gross,
        mass,
        firstSeen: node.lots[0].firstSeen,
        key: `${node.path}#lots`,
        district,
      });
    }
    if (node.docs > 0) {
      items.push({
        kind: "park",
        gross: landFor(node.docs * LOT_AREA * 0.5, options.density),
        mass: 0,
        firstSeen: node.firstSeen,
        key: `${node.path}#park`,
        district,
      });
    }
    const ordered = items.sort((a, b) => a.firstSeen - b.firstSeen || byPath(a.key, b.key));
    split(options.order === "centre-out" ? centreOut(ordered) : ordered, poly, node.mass, true, node.path, district);
  }

  function park(poly: Poly, district: string) {
    const p = inset(poly, PAVEMENT);
    if (p.p.length >= 3) town.blocks.push({ pts: p.p, district, kind: "park" });
  }

  function reserve(poly: Poly, district: string) {
    const p = inset(poly, PAVEMENT);
    if (p.p.length >= 3) town.blocks.push({ pts: p.p, district, kind: "open" });
  }

  function neighbourhood(raw: Poly, lots: FileRecord[], parkGross: number, key: string, district: string) {
    let grid: GridRecord | undefined = plat.grids[key];
    let poly = raw;
    let parkLine: GridRecord["park"] = null;
    if (parkGross > 0) {
      // A strip of park along the neighbourhood's far side, cut off by a footpath; its line is remembered.
      parkLine = grid?.park ?? null;
      if (!parkLine) {
        const total = area(raw.p);
        const fraction = Math.min(0.6, parkGross / total);
        const theta = longestEdgeAngle(raw.p);
        const nx = -Math.sin(theta);
        const ny = Math.cos(theta);
        parkLine = { nx, ny, c: offsetFor(raw, -nx, -ny, fraction) * -1 };
      }
      park(clip(raw, -parkLine.nx, -parkLine.ny, -parkLine.c, ROAD_WIDTH.lane), district);
      poly = clip(raw, parkLine.nx, parkLine.ny, parkLine.c, ROAD_WIDTH.lane);
    }
    const land = inset(poly, PAVEMENT);
    if (land.p.length < 3 || area(land.p) < 1) {
      town.stats.overflow += lots.length;
      return;
    }
    if (!grid) {
      // A fresh grid, aligned with the neighbourhood's main frontage and fitted to its land.
      const theta = longestEdgeAngle(land.p);
      const [a0, a1] = extent(land.p, Math.cos(theta), Math.sin(theta));
      const [b0, b1] = extent(land.p, -Math.sin(theta), Math.cos(theta));
      const rows = Math.max(1, Math.round((b1 - b0 + U) / (BLOCK_SHORT + U)));
      const cols = Math.max(1, Math.round((a1 - a0 + U) / (BLOCK_LONG + U)));
      grid = {
        theta,
        a0,
        b0,
        rowPitch: (b1 - b0 + U) / rows,
        colPitch: (a1 - a0 + U) / cols,
        span: 0,
        park: null,
        slots: {},
      };
      plat.grids[key] = grid;
    }
    grid.park = parkLine;
    const g = grid;
    const ax = Math.cos(g.theta);
    const ay = Math.sin(g.theta);
    const bx = -ay;
    const by = ax;
    const world = (s: number, t: number): Pt => ({ x: ax * s + bx * t, y: ay * s + by * t });
    const clipTo = (cell: Poly): Poly => {
      let out = cell;
      for (let i = 0; i < land.p.length && out.p.length >= 3; i++) {
        const p = land.p[i];
        const q = land.p[(i + 1) % land.p.length];
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        if (len < 1e-9) continue;
        const nx = (q.y - p.y) / len;
        const ny = -(q.x - p.x) / len;
        out = clip(out, nx, ny, nx * p.x + ny * p.y, 0);
      }
      return out;
    };
    const rect = (s0: number, s1: number, t0: number, t1: number): Poly => ({
      p: [world(s0, t0), world(s1, t0), world(s1, t1), world(s0, t1)],
      w: [0, 0, 0, 0],
    });
    // The grid is anchored at its remembered origin and pitch; today's land decides which cells exist.
    const [e0, e1] = extent(land.p, ax, ay);
    const [f0, f1] = extent(land.p, bx, by);
    const rMin = Math.floor((f0 - g.b0 + U) / g.rowPitch);
    const rMax = Math.ceil((f1 - g.b0) / g.rowPitch) - 1;
    const cMin = Math.floor((e0 - g.a0 + U) / g.colPitch);
    const cMax = Math.ceil((e1 - g.a0) / g.colPitch) - 1;
    for (let r = rMin + 1; r <= rMax; r++) {
      const seg = chord(land.p, bx, by, g.b0 + r * g.rowPitch - U / 2);
      if (seg) town.roads.push({ pts: seg, cls: "street" });
    }
    for (let c = cMin + 1; c <= cMax; c++) {
      const seg = chord(land.p, ax, ay, g.a0 + c * g.colPitch - U / 2);
      if (seg) town.roads.push({ pts: seg, cls: "lane" });
    }
    // Slots: lot-wide strips back to back in each block, in serpentine order (bottom row out, top row back).
    interface Slot {
      id: string;
      pts: Pt[];
      block: number;
    }
    interface Cell {
      pts: Pt[];
      used: boolean;
      r: number;
      c: number;
      s0: number;
      s1: number;
      halves: [number, number][];
    }
    const cells: Cell[] = [];
    const halfDepth = g.rowPitch - U >= 28;
    for (let r = rMin; r <= rMax; r++) {
      const even = ((r % 2) + 2) % 2 === 0;
      for (let cc = cMin; cc <= cMax; cc++) {
        const c = even ? cc : cMax - (cc - cMin);
        const s0 = g.a0 + c * g.colPitch;
        const s1 = s0 + g.colPitch - U;
        const t0 = g.b0 + r * g.rowPitch;
        const t1 = t0 + g.rowPitch - U;
        const block = clipTo(rect(s0, s1, t0, t1));
        if (block.p.length < 3) continue;
        const mid = (t0 + t1) / 2;
        const halves: [number, number][] =
          area(block.p) < (s1 - s0) * (t1 - t0) * 0.2
            ? []
            : halfDepth
              ? [
                  [t0, mid],
                  [mid, t1],
                ]
              : [[t0, t1]];
        cells.push({ pts: block.p, used: false, r, c, s0, s1, halves });
      }
    }
    const slotsFor = (span: number): Slot[] => {
      const out: Slot[] = [];
      cells.forEach((cell, index) => {
        const count = Math.floor((cell.s1 - cell.s0) / (MODULE * span));
        cell.halves.forEach(([t0r, t1r], h) => {
          for (let j = 0; j < count; j++) {
            const k = h === 1 ? count - 1 - j : j;
            const s = cell.s0 + k * MODULE * span;
            const strip = clipTo(rect(s, s + MODULE * span, t0r, t1r));
            if (strip.p.length >= 3 && area(strip.p) >= MODULE * span * (t1r - t0r) * 0.45)
              out.push({ id: `${cell.r},${cell.c},${h},${k}`, pts: strip.p, block: index });
          }
        });
      });
      return out;
    };
    if (g.span === 0) {
      // First lay: one-module slots tell how many blocks the lots need; lots then widen to fill those blocks.
      const narrow = slotsFor(1);
      const needed = narrow.slice(0, Math.max(1, lots.length));
      const lastBlock = needed.length ? needed[needed.length - 1].block : -1;
      const modules = narrow.filter((s) => s.block <= lastBlock).length;
      g.span = Math.min(MAX_CLASS, Math.max(1, Math.floor(modules / Math.max(1, lots.length))));
      // Clipped edge blocks hold fewer wide slots than narrow ones; narrow the class until every lot fits.
      while (g.span > 1 && slotsFor(g.span).length < lots.length) g.span--;
    }
    const slots = slotsFor(g.span);
    const slotIndex = new Map(slots.map((s, i) => [s.id, i]));
    const liveKeys = new Set(lots.map(identityOf));
    // Renewal: when most remembered lots are vacant, the neighbourhood is re-laid in order.
    const remembered = Object.keys(g.slots);
    const vacantKeys = remembered.filter((k) => !liveKeys.has(k));
    if (remembered.length > 0 && vacantKeys.length / remembered.length > RENEWAL_THRESHOLD) {
      console.log(`[plat] renew ${key || "(root)"} vacant ${vacantKeys.length}/${remembered.length}`);
      g.slots = {};
    }
    const taken = new Map<number, string>();
    for (const [k, id] of Object.entries(g.slots)) {
      const i = slotIndex.get(id);
      if (i !== undefined && !taken.has(i)) taken.set(i, k);
      else delete g.slots[k];
    }
    // Newcomers and displaced lots take the first free slot after their folder's last lot, else the first free one.
    const folderOf = (f: FileRecord) => f.path.slice(0, Math.max(0, f.path.lastIndexOf("/")));
    const lastOfFolder = new Map<string, number>();
    for (const f of lots) {
      const i = slotIndex.get(g.slots[identityOf(f)] ?? "");
      if (i !== undefined) lastOfFolder.set(folderOf(f), Math.max(lastOfFolder.get(folderOf(f)) ?? -1, i));
    }
    let placed = 0;
    for (const f of lots) {
      const id = identityOf(f);
      if (g.slots[id] === undefined) {
        const after = lastOfFolder.get(folderOf(f)) ?? -1;
        let i = after + 1;
        while (i < slots.length && taken.has(i)) i++;
        if (i >= slots.length) {
          i = 0;
          while (i < slots.length && taken.has(i)) i++;
        }
        if (i >= slots.length) continue;
        taken.set(i, id);
        g.slots[id] = slots[i].id;
        lastOfFolder.set(folderOf(f), Math.max(lastOfFolder.get(folderOf(f)) ?? -1, i));
      }
      const slot = slots[slotIndex.get(g.slots[id])!];
      cells[slot.block].used = true;
      town.lots.push({ pts: slot.pts, key: id, vacant: false, path: f.path, landUse: f.landUse, district });
      town.stats.lotArea += area(slot.pts);
      placed++;
    }
    for (const [i, k] of taken) {
      if (liveKeys.has(k)) continue;
      cells[slots[i].block].used = true;
      town.lots.push({ pts: slots[i].pts, key: k, vacant: true, path: "", landUse: "source", district });
    }
    for (const cell of cells) town.blocks.push({ pts: cell.pts, district, kind: cell.used ? "built" : "open" });
    town.stats.overflow += lots.length - placed;
    town.stats.lots += placed;
  }

  const outlinePoly: Poly = { p: outline, w: outline.map(() => 0) };
  partition(root, outlinePoly, "");

  if (options.warp) {
    // The warp's scale is remembered, so a growing town bends the same way it always did.
    if (plat.diameter === 0) plat.diameter = 2 * Math.sqrt(town.stats.landArea / Math.PI);
    const diameter = plat.diameter;
    const warp = warper(fnv1a(seedKey), [
      [4, 160],
      [0.015 * diameter, 0.35 * diameter],
      [0.07 * diameter, 1.1 * diameter],
    ]);
    const bend = (pts: Pt[], closed: boolean, step: number) => densify(pts, step, closed).map(warp);
    town.outline = bend(town.outline, true, 10);
    town.roads = town.roads.map((r) => ({ ...r, pts: bend(r.pts, false, 6) }));
    town.blocks = town.blocks.map((b) => ({ ...b, pts: bend(b.pts, true, 8) }));
    town.lots = town.lots.map((l) => ({ ...l, pts: l.pts.map(warp) }));
    town.districts = town.districts.map((d) => ({ ...d, pts: bend(d.pts, true, 10) }));
  }
  return town;
}

/** An irregular, convex octagon of the given area around a centre. */
export function outlineFor(grossArea: number, centre: Pt, key: string): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k < 8; k++) {
    const angle = ((k * 45 + 22.5) * Math.PI) / 180;
    const r = 1 + (unit(`${key}#r${k}`) - 0.5) * 0.12;
    pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  const scale = Math.sqrt(grossArea / area(pts));
  return pts.map((p) => ({ x: centre.x + p.x * scale, y: centre.y + p.y * scale }));
}

export { centroid, U };
