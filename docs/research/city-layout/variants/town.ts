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
import {
  districtForm,
  features,
  flatForm,
  isFlat,
  tierOf,
  type Archetype,
  type DistrictForm,
  type FlatForm,
  type Form,
  type Tier,
} from "./archetype";

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
const MIN_JOG = 2 * U;
/** A twin city's river width. */
const RIVER = 2.5 * U;
/** An archipelago's canals below its first cut, which is a river. */
const CANAL = 1.5 * U;
/** A radial core spans at most this share of the way to the edge, so the ring keeps room for its sectors. */
const RADIAL_MAX_SCALE = 0.95; // a folder smaller than this many blocks is one neighbourhood
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
  /** A twin's cut: a river with bridges instead of a road. */
  river?: boolean;
}
/** A remembered radial layout: its core item, start angle, ring order, sector bounds, core scale and bands. */
export interface RadialRecord {
  core: string;
  start: number;
  order: string[];
  bounds: number[];
  scale: number;
  caps: Record<string, number>;
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
  /** A hamlet's green: the cell at its heart. */
  green?: string;
  /** A street village's high street: the row boundary it runs along. */
  high?: number;
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
  forms: Record<string, Form>;
  radial: Record<string, RadialRecord>;
  /** Quarters (opt-in): the members of each quarter of a folder, in age order. */
  quarters?: Record<string, string[][]>;
  /** Archipelago (opt-in): the packages on each island of a folder, in age order, once it has more than a dozen. */
  islands?: Record<string, string[][]>;
  /** Tiers (opt-in): the town's settlement tier, held with hysteresis. */
  tier?: Tier;
}
export const emptyTownPlat = (): TownPlat => ({
  centre: null,
  area: 0,
  cap: 0,
  diameter: 0,
  cuts: {},
  grids: {},
  shares: {},
  forms: {},
  radial: {},
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
  /** Opt-in archetypes beyond the approved set; none by default. */
  archetypes?: Archetype[];
}

export interface Road {
  pts: Pt[];
  cls: RoadClass;
}
export interface Block {
  pts: Pt[];
  district: string;
  kind: "built" | "open" | "park" | "plaza";
  /** The innermost district form round this block (radial, twin, polycentric). */
  form?: DistrictForm;
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
  /** The innermost district form round this lot. */
  form?: DistrictForm;
}
export interface District {
  pts: Pt[];
  path: string;
  name: string;
  depth: number;
  mass: number;
  form?: Form;
}
export interface Town {
  name: string;
  /** The form of the town's root folder. */
  form: Form;
  /** An old town: a city kept whole when its root switched form; its lots light while their files live. */
  old: boolean;
  water: Pt[][];
  /** Archipelago (opt-in): canals, drawn deeper than a river so no district tint matches them. */
  canals?: Pt[][];
  outline: Pt[];
  roads: Road[];
  blocks: Block[];
  lots: Lot[];
  districts: District[];
  stats: { lots: number; overflow: number; tests: number; docs: number; lotArea: number; landArea: number };
}

export interface Node {
  path: string;
  name: string;
  depth: number;
  firstSeen: number;
  lots: FileRecord[]; // representative file per lot, after sharing
  docs: number;
  children: Node[];
  gross: number; // land area the subtree needs
  mass: number;
  /** A package: a declared workspace member, or a folder holding a package manifest of its own. */
  pkg?: boolean;
  /** Mass of the subtree's source files. */
  source?: number;
}

/** Package manifests that make a folder a package when no workspace declares it (research §7, fallback). */
const MANIFEST =
  /^(package\.json|Cargo\.toml|go\.mod|pyproject\.toml|setup\.py|[^/]+\.gemspec|pom\.xml|build\.gradle(\.kts)?)$/;

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
  const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));
  const packages = new Set([
    ...data.members,
    ...data.files.filter((f) => MANIFEST.test(f.path.slice(f.path.lastIndexOf("/") + 1))).map((f) => folderOf(f.path)),
  ]);
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
    node.pkg = packages.has(path);
    node.source =
      files.filter((f) => f.landUse === "source").length + node.children.reduce((s, c) => s + (c.source ?? 0), 0);
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
  | { kind: "park"; gross: number; mass: number; firstSeen: number; key: string; district: string }
  | { kind: "group"; items: Item[]; gross: number; mass: number; firstSeen: number; key: string }
  | { kind: "quarter"; members: Item[]; gross: number; mass: number; firstSeen: number; key: string };
type FolderItem = Extract<Item, { kind: "folder" }>;

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

const FLATTEN_LIMIT = FLATTEN_BLOCKS * (BLOCK_SHORT + U) * (BLOCK_LONG + U);
/** An archipelago (opt-in) of more packages than this shares islands among them, so canals stay few. */
const ISLAND_CAP = 12;
/** A quarter (opt-in) closes once its members need this many blocks of land: about five blocks across. */
const QUARTER_BLOCKS = 24;
const QUARTER_LAND = QUARTER_BLOCKS * (BLOCK_SHORT + U) * (BLOCK_LONG + U);
/** A last quarter under this share of a full one joins the quarter before it at first lay. */
const QUARTER_TAIL = 0.4;

/**
 * A folder's form, given the form it had: flat (one neighbourhood) or a district form, each with hysteresis. Flattening
 * holds up to 1.5 times the flatten limit; cutting holds down to its inverse.
 */
/** A child folder that would be an island of an archipelago: a package whose land is mostly source (research §5). */
const isIsland = (c: Node) => c.pkg === true && c.mass > 0 && (c.source ?? 0) >= 0.5 * c.mass;

export function classifyNode(
  node: Node,
  previous: Form | undefined,
  enabled: ReadonlySet<Archetype> = new Set(),
): Form {
  let flat = node.children.length === 0 || node.gross <= FLATTEN_LIMIT;
  if (previous && isFlat(previous) && node.children.length > 0) flat = node.gross <= FLATTEN_LIMIT * FLATTEN_HYSTERESIS;
  if (previous && !isFlat(previous))
    flat = node.children.length === 0 || node.gross <= FLATTEN_LIMIT / FLATTEN_HYSTERESIS;
  const f = features(
    node.mass,
    node.children.map((c) => c.mass),
    flat ? flatten(node).lots.length : 0,
  );
  if (enabled.has("archipelago")) {
    const islands = node.children.filter(isIsland);
    f.members = islands.length;
    f.memberCover = node.mass > 0 ? islands.reduce((s, c) => s + c.mass, 0) / node.mass : 0;
  }
  return flat ? flatForm(f, previous) : districtForm(f, previous, enabled);
}

export function layoutTown(
  name: string,
  root: Node,
  options: Options,
  outline: Pt[],
  seedKey: string,
  plat: TownPlat = emptyTownPlat(),
  /** The root's form when the region classifies it over the whole repository, old towns included. */
  rootForm?: Form,
): Town {
  const town: Town = {
    name,
    form: "neighbourhood",
    old: false,
    water: [],
    outline,
    roads: [],
    blocks: [],
    lots: [],
    districts: [],
    stats: { lots: 0, overflow: 0, tests: 0, docs: 0, lotArea: 0, landArea: area(outline) },
  };
  const enabled: ReadonlySet<Archetype> = new Set(options.archetypes ?? []);

  // Road class follows the tier of the folder being cut (mass by decade): only a city earns a boulevard, and only
  // its first cut; the rest of its cuts are one class lower.
  const TIERS: [number, RoadClass, RoadClass][] = [
    [3000, "boulevard", "avenue"],
    [300, "avenue", "collector"],
    [30, "collector", "street"],
    [0, "street", "street"],
  ];
  const coldClass = (mass: number, top: boolean): RoadClass => {
    const tier = TIERS.find(([threshold]) => mass >= threshold)!;
    return top ? tier[1] : tier[2];
  };
  // Tiers (opt-in): the town's tier, held with hysteresis, sets its first cut's class (a hamlet's is a street, a city's
  // a boulevard). Every other cut, the town's later cuts and every nested folder's, stays at least one class below, so
  // a town has one road of its top class and nested folders never outrank it; below that, mass decides as before.
  const tierTop: Record<Tier, RoadClass> = {
    hamlet: "street",
    village: "collector",
    town: "avenue",
    city: "boulevard",
    metropolis: "boulevard",
  };
  const LADDER: RoadClass[] = ["street", "collector", "avenue", "boulevard"];
  if (enabled.has("tiers")) plat.tier = tierOf(root.mass, plat.tier);
  const cutClass = (mass: number, top: boolean, key: string): RoadClass => {
    const cold = coldClass(mass, top);
    if (!plat.tier) return cold;
    const townTop = LADDER.indexOf(tierTop[plat.tier]);
    if (top && key === root.path) return LADDER[townTop];
    return LADDER[Math.min(LADDER.indexOf(cold), Math.max(0, townTop - 1))];
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
    for (const key of Object.keys(plat.radial)) if (owned(key, path)) delete plat.radial[key];
    for (const key of Object.keys(plat.quarters ?? {})) if (owned(key, path)) delete plat.quarters![key];
    for (const key of Object.keys(plat.islands ?? {})) if (owned(key, path)) delete plat.islands![key];
  };

  const place = (poly: Poly, item: Item, district: string) => {
    if (item.kind === "folder") partition(item.node, poly, district);
    else if (item.kind === "group") split(item.items, poly, item.mass, false, item.key, district);
    else if (item.kind === "quarter") quarter(poly, item, district);
    else if (item.kind === "lots") neighbourhood(poly, item.lots, 0, item.key, item.district, "neighbourhood");
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
      const heaviest = part
        .flatMap((i) => (i.kind === "quarter" ? i.members : [i]))
        .filter((i) => i.kind === "folder")
        .sort((p, q) => q.mass - p.mass)[0];
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
    assign?: [Item[], Item[]],
    /** A fixed road class (a quarter's local streets) instead of the class by mass. */
    cls?: RoadClass,
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
      const left = assign ? assign[0] : items.slice(0, k);
      const right = assign ? assign[1] : items.slice(k);
      rec = {
        ...(assign ? { river: true } : {}),
        nx,
        ny,
        c: offsetFor(poly, nx, ny, demandOf(left) / total),
        cls: cls ?? cutClass(mass, top, key),
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

  /** A band of water along a cut, its banks pavement; one bridge, or two at a third and two thirds of a long one. */
  const waterway = (poly: Poly, r: CutRecord, seg: [Pt, Pt], width: number, canal = false) => {
    const water = clip(clip(poly, r.nx, r.ny, r.c + width / 2, 0), -r.nx, -r.ny, -(r.c - width / 2), 0);
    if (water.p.length >= 3) (canal ? (town.canals ??= []) : town.water).push(water.p);
    const length = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
    for (const f of length > 12 * U ? [1 / 3, 2 / 3] : [1 / 2]) {
      const m = { x: seg[0].x + (seg[1].x - seg[0].x) * f, y: seg[0].y + (seg[1].y - seg[0].y) * f };
      const h = width / 2 + PAVEMENT * 2;
      town.roads.push({
        pts: [
          { x: m.x - r.nx * h, y: m.y - r.ny * h },
          { x: m.x + r.nx * h, y: m.y + r.ny * h },
        ],
        cls: "street",
      });
    }
  };

  /** Recursive cuts; in an archipelago (canals) every cut is water, the first a river and the rest canals. */
  const split = (
    items: Item[],
    poly: Poly,
    mass: number,
    top: boolean,
    key: string,
    district: string,
    canals = false,
  ) => {
    const decision = decide(items, poly, mass, top, key);
    if (!decision) return place(poly, items[0], district);
    if (!canals && pinwheel(decision, poly, key, district)) return;
    const { rec: r, left, right } = decision;
    const seg = chord(poly.p, r.nx, r.ny, r.c);
    const major = r.cls !== "street" && r.cls !== "lane";
    const width = canals ? (top ? RIVER : CANAL) : ROAD_WIDTH[r.cls];
    if (seg && left.length > 0 && right.length > 0) {
      if (canals) waterway(poly, r, seg, width, true);
      else town.roads.push({ pts: seg, cls: r.cls });
    }
    if (major) wards(poly, r, left, right, key);
    const halves: [Item[], Poly, string][] = [
      [left, clip(poly, r.nx, r.ny, r.c, left.length && right.length ? width : 0), `${key}>L`],
      [right, clip(poly, -r.nx, -r.ny, -r.c, left.length && right.length ? width : 0), `${key}>R`],
    ];
    for (const [part, half, sub] of halves) {
      if (part.length === 0) reserve(half, district);
      else split(part, half, massOf(part), false, sub, major ? seedOf(sub) : district, canals);
    }
  };

  /** A cut folder's items in age order: its child folders, its own lots, its park. */
  function itemsOf(node: Node, district: string): Item[] {
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
    return items.sort((a, b) => a.firstSeen - b.firstSeen || byPath(a.key, b.key));
  }

  function partition(node: Node, poly: Poly, district: string) {
    const previous = plat.forms[node.path];
    const form = node === root && rootForm ? rootForm : classifyNode(node, previous, enabled);
    if (previous && previous !== form) {
      console.log(`[plat] switch ${node.path || "(root)"} ${previous} -> ${form} mass ${Math.round(node.mass)}`);
      forget(node.path);
    }
    plat.forms[node.path] = form;
    if (node === root) town.form = form;
    if (node.depth >= 1 && (node.depth === 1 || node.mass >= 0.015 * root.mass))
      town.districts.push({ pts: poly.p, path: node.path, name: node.name, depth: node.depth, mass: node.mass, form });
    const blocksBefore = town.blocks.length;
    const lotsBefore = town.lots.length;
    if (isFlat(form)) {
      const f = flatten(node);
      neighbourhood(poly, f.lots, landFor(f.docs * LOT_AREA * 0.5, options.density), node.path, district, form);
    } else {
      const ordered = itemsOf(node, district);
      const done =
        (form === "radial" && radial(node, ordered, poly, district)) ||
        (form === "twin" && twin(node, ordered, poly, district)) ||
        (form === "corridor" && corridor(node, ordered, poly, district)) ||
        (form === "archipelago" && archipelago(node, ordered, poly, district)) ||
        (form === "quarters" && quarters(node, ordered, poly, district));
      if (!done)
        split(
          options.order === "centre-out" ? centreOut(ordered) : ordered,
          poly,
          node.mass,
          true,
          node.path,
          district,
        );
    }
    // Everything laid inside this folder that has no district form yet takes this one.
    if (!isFlat(form)) {
      for (let i = blocksBefore; i < town.blocks.length; i++) town.blocks[i].form ??= form;
      for (let i = lotsBefore; i < town.lots.length; i++) town.lots[i].form ??= form;
    }
  }

  /** The distance from c along direction a to the edge of a convex polygon. */
  const reach = (pts: Pt[], c: Pt, a: number) => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p.x - c.x) * ey - (p.y - c.y) * ex) / den;
      const u = ((p.x - c.x) * dy - (p.y - c.y) * dx) / den;
      if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
    }
    return best;
  };

  /**
   * Corridor (opt-in): a folder whose dominant child holds 90% of its mass collapses into a gateway. The chain of
   * corridor folders below it collapses with it: every level's small items gather in one faubourg, a quarter at the
   * edge of the land cut off by a single avenue, and the first folder below the chain that is no corridor takes the
   * rest. The avenue is the shortest chord that leaves the faubourg its share of the land, so it never crosses town.
   */
  function corridor(node: Node, items: Item[], poly: Poly, district: string): boolean {
    const wayside: Item[] = [];
    const chain: Node[] = [];
    let levelItems = items;
    let core: FolderItem | undefined;
    for (;;) {
      const folders = levelItems.filter((i): i is FolderItem => i.kind === "folder");
      if (folders.length === 0) return false;
      const heaviest = folders.reduce((a, b) => (b.mass > a.mass ? b : a));
      core = heaviest;
      wayside.push(...levelItems.filter((i) => i !== heaviest));
      const next = heaviest.node;
      const previous = plat.forms[next.path];
      if (classifyNode(next, previous, enabled) !== "corridor") break;
      if (previous && previous !== "corridor") {
        console.log(`[plat] switch ${next.path} ${previous} -> corridor mass ${Math.round(next.mass)}`);
        forget(next.path);
      }
      plat.forms[next.path] = "corridor";
      chain.push(next);
      levelItems = itemsOf(next, district);
    }
    if (!core || wayside.length === 0) return false;
    const dest = core;
    const key = node.path;
    let rec: CutRecord | undefined = plat.cuts[key];
    if (rec && (rec.right.length !== 1 || rec.right[0] !== dest.key || !chord(poly.p, rec.nx, rec.ny, rec.c))) {
      console.log(`[plat] corridor ${key || "(root)"} re-laid: destination ${rec.right[0]} -> ${dest.key}`);
      forget(key);
      rec = undefined;
    }
    const dl = demandOf(wayside);
    const dr = dest.gross;
    if (!rec) {
      // The faubourg's avenue: of 32 directions, the one whose cut is shortest; ties go to the earliest.
      const offset = (unit(`${seedOf(key)}#gate`) * Math.PI) / 16;
      let best: { nx: number; ny: number; c: number; length: number } | null = null;
      for (let k = 0; k < 32; k++) {
        const theta = offset + (k * Math.PI) / 16;
        const nx = Math.cos(theta);
        const ny = Math.sin(theta);
        const c = offsetFor(poly, nx, ny, dl / (dl + dr));
        const seg = chord(poly.p, nx, ny, c);
        if (!seg) continue;
        const length = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
        if (!best || length < best.length - 1e-6) best = { nx, ny, c, length };
      }
      if (!best) return false;
      rec = {
        nx: best.nx,
        ny: best.ny,
        c: best.c,
        cls: cutClass(node.mass, false, node.path),
        left: wayside.map((i) => i.key),
        right: [dest.key],
        capLeft: dl * GROWTH_ROOM,
        capRight: dr * GROWTH_ROOM,
      };
      plat.cuts[key] = rec;
    } else {
      // Newcomers join the faubourg; the avenue moves only when a side outgrows its band.
      for (const item of wayside) if (!rec.left.includes(item.key)) rec.left.push(item.key);
      if (dl > rec.capLeft || dr > rec.capRight) {
        console.log(
          `[plat] recut ${key || "(root)"} corridor demand ${Math.round(dl)}/${Math.round(dr)} over ${Math.round(rec.capLeft)}/${Math.round(rec.capRight)}`,
        );
        rec.c = offsetFor(poly, rec.nx, rec.ny, dl / (dl + dr));
        rec.capLeft = dl * GROWTH_ROOM;
        rec.capRight = dr * GROWTH_ROOM;
      }
    }
    const r = rec;
    const w = ROAD_WIDTH[r.cls];
    const seg = chord(poly.p, r.nx, r.ny, r.c);
    if (seg) town.roads.push({ pts: seg, cls: r.cls });
    const major = r.cls !== "street" && r.cls !== "lane";
    if (major) wards(poly, r, wayside, [dest], key);
    const faubourg = clip(poly, r.nx, r.ny, r.c, w);
    const land = clip(poly, -r.nx, -r.ny, -r.c, w);
    for (const level of chain)
      if (level.mass >= 0.015 * root.mass)
        town.districts.push({
          pts: land.p,
          path: level.path,
          name: level.name,
          depth: level.depth,
          mass: level.mass,
          form: "corridor",
        });
    const ordered = [...wayside].sort((a, b) => a.firstSeen - b.firstSeen || byPath(a.key, b.key));
    split(
      options.order === "centre-out" ? centreOut(ordered) : ordered,
      faubourg,
      massOf(wayside),
      false,
      `${key}>L`,
      major ? seedOf(`${key}>L`) : district,
    );
    place(land, dest, major ? seedOf(`${key}>R`) : district);
    return true;
  }

  /**
   * Radial old town: the dominant child at the core, the others in ring sectors ordered by age, a ring road round the
   * core and spokes between the sectors. The core is the polygon through the spokes\x27 inner ends, so every sector is
   * convex: a wedge of the land beyond one chord of the core. Needs three or more ring items and sectors under 171°.
   */
  function radial(node: Node, items: Item[], poly: Poly, district: string): boolean {
    const folders = items.filter((i) => i.kind === "folder");
    if (folders.length === 0) return false;
    const core = folders.reduce((a, b) => (b.mass > a.mass ? b : a));
    const c = centroid(poly.p);
    const totalArea = area(poly.p);
    const totalDemand = demandOf(items);
    const MAX_SPAN = 0.95 * Math.PI;
    const point = (a: number, scale: number): Pt => {
      const r = reach(poly.p, c, a) * scale;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    };
    const sector = (a0: number, a1: number, scale: number, wSpoke: number, wRing: number): Poly => {
      const n0 = [Math.sin(a0), -Math.cos(a0)];
      const n1 = [-Math.sin(a1), Math.cos(a1)];
      const q0 = point(a0, scale);
      const q1 = point(a1, scale);
      let nx = q1.y - q0.y;
      let ny = -(q1.x - q0.x);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      if (nx * (c.x - q0.x) + ny * (c.y - q0.y) > 0) {
        nx = -nx;
        ny = -ny;
      }
      let out = clip(poly, n0[0], n0[1], n0[0] * c.x + n0[1] * c.y, wSpoke);
      out = clip(out, n1[0], n1[1], n1[0] * c.x + n1[1] * c.y, wSpoke);
      return clip(out, -nx, -ny, -(nx * q0.x + ny * q0.y), wRing);
    };
    const angles = (scale: number, start: number, demands: number[]): number[] | null => {
      const bounds = [start];
      for (let i = 0; i < demands.length - 1; i++) {
        const a0 = bounds[i];
        const target = (demands[i] / totalDemand) * totalArea;
        if (area(sector(a0, a0 + MAX_SPAN, scale, 0, 0).p) < target) return null;
        let lo = a0;
        let hi = a0 + MAX_SPAN;
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2;
          if (area(sector(a0, mid, scale, 0, 0).p) < target) lo = mid;
          else hi = mid;
        }
        bounds.push((lo + hi) / 2);
      }
      bounds.push(start + 2 * Math.PI);
      const last = bounds[bounds.length - 1] - bounds[bounds.length - 2];
      return last > 0 && last <= MAX_SPAN ? bounds : null;
    };
    let rec: RadialRecord | undefined = plat.radial[node.path];
    if (rec && rec.core !== core.key) {
      console.log(`[plat] radial core ${node.path} ${rec.core} -> ${core.key}`);
      rec = undefined;
    }
    const ringItems = (order: string[]) => order.map((k) => items.find((i) => i.key === k) ?? null);
    const present = items.filter((i) => i !== core);
    const outgrown =
      rec !== undefined &&
      (present.some((i) => !rec!.order.includes(i.key) || i.gross > (rec!.caps[i.key] ?? 0)) ||
        core.gross > (rec.caps[core.key] ?? 0));
    if (!rec || outgrown) {
      // Lay the sectors: newcomers join the ring\x27s end, gone items keep their sector as reserve until re-sectored.
      const order = rec
        ? [
            ...rec.order.filter((k) => present.some((i) => i.key === k)),
            ...present.filter((i) => !rec!.order.includes(i.key)).map((i) => i.key),
          ]
        : present.map((i) => i.key);
      if (order.length < 3) return false;
      const start = rec?.start ?? unit(`${seedOf(node.path)}#radial`) * 2 * Math.PI;
      const demands = ringItems(order).map((i) => i!.gross);
      let scale = Math.sqrt(core.gross / totalDemand);
      let bounds: number[] | null = null;
      for (let it = 0; it < 4; it++) {
        bounds = angles(scale, start, demands);
        if (!bounds) return false;
        const coreArea = area(bounds.slice(0, -1).map((a) => point(a, scale)));
        scale = Math.min(
          RADIAL_MAX_SCALE,
          scale * Math.sqrt(((core.gross / totalDemand) * totalArea) / Math.max(1, coreArea)),
        );
      }
      bounds = angles(scale, start, demands);
      if (!bounds) return false;
      if (rec) console.log(`[plat] radial re-sector ${node.path || "(root)"}`);
      rec = {
        core: core.key,
        start,
        order,
        bounds,
        scale,
        caps: Object.fromEntries(items.map((i) => [i.key, i.gross * GROWTH_ROOM])),
      };
      plat.radial[node.path] = rec;
    }
    const r = rec;
    const ringClass = cutClass(node.mass, true, node.path);
    const spokeClass = cutClass(node.mass, false, node.path);
    const wRing = ROAD_WIDTH[ringClass];
    const wSpoke = ROAD_WIDTH[spokeClass];
    const inner = r.bounds.slice(0, -1).map((a) => point(a, r.scale));
    town.roads.push({ pts: [...inner, inner[0]], cls: ringClass });
    for (const a of r.bounds.slice(0, -1)) town.roads.push({ pts: [point(a, r.scale), point(a, 1)], cls: spokeClass });
    const sub = (k: string) => seedOf(`${node.path}>${k}`);
    ringItems(r.order).forEach((item, i) => {
      const piece = sector(r.bounds[i], r.bounds[i + 1], r.scale, wSpoke, wRing);
      if (item) place(piece, item, sub(item.key));
      else reserve(piece, district);
    });
    place({ p: inner, w: inner.map(() => wRing) }, core, sub(core.key));
    return true;
  }

  /**
   * Twin city: the two heaviest children face each other across a river, the rest join the lighter bank in age order.
   * The river takes a cut\x27s place; bridges cross it.
   */
  function twin(node: Node, items: Item[], poly: Poly, district: string): boolean {
    const folders = items.filter((i) => i.kind === "folder").sort((a, b) => b.mass - a.mass);
    if (folders.length < 2) return false;
    const left: Item[] = [folders[0]];
    const right: Item[] = [folders[1]];
    for (const item of items) {
      if (item === folders[0] || item === folders[1]) continue;
      (demandOf(left) <= demandOf(right) ? left : right).push(item);
    }
    const decision = decide(items, poly, node.mass, true, node.path, undefined, [left, right]);
    if (!decision || !decision.rec.river) return false;
    const { rec: r, left: l, right: rr } = decision;
    const seg = chord(poly.p, r.nx, r.ny, r.c);
    if (!seg) return false;
    waterway(poly, r, seg, RIVER);
    const banks: [Item[], Poly, string][] = [
      [l, clip(poly, r.nx, r.ny, r.c, RIVER), `${node.path}>L`],
      [rr, clip(poly, -r.nx, -r.ny, -r.c, RIVER), `${node.path}>R`],
    ];
    for (const [part, bank, sub] of banks) {
      if (part.length === 0) reserve(bank, district);
      else split(part, bank, massOf(part), false, sub, seedOf(sub));
    }
    return true;
  }

  /**
   * Archipelago (opt-in): every package child is an island, everything else one mainland; every cut between them is
   * a canal with one bridge, or two on a canal longer than 12 u. The mainland is cut by streets as usual.
   */
  function archipelago(node: Node, items: Item[], poly: Poly, district: string): boolean {
    const packages = items.filter((i) => i.kind === "folder" && isIsland(i.node));
    if (packages.length < 2) return false;
    const islands = packages.length > ISLAND_CAP ? islandGroups(node, packages) : packages;
    const rest = items.filter((i) => !packages.includes(i));
    const mainland: Item[] =
      rest.length <= 1
        ? rest
        : [
            {
              kind: "group",
              items: rest,
              gross: demandOf(rest),
              mass: massOf(rest),
              firstSeen: Math.min(...rest.map((i) => i.firstSeen)),
              key: `${node.path}#mainland`,
            },
          ];
    const ordered = [...islands, ...mainland].sort((a, b) => a.firstSeen - b.firstSeen || byPath(a.key, b.key));
    split(
      options.order === "centre-out" ? centreOut(ordered) : ordered,
      poly,
      node.mass,
      true,
      node.path,
      district,
      true,
    );
    return true;
  }

  /**
   * More packages than a dozen share islands: packages join islands in age order, an island closing at a dozenth of
   * the packages' mass, so there are about a dozen canals however many packages there are. Roads, not canals, run
   * between the packages of one island. Membership is remembered; a newcomer joins the last island while it is under a
   * dozenth, else founds the next.
   */
  function islandGroups(node: Node, packages: Item[]): Item[] {
    const byKey = new Map(packages.map((i) => [i.key, i]));
    const share = massOf(packages) / ISLAND_CAP;
    const weight = (keys: string[]) => keys.reduce((sum, k) => sum + (byKey.get(k)?.mass ?? 0), 0);
    const records = (plat.islands ??= {});
    let groups = records[node.path];
    if (!groups) {
      groups = [];
      let current: string[] = [];
      for (const item of packages) {
        current.push(item.key);
        if (weight(current) >= share) {
          groups.push(current);
          current = [];
        }
      }
      if (current.length > 0) groups.push(current);
    } else {
      groups = groups.map((g) => g.filter((k) => byKey.has(k)));
      const known = new Set(groups.flat());
      for (const item of packages) {
        if (known.has(item.key)) continue;
        const last = groups[groups.length - 1];
        if (last && weight(last) < share) last.push(item.key);
        else groups.push([item.key]);
      }
    }
    records[node.path] = groups;
    return groups.flatMap((keys, g) => {
      const members = keys.map((k) => byKey.get(k)!);
      if (members.length === 0) return [];
      if (members.length === 1) return members;
      return [
        {
          kind: "group" as const,
          items: members,
          gross: demandOf(members),
          mass: massOf(members),
          firstSeen: Math.min(...members.map((m) => m.firstSeen)),
          key: `${node.path}#island${g}`,
        },
      ];
    });
  }

  /**
   * Quarters (opt-in): many comparable children are grouped into planned quarters. Children small enough to flatten
   * join quarters in age order, a quarter closing once its members need about 24 blocks. Quarters and the children too
   * big for one are cut as usual, so collectors run between quarters; inside a quarter every cut is a local street
   * square to the quarter's frame. Membership is remembered; a newcomer joins the last quarter while it has room, else
   * opens the next one at the frontier.
   */
  function quarters(node: Node, items: Item[], poly: Poly, district: string): boolean {
    const forms = new Map<string, Form>();
    const eligible = items.filter((i) => {
      if (i.kind === "lots") return true;
      if (i.kind !== "folder" || i.gross > QUARTER_LAND) return false;
      const form = classifyNode(i.node, plat.forms[i.node.path], enabled);
      forms.set(i.key, form);
      return isFlat(form);
    });
    if (eligible.length < 2) return false;
    const byKey = new Map(eligible.map((i) => [i.key, i]));
    const demand = (keys: string[]) => keys.reduce((s, k) => s + (byKey.get(k)?.gross ?? 0), 0);
    const records = (plat.quarters ??= {});
    let groups = records[node.path];
    if (!groups) {
      groups = [];
      let current: string[] = [];
      for (const item of eligible) {
        current.push(item.key);
        if (demand(current) >= QUARTER_LAND) {
          groups.push(current);
          current = [];
        }
      }
      if (current.length > 0) {
        if (groups.length > 0 && demand(current) < QUARTER_TAIL * QUARTER_LAND)
          groups[groups.length - 1].push(...current);
        else groups.push(current);
      }
    } else {
      // Members that left (deleted, or grown past flattening) drop out; a quarter keeps its index even when empty.
      groups = groups.map((g) => g.filter((k) => byKey.has(k)));
      const known = new Set(groups.flat());
      for (const item of eligible) {
        if (known.has(item.key)) continue;
        const last = groups[groups.length - 1];
        if (last && demand(last) < QUARTER_LAND) last.push(item.key);
        else groups.push([item.key]);
      }
    }
    records[node.path] = groups;
    for (const [key, form] of forms) if (byKey.has(key)) plat.forms[key] = form;
    const grouped = new Set(groups.flat());
    const quarterItems: Item[] = groups.flatMap((keys, q) => {
      const members = keys.map((k) => byKey.get(k)!);
      if (members.length === 0) return [];
      return [
        {
          kind: "quarter" as const,
          members,
          gross: demandOf(members),
          mass: massOf(members),
          firstSeen: Math.min(...members.map((m) => m.firstSeen)),
          key: `${node.path}#q${q}`,
        },
      ];
    });
    const ordered = [...quarterItems, ...items.filter((i) => !grouped.has(i.key))].sort(
      (a, b) => a.firstSeen - b.firstSeen || byPath(a.key, b.key),
    );
    split(options.order === "centre-out" ? centreOut(ordered) : ordered, poly, node.mass, true, node.path, district);
    return true;
  }

  /**
   * One quarter, cut square to its own frame (its longest edge) with local streets only, so every member is a
   * rectangle-like block of one orientation and the quarter reads as one planned neighbourhood.
   */
  function quarter(poly: Poly, item: Extract<Item, { kind: "quarter" }>, district: string) {
    // A quarter takes the name of its heaviest folder, like a ward.
    const heaviest = item.members.filter((m) => m.kind === "folder").sort((p, q) => q.mass - p.mass)[0];
    if (heaviest && heaviest.kind === "folder")
      town.districts.push({ pts: poly.p, path: item.key, name: heaviest.node.name, depth: 9, mass: item.mass });
    frameSplit(item.members, poly, item.key, district, longestEdgeAngle(poly.p));
  }

  const frameSplit = (items: Item[], poly: Poly, key: string, district: string, theta: number) => {
    const along = extent(poly.p, Math.cos(theta), Math.sin(theta));
    const across = extent(poly.p, -Math.sin(theta), Math.cos(theta));
    const base = along[1] - along[0] >= across[1] - across[0] ? theta : theta + Math.PI / 2;
    const decision = decide(
      items,
      poly,
      massOf(items),
      false,
      key,
      [Math.cos(base), Math.sin(base)],
      undefined,
      "street",
    );
    if (!decision) return place(poly, items[0], district);
    const { rec: r, left, right } = decision;
    const seg = chord(poly.p, r.nx, r.ny, r.c);
    const both = left.length > 0 && right.length > 0;
    if (seg && both) town.roads.push({ pts: seg, cls: r.cls });
    const halves: [Item[], Poly, string][] = [
      [left, clip(poly, r.nx, r.ny, r.c, both ? ROAD_WIDTH[r.cls] : 0), `${key}>L`],
      [right, clip(poly, -r.nx, -r.ny, -r.c, both ? ROAD_WIDTH[r.cls] : 0), `${key}>R`],
    ];
    for (const [part, half, sub] of halves) {
      if (part.length === 0) reserve(half, district);
      else frameSplit(part, half, sub, district, theta);
    }
  };

  function park(poly: Poly, district: string) {
    const p = inset(poly, PAVEMENT);
    if (p.p.length >= 3) town.blocks.push({ pts: p.p, district, kind: "park" });
  }

  function reserve(poly: Poly, district: string) {
    const p = inset(poly, PAVEMENT);
    if (p.p.length >= 3) town.blocks.push({ pts: p.p, district, kind: "open" });
  }

  function neighbourhood(
    raw: Poly,
    lots: FileRecord[],
    parkGross: number,
    key: string,
    district: string,
    form: FlatForm,
  ) {
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
    if (g.span === 0 && form === "street-village" && rMax > rMin) g.high = Math.round((rMin + rMax + 1) / 2);
    for (let r = rMin + 1; r <= rMax; r++) {
      const seg = chord(land.p, bx, by, g.b0 + r * g.rowPitch - U / 2);
      if (seg) town.roads.push({ pts: seg, cls: r === g.high ? "collector" : "street" });
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
        if (`${cell.r},${cell.c}` === g.green) return;
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
    if (g.span === 0 && form === "hamlet") {
      // A hamlet gathers round a green: the full cell nearest the heart of its land.
      const heart = centroid(land.p);
      const full = cells.filter((cell) => cell.halves.length > 0);
      const nearest = full.sort(
        (a, b) =>
          Math.hypot(centroid(a.pts).x - heart.x, centroid(a.pts).y - heart.y) -
          Math.hypot(centroid(b.pts).x - heart.x, centroid(b.pts).y - heart.y),
      )[0];
      if (nearest && full.length > 1) {
        g.green = `${nearest.r},${nearest.c}`;
        // The green only takes a block the lots can spare.
        if (slotsFor(1).length < lots.length) g.green = undefined;
      }
    }
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
    const ordered = slotsFor(g.span);
    // A street village fills outward from its high street: the rows either side of it first.
    const fromHigh = (r: number) => (g.high === undefined ? 0 : r >= g.high ? r - g.high : g.high - 1 - r);
    const slots =
      g.high === undefined
        ? ordered
        : ordered
            .map((s, i) => ({ s, i, d: fromHigh(cells[s.block].r) }))
            .sort((a, b) => a.d - b.d || a.i - b.i)
            .map((x) => x.s);
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
    for (const cell of cells)
      town.blocks.push({
        pts: cell.pts,
        district,
        kind: `${cell.r},${cell.c}` === g.green ? "park" : cell.used ? "built" : "open",
      });
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
    town.water = town.water.map((w) => bend(w, true, 8));
    if (town.canals) town.canals = town.canals.map((w) => bend(w, true, 8));
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
