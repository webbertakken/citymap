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
const FLATTEN_BLOCKS = 9; // a folder smaller than this many blocks is one neighbourhood
const NO_LAND = new Set<LandUse>(["tests", "fixtures"]);
const MAX_CLASS = 4;
const MARGIN = ROAD_WIDTH.street / 2 + PAVEMENT;

/** Land a neighbourhood needs for the given lot area: lots over density, plus a road margin round a square. */
function landFor(lotArea: number, density: number): number {
  if (lotArea <= 0) return 0;
  return (Math.sqrt(lotArea / density) + 2 * MARGIN) ** 2;
}

export interface Options {
  /** Share of a town's land covered by lots, before streets of the outline. */
  density: number;
  order: "centre-out" | "first-seen";
  warp: boolean;
}

export interface Road {
  pts: Pt[];
  cls: RoadClass;
}
export interface Block {
  pts: Pt[];
  district: string;
  kind: "built" | "open" | "park";
}
export interface Lot {
  pts: Pt[];
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

// Shared lots: files of one land use in a folder share a lot, round(1 / weight) per lot.
function shareLots(files: FileRecord[]): FileRecord[] {
  const lots: FileRecord[] = [];
  const open = new Map<LandUse, number>();
  for (const file of files) {
    const capacity = Math.max(1, Math.round(1 / LAND_USE_WEIGHT[file.landUse]));
    const filled = open.get(file.landUse) ?? capacity;
    if (filled < capacity) {
      open.set(file.landUse, filled + 1);
      continue;
    }
    open.set(file.landUse, 1);
    lots.push(file);
  }
  return lots;
}

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildNodes(data: RepoData, rootPath: string, exclude: string[], density: number) {
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
      lots: shareLots(files),
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

export function layoutTown(name: string, root: Node, options: Options, outline: Pt[], seedKey: string): Town {
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

  const place = (poly: Poly, item: Item, district: string) => {
    if (item.kind === "folder") partition(item.node, poly, district);
    else if (item.kind === "lots") neighbourhood(poly, item.lots, 0, item.key, item.district);
    else park(poly, item.district);
  };

  const massOf = (items: Item[]) => items.reduce((s, i) => s + i.mass, 0);
  const split = (items: Item[], poly: Poly, mass: number, top: boolean, key: string, district: string) => {
    if (items.length === 1) return place(poly, items[0], district);
    const total = items.reduce((s, i) => s + i.gross, 0);
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
    const left = items.slice(0, k);
    const fraction = left.reduce((s, i) => s + i.gross, 0) / total;
    // Cut across the longer extent, measured along the polygon's main axis, with a small path-seeded tilt.
    const theta = longestEdgeAngle(poly.p);
    const along = extent(poly.p, Math.cos(theta), Math.sin(theta));
    const across = extent(poly.p, -Math.sin(theta), Math.cos(theta));
    const base = along[1] - along[0] >= across[1] - across[0] ? theta : theta + Math.PI / 2;
    const tilt = (unit(`${key}#tilt`) - 0.5) * 0.35;
    const nx = Math.cos(base + tilt);
    const ny = Math.sin(base + tilt);
    const [lo, hi] = extent(poly.p, nx, ny);
    const target = area(poly.p) * fraction;
    let a = lo;
    let b = hi;
    for (let it = 0; it < 40; it++) {
      const mid = (a + b) / 2;
      if (area(clip(poly, nx, ny, mid, 0).p) < target) a = mid;
      else b = mid;
    }
    const c = (a + b) / 2;
    const cls = cutClass(mass, top);
    const seg = chord(poly.p, nx, ny, c);
    if (seg) town.roads.push({ pts: seg, cls });
    // Wards: land bounded by collectors or bigger roads takes its own tint, as districts read on real maps.
    const major = cls !== "street" && cls !== "lane";
    if (major)
      for (const [side, part] of [
        [clip(poly, nx, ny, c, 0), left],
        [clip(poly, -nx, -ny, -c, 0), items.slice(k)],
      ] as const) {
        // A ward is named after its heaviest folder.
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
    split(left, clip(poly, nx, ny, c, ROAD_WIDTH[cls]), massOf(left), false, `${key}L`, major ? `${key}L` : district);
    split(
      items.slice(k),
      clip(poly, -nx, -ny, -c, ROAD_WIDTH[cls]),
      massOf(items.slice(k)),
      false,
      `${key}R`,
      major ? `${key}R` : district,
    );
  };

  function partition(node: Node, poly: Poly, district: string) {
    if (node.depth >= 1 && (node.depth === 1 || node.mass >= 0.015 * root.mass))
      town.districts.push({ pts: poly.p, path: node.path, name: node.name, depth: node.depth, mass: node.mass });
    if (node.children.length === 0 || node.gross <= FLATTEN_BLOCKS * blockArea) {
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

  function neighbourhood(raw: Poly, lots: FileRecord[], parkGross: number, key: string, district: string) {
    let poly = raw;
    if (parkGross > 0) {
      // A strip of park along the neighbourhood's far side, cut off by a footpath.
      const total = area(raw.p);
      const fraction = Math.min(0.6, parkGross / total);
      const theta = longestEdgeAngle(raw.p);
      const nx = -Math.sin(theta);
      const ny = Math.cos(theta);
      const [lo, hi] = extent(raw.p, nx, ny);
      let a = lo;
      let b = hi;
      for (let it = 0; it < 40; it++) {
        const mid = (a + b) / 2;
        if (area(clip(raw, -nx, -ny, -mid, 0).p) > total * fraction) a = mid;
        else b = mid;
      }
      const c = (a + b) / 2;
      park(clip(raw, -nx, -ny, -c, ROAD_WIDTH.lane), district);
      poly = clip(raw, nx, ny, c, ROAD_WIDTH.lane);
    }
    const land = inset(poly, PAVEMENT);
    if (land.p.length < 3 || area(land.p) < 1) {
      town.stats.overflow += lots.length;
      return;
    }
    // Block grid aligned with the neighbourhood's main frontage.
    const theta = longestEdgeAngle(land.p);
    const ax = Math.cos(theta);
    const ay = Math.sin(theta);
    const bx = -ay;
    const by = ax;
    const [a0, a1] = extent(land.p, ax, ay);
    const [b0, b1] = extent(land.p, bx, by);
    const rows = Math.max(1, Math.round((b1 - b0 + U) / (BLOCK_SHORT + U)));
    const cols = Math.max(1, Math.round((a1 - a0 + U) / (BLOCK_LONG + U)));
    const rowPitch = (b1 - b0 + U) / rows;
    const colPitch = (a1 - a0 + U) / cols;
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
    for (let r = 1; r < rows; r++) {
      const t = b0 + r * rowPitch - U / 2;
      const seg = chord(land.p, bx, by, t);
      if (seg) town.roads.push({ pts: seg, cls: "street" });
    }
    for (let c = 1; c < cols; c++) {
      const s = a0 + c * colPitch - U / 2;
      const seg = chord(land.p, ax, ay, s);
      if (seg) town.roads.push({ pts: seg, cls: "lane" });
    }
    // Blocks in serpentine order; lots back to back, bottom row out, top row back. Lots fill whole blocks: the last
    // block used stretches its lots across all its frontage, and blocks left over become open green land.
    let next = 0;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const c = r % 2 === 0 ? cc : cols - 1 - cc;
        const s0 = a0 + c * colPitch;
        const s1 = s0 + colPitch - U;
        const t0 = b0 + r * rowPitch;
        const t1 = t0 + rowPitch - U;
        const block = clipTo(rect(s0, s1, t0, t1));
        if (block.p.length < 3) continue;
        if (area(block.p) < (s1 - s0) * (t1 - t0) * 0.2 || next >= lots.length) {
          town.blocks.push({ pts: block.p, district, kind: "open" });
          continue;
        }
        const [bs0, bs1] = extent(block.p, ax, ay);
        const [bt0, bt1] = extent(block.p, bx, by);
        const mid = (bt0 + bt1) / 2;
        const rowsOf: [number, number][] =
          bt1 - bt0 >= 28
            ? [
                [bt0, mid],
                [mid, bt1],
              ]
            : [[bt0, bt1]];
        // Usable slots per row: module-wide strips that keep most of their depth inside the block.
        const slotsOf = rowsOf.map(([t0r, t1r]) => {
          const usable: number[] = [];
          const count = Math.floor((bs1 - bs0) / MODULE);
          for (let k = 0; k < count; k++) {
            const strip = clipTo(rect(bs0 + k * MODULE, bs0 + (k + 1) * MODULE, t0r, t1r));
            if (strip.p.length >= 3 && area(strip.p) >= MODULE * (t1r - t0r) * 0.45) usable.push(k);
          }
          return usable;
        });
        const capacity = slotsOf.reduce((s, u) => s + u.length, 0);
        if (capacity === 0) {
          town.blocks.push({ pts: block.p, district, kind: "open" });
          continue;
        }
        const take = Math.min(capacity, lots.length - next);
        let remaining = take;
        rowsOf.forEach(([t0r, t1r], ri) => {
          const usable = slotsOf[ri];
          const share = ri === rowsOf.length - 1 ? remaining : Math.round((take * usable.length) / capacity);
          const m = Math.min(share, remaining, usable.length);
          remaining -= m;
          // A stretched lot never exceeds lot class 4 (four modules); spare frontage stays garden.
          const span = Math.min(MAX_CLASS, Math.max(1, Math.floor(usable.length / Math.max(1, m))));
          const spans: [number, number][] = [];
          for (let j = 0; j < m; j++)
            spans.push([usable[j * span], usable[Math.min(usable.length, (j + 1) * span) - 1]]);
          // Bottom row runs out along the street, top row runs back, so a folder stays one contiguous run.
          if (ri === 1) spans.reverse();
          for (const [k0, k1] of spans) {
            const lotPoly = clipTo(rect(bs0 + k0 * MODULE, bs0 + (k1 + 1) * MODULE, t0r, t1r));
            if (lotPoly.p.length < 3) continue;
            const file = lots[next++];
            town.lots.push({ pts: lotPoly.p, path: file.path, landUse: file.landUse, district });
            town.stats.lotArea += area(lotPoly.p);
          }
        });
        town.blocks.push({ pts: block.p, district, kind: "built" });
      }
    }
    town.stats.overflow += lots.length - next;
    town.stats.lots += next;
  }

  const outlinePoly: Poly = { p: outline, w: outline.map(() => 0) };
  partition(root, outlinePoly, "");

  if (options.warp) {
    const diameter = 2 * Math.sqrt(town.stats.landArea / Math.PI);
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
