// EvoStreets-Grid prototype (stable-layout-algorithms.md §7): folders own streets, files pack into ordered blocks of
// integer lots, siblings take the shorter side in a fixed order. Integer units: 1 lot module = 2, local street = 5.
import { LAND_USE_WEIGHT, type LandUse } from "./land-use";
import type { FileRecord, RepoData } from "./extract";

export type OrderKey = "first-seen" | "alphabetical" | "hash";
export type AreaMetric = "count" | "lines" | "bytes";
export type RoadClass = "lane" | "street" | "collector" | "avenue" | "boulevard";

export interface Options {
  order: OrderKey;
  area: AreaMetric;
  weighted: boolean;
  courts: boolean;
  sharedLots?: boolean;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Road extends Rect {
  cls: RoadClass;
  path: string;
  horizontal: boolean;
}
export interface Lot extends Rect {
  path: string;
  identity: string;
  landUse: LandUse;
  lotClass: number;
  district: string;
  ghost: boolean;
}
export interface Block extends Rect {
  district: string;
}
export interface Label {
  x: number;
  y: number;
  text: string;
  cls: RoadClass;
  horizontal: boolean;
  mass: number;
  path: string;
}
export interface Plan {
  roads: Road[];
  lots: Lot[];
  blocks: Block[];
  labels: Label[];
  districts: (Rect & { district: string })[];
  bounds: Rect;
}

export const MODULE = 2;
export const LOT_DEPTH = 8;
const GAP = 2;
const BLOCK_MAX = 40;
export const ROAD_WIDTH: Record<RoadClass, number> = { lane: 3, street: 5, collector: 8, avenue: 12, boulevard: 20 };

// Fixed, repo-independent thresholds (base 4) so a lot's class never depends on its neighbours.
const LOT_THRESHOLDS: Record<Exclude<AreaMetric, "count">, number[]> = {
  lines: [100, 400, 1600],
  bytes: [4096, 16384, 65536],
};

export interface Folder {
  path: string;
  name: string;
  folders: Folder[];
  files: FileRecord[];
  firstSeen: number;
  mass: number;
}

// Builds the folder tree below rootPath ("" for the repository root), keeping full paths as identities.
export function buildTree(data: RepoData, rootPath = "", subset?: (f: FileRecord) => boolean): Folder {
  const root: Folder = {
    path: rootPath,
    name: rootPath || data.name,
    folders: [],
    files: [],
    firstSeen: data.folderFirstSeen[rootPath] ?? 0,
    mass: 0,
  };
  const index = new Map<string, Folder>([[rootPath, root]]);
  const folderFor = (path: string): Folder => {
    const existing = index.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parent = folderFor(slash === -1 ? "" : path.slice(0, slash));
    const folder: Folder = {
      path,
      name: path.slice(slash + 1),
      folders: [],
      files: [],
      firstSeen: data.folderFirstSeen[path] ?? 0,
      mass: 0,
    };
    parent.folders.push(folder);
    index.set(path, folder);
    return folder;
  };
  const prefix = rootPath === "" ? "" : `${rootPath}/`;
  for (const file of data.files) {
    if (!file.path.startsWith(prefix) || (subset && !subset(file))) continue;
    const slash = file.path.lastIndexOf("/");
    folderFor(slash === -1 ? "" : file.path.slice(0, slash)).files.push(file);
  }
  const weigh = (f: Folder): number => {
    f.mass =
      f.files.reduce((s, file) => s + LAND_USE_WEIGHT[file.landUse], 0) + f.folders.reduce((s, c) => s + weigh(c), 0);
    return f.mass;
  };
  weigh(root);
  return root;
}

// Corridor collapse: a folder without files and with one child folder merges into that child.
export function collapseCorridors(folder: Folder, isRoot = true): Folder {
  let current = folder;
  while (!isRoot && current.files.length === 0 && current.folders.length === 1) {
    const child = current.folders[0];
    current = {
      ...child,
      name: `${current.name}/${child.name}`,
      firstSeen: Math.min(current.firstSeen, child.firstSeen),
    };
  }
  return { ...current, folders: current.folders.map((c) => collapseCorridors(c, false)) };
}

const fnv1a = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};
const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Child =
  | { kind: "folder"; folder: Folder; key: string; firstSeen: number }
  | { kind: "file"; file: FileRecord; key: string; firstSeen: number };

function orderChildren(folder: Folder, order: OrderKey): Child[] {
  const children: Child[] = [
    ...folder.folders.map((f) => ({ kind: "folder" as const, folder: f, key: f.path, firstSeen: f.firstSeen })),
    ...folder.files.map((f) => ({ kind: "file" as const, file: f, key: f.path, firstSeen: f.firstSeen })),
  ];
  const compare: Record<OrderKey, (a: Child, b: Child) => number> = {
    "first-seen": (a, b) => a.firstSeen - b.firstSeen || byPath(a.key, b.key),
    alphabetical: (a, b) => byPath(a.key, b.key),
    hash: (a, b) => fnv1a(a.key) - fnv1a(b.key) || byPath(a.key, b.key),
  };
  return children.sort(compare[order]);
}

export function lotClass(file: FileRecord, options: Options): number {
  if (options.area === "count") return 1;
  const raw = options.area === "lines" ? file.lines : file.bytes;
  const measure = options.weighted ? raw * LAND_USE_WEIGHT[file.landUse] : raw;
  return 1 + LOT_THRESHOLDS[options.area].filter((t) => measure > t).length;
}

export function roadClass(folder: Folder, isRoot: boolean): RoadClass {
  if (folder.mass >= 3000) return "boulevard";
  if (folder.mass >= 300 || isRoot) return "avenue";
  if (folder.mass >= 60) return "collector";
  if (folder.mass >= 8 || folder.folders.length > 0) return "street";
  return "lane";
}

// A laid-out folder in its local frame: street along +x from 0, centred on y = 0, left side is +y.
interface Local {
  plan: Plan;
}

const emptyPlan = (): Plan => ({
  roads: [],
  lots: [],
  blocks: [],
  labels: [],
  districts: [],
  bounds: { x0: 0, y0: 0, x1: 0, y1: 0 },
});

const transform = (plan: Plan, map: (x: number, y: number) => [number, number]): Plan => {
  const rect = <T extends Rect>(r: T): T => {
    const [ax, ay] = map(r.x0, r.y0);
    const [bx, by] = map(r.x1, r.y1);
    return { ...r, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  };
  const swaps = map(1, 0)[1] !== map(0, 0)[1];
  return {
    roads: plan.roads.map((r) => ({ ...rect(r), horizontal: swaps ? !r.horizontal : r.horizontal })),
    lots: plan.lots.map(rect),
    blocks: plan.blocks.map(rect),
    districts: plan.districts.map(rect),
    labels: plan.labels.map((l) => {
      const [x, y] = map(l.x, l.y);
      return { ...l, x, y, horizontal: swaps ? !l.horizontal : l.horizontal };
    }),
    bounds: rect(plan.bounds),
  };
};

const append = (into: Plan, from: Plan) => {
  into.roads.push(...from.roads);
  into.lots.push(...from.lots);
  into.blocks.push(...from.blocks);
  into.labels.push(...from.labels);
  into.districts.push(...from.districts);
};

function blockRows(count: number): number {
  if (count <= 6) return 1;
  if (count <= 24) return 2;
  if (count <= 60) return 3;
  return 4;
}

// Packs an ordered run of files into blocks: R rows deep, rows filled in order, at most BLOCK_MAX long.
const COURT_MAX = 16;

// Shared lots: files of one land use in a run share a lot, round(1 / weight) per lot (20 fixtures, 3 tests).
// Each land use fills its own open lot, so interleaved tests and snapshots still pack densely.
function shareLots(run: FileRecord[]): { file: FileRecord; cls: number }[] {
  const lots: { file: FileRecord; cls: number }[] = [];
  const open = new Map<LandUse, number>();
  for (const file of run) {
    const capacity = Math.max(1, Math.round(1 / LAND_USE_WEIGHT[file.landUse]));
    const filled = open.get(file.landUse) ?? capacity;
    if (filled < capacity) {
      open.set(file.landUse, filled + 1);
      continue;
    }
    open.set(file.landUse, 1);
    lots.push({ file, cls: 1 });
  }
  return lots;
}

function packRun(
  run: FileRecord[],
  options: Options,
  district: string,
  court = false,
): { length: number; depth: number; plan: Plan }[] {
  const lots = options.sharedLots ? shareLots(run) : run.map((file) => ({ file, cls: lotClass(file, options) }));
  const rows = court ? Math.min(4, Math.ceil(lots.length / 4)) : blockRows(lots.length);
  const blocks: { length: number; depth: number; plan: Plan }[] = [];
  let i = 0;
  while (i < lots.length) {
    const total = lots.slice(i).reduce((s, l) => s + l.cls * MODULE, 0);
    const rowLength = Math.min(BLOCK_MAX, Math.max(MODULE * 4, Math.ceil(total / rows)));
    const plan = emptyPlan();
    let row = 0;
    let x = 0;
    let length = 0;
    while (i < lots.length) {
      const width = lots[i].cls * MODULE;
      if (x > 0 && x + width > rowLength) {
        if (row + 1 >= rows) break;
        row++;
        x = 0;
      }
      const y = row * LOT_DEPTH;
      plan.lots.push({
        x0: x,
        y0: y,
        x1: x + width,
        y1: y + LOT_DEPTH,
        path: lots[i].file.path,
        landUse: lots[i].file.landUse,
        lotClass: lots[i].cls,
        district,
        ghost: lots[i].file.ghost === true,
        identity: lots[i].file.identity ?? lots[i].file.path,
      });
      x += width;
      length = Math.max(length, x);
      i++;
    }
    const depth = (row + 1) * LOT_DEPTH;
    plan.blocks.push({ x0: 0, y0: 0, x1: length, y1: depth, district });
    blocks.push({ length, depth, plan });
  }
  return blocks;
}

// An item along a street: a block of lots (local x along, y away from the street) or a side street (local frame).
type Item =
  | { kind: "block"; plan: Plan; length: number; depth: number }
  | { kind: "street"; plan: Plan; length: number; depth: number };

const streetItem = (local: Local): Item => {
  const b = local.plan.bounds;
  return { kind: "street", plan: local.plan, length: b.y1 - b.y0, depth: b.x1 - b.x0 };
};

// Lays items alternately on the shorter side of one street running along +x.
function street(items: Item[], cls: RoadClass, label: Omit<Label, "x" | "y" | "cls" | "horizontal"> | null): Local {
  const half = ROAD_WIDTH[cls] / 2;
  const plan = emptyPlan();
  const used = { left: GAP, right: GAP };
  for (const item of items) {
    const side = used.left <= used.right ? "left" : "right";
    const offset = used[side];
    used[side] += item.length + GAP;
    if (item.kind === "block") {
      // Rows grow away from the street: left side upwards from +half, right side downwards from -half.
      append(
        plan,
        transform(item.plan, (x, y) => (side === "left" ? [offset + x, half + y] : [offset + x, -half - y])),
      );
      continue;
    }
    // Left: rotate +90° so the side street runs up (+y); its left side points back towards -x.
    // Right: rotate -90° so the side street runs down (-y); its left side points towards +x.
    const b = item.plan.bounds;
    append(
      plan,
      side === "left"
        ? transform(item.plan, (x, y) => [offset + (b.y1 - y), half + x])
        : transform(item.plan, (x, y) => [offset + (y - b.y0), -half - x]),
    );
  }
  const length = Math.max(used.left, used.right, GAP * 2);
  plan.roads.push({ x0: 0, y0: -half, x1: length, y1: half, cls, path: label?.path ?? "", horizontal: true });
  if (label) plan.labels.push({ ...label, x: length / 2, y: 0, cls, horizontal: true });
  plan.bounds = boundsOf(plan);
  return { plan };
}

// Gridiron fold: a street far longer than its frontage is deep becomes a spine of parallel side streets,
// each taking a contiguous run of the ordered items.
const FOLD_MIN_ITEMS = 8;
const FOLD_RATIO = 6;
const FOLD_MIN_DEPTH = 24;

function fold(items: Item[], cls: RoadClass): Item[] {
  const total = items.reduce((s, i) => s + i.length + GAP, 0) / 2;
  const deep = Math.max(FOLD_MIN_DEPTH, ...items.map((i) => i.depth));
  if (items.length < FOLD_MIN_ITEMS || total <= FOLD_RATIO * deep) return items;
  const groups = Math.min(items.length, Math.max(2, Math.round(Math.sqrt(total / deep))));
  const target = (total * 2) / groups;
  const runs: Item[][] = [[]];
  let acc = 0;
  for (const item of items) {
    if (acc >= target && runs.length < groups) {
      runs.push([]);
      acc = 0;
    }
    runs[runs.length - 1].push(item);
    acc += item.length + GAP;
  }
  const sideClass: RoadClass = cls === "lane" ? "lane" : "street";
  return runs.map((run) => streetItem(street(run, sideClass, null)));
}

function layoutFolder(folder: Folder, options: Options, depth: number, district: string): Local {
  const cls = roadClass(folder, depth === 0);
  const items: Item[] = [];
  let run: FileRecord[] = [];
  const flush = () => {
    for (const block of packRun(run, options, district)) items.push({ kind: "block", ...block });
    run = [];
  };
  for (const child of orderChildren(folder, options.order)) {
    if (child.kind === "file") {
      run.push(child.file);
      continue;
    }
    flush();
    const childDistrict = depth === 0 ? child.folder.path : district;
    if (options.courts && child.folder.folders.length === 0 && child.folder.files.length <= COURT_MAX) {
      // Court: a small leaf folder is one block on its parent street, not a street of its own.
      const ordered = orderChildren(child.folder, options.order).flatMap((c) => (c.kind === "file" ? [c.file] : []));
      for (const block of packRun(ordered, options, childDistrict, true)) {
        block.plan.labels.push({
          x: block.length / 2,
          y: block.depth / 2,
          text: child.folder.name,
          cls: "lane",
          horizontal: true,
          mass: child.folder.mass,
          path: child.folder.path,
        });
        items.push({ kind: "block", ...block });
      }
      continue;
    }
    items.push(streetItem(layoutFolder(child.folder, options, depth + 1, childDistrict)));
  }
  flush();
  const local = street(fold(items, cls), cls, { text: folder.name, mass: folder.mass, path: folder.path });
  if (depth === 1) local.plan.districts.push({ ...local.plan.bounds, district });
  return local;
}

export function boundsOf(plan: Plan): Rect {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of [...plan.roads, ...plan.blocks, ...plan.lots]) {
    if (r.x0 < b.x0) b.x0 = r.x0;
    if (r.y0 < b.y0) b.y0 = r.y0;
    if (r.x1 > b.x1) b.x1 = r.x1;
    if (r.y1 > b.y1) b.y1 = r.y1;
  }
  return b;
}

export function layout(root: Folder, options: Options): Plan {
  return layoutFolder(collapseCorridors(root), options, 0, "").plan;
}

export function translate(plan: Plan, dx: number, dy: number): Plan {
  return transform(plan, (x, y) => [x + dx, y + dy]);
}

export { append, emptyPlan, fnv1a };
