import { classifyNode } from "../archetype/classify";
import { isFlat, type Form } from "../archetype/forms";
import type { City, Road, Town } from "../city/city";
import { GROWTH_PCT } from "../constants";
import { CitymapError } from "../errors";
import { floorDiv, isqrt, mulDiv } from "../fixed/arithmetic";
import { DIRECTION, TURN, dir, normalise, type Dir } from "../fixed/direction";
import { compareKeys, fnv1a } from "../fixed/hash";
import { centroid, type Pt } from "../fixed/polygon";
import { densify, warper } from "../fixed/warp";
import { classifyLandUse, landKey, type LandUse } from "../land-use/land-use";
import { emptyTownPlat, type OldTown, type Plat } from "../plat/plat";
import { MAX_FILES, type FileEntry, type Snapshot } from "../snapshot/snapshot";
import { seedsOf, type LayHooks, type PlatEvent, type TownCache } from "../town/context";
import { layoutTown } from "../town/layout";
import { buildTree, type Shares, type TreeOptions } from "../tree/tree";
import { workspaceGroups, workspaceMembers } from "../workspace/workspace";
import { highwayBetween, withApproach } from "./highway";
import { outlineFor } from "./outline";

export interface Options {
  readonly densityPct: number;
  readonly landUses: readonly LandUse[];
  readonly order: "centre-out" | "first-seen";
  readonly jog: "off" | "top-level" | "all";
  readonly warp: boolean;
  /** Lanes joining nearby dead ends; on unless false. They never touch the plat. */
  readonly loops?: boolean;
  /** Workspace groups whose members each become a town, by folder path or name; `apps` by default. */
  readonly split?: readonly string[];
}

/** Each app of an `apps/` group is its own town by default; other groups stay one town each. */
export const DEFAULT_SPLIT: readonly string[] = ["apps"];

/** The setting a plat is laid for: its land uses and its split groups. Each setting has its own plat. */
export const settingKey = (options: Options) =>
  `${landKey(options.landUses)}|split:${(options.split ?? DEFAULT_SPLIT).toSorted(compareKeys).join(",")}`;

/** The locality caches of a fold, per town, and how often they spared a folder its layout. */
export interface FoldCache {
  readonly towns: Record<string, TownCache>;
  hits: number;
}

/**
 * The plat and the runtime state a fold carries between commits: each town as last laid (to freeze on a switch), and
 * the locality cache. Only the plat is persisted.
 */
export interface FoldState {
  readonly plat: Plat;
  readonly last: Readonly<Record<string, Town>>;
  readonly cache?: FoldCache;
}

/** Open country between towns. */
const GAP = 720;

interface Part {
  readonly name: string;
  readonly key: string;
  readonly root: string;
  readonly exclude: readonly string[];
  readonly firstSeen: number;
}

/** The radius of a circle of the given doubled area, widened by 8 %. */
const radiusOf = (area2: number) => floorDiv(isqrt(floorDiv(area2 * 113, 2 * 355)) * 108, 100);
const distance2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const along = (d: Dir, length: number): Pt => ({
  x: mulDiv(d[0], length, DIRECTION, "round"),
  y: mulDiv(d[1], length, DIRECTION, "round"),
});

/** The steps (0.01 rad each) of a hash, as angle steps. */
const hashAngle = (key: string, modulo: number) => floorDiv((fnv1a(key) % modulo) * TURN * 100, 628 * 100);

/** A town moved by an offset: every point of its outline, water, roads, blocks, lots and districts. */
export function translateTown(town: Town, by: Pt): Town {
  const move = (pts: readonly Pt[]) => pts.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));
  return {
    ...town,
    outline: move(town.outline),
    water: town.water.map(move),
    roads: town.roads.map((r) => ({ ...r, pts: move(r.pts) })),
    blocks: town.blocks.map((b) => ({ ...b, pts: move(b.pts) })),
    lots: town.lots.map((l) => ({ ...l, pts: move(l.pts) })),
    districts: town.districts.map((d) => ({ ...d, pts: move(d.pts) })),
  };
}

/** The circle a town stands in: its heart and its reach. */
function footprint(t: Town) {
  const c = centroid(t.outline);
  return { centre: c, radius: isqrt(Math.max(...t.outline.map((p) => distance2(p, c)))) };
}

function oldTownName(name: string, count: number) {
  return count > 1 ? `${name} old town ${count}` : `${name} old town`;
}

/** Lays out one commit's city from the plat and returns the new state. Pure. */
/** The largest absolute coordinate a laid city may reach, in fixed units (a warp's memory packs 22 bits a side). */
export const COORD_LIMIT = 2 ** 21;

/** Rejects a city whose towns or highways reach the coordinate limit; lots and roads lie within their towns. */
export function checkExtent(
  towns: readonly { readonly outline: readonly Pt[] }[],
  highways: readonly { readonly pts: readonly Pt[] }[],
): void {
  const points = [...towns.flatMap((t) => t.outline), ...highways.flatMap((h) => h.pts)];
  const far = points.find((p) => Math.abs(p.x) >= COORD_LIMIT || Math.abs(p.y) >= COORD_LIMIT);
  if (far)
    throw new CitymapError("city/too-large", `the city reaches ${far.x}, ${far.y}, past ${COORD_LIMIT}`, {
      x: far.x,
      y: far.y,
    });
}

/** Built trees, kept per file list: a commit that leaves the files and the shares as they were builds the same tree. */
const trees = new WeakMap<readonly FileEntry[], Map<string, { shares: Shares; folders: unknown; built: Built }>>();
const NO_SHARES: Shares = {};
type Built = ReturnType<typeof buildTree>;

function treeOf(
  snapshot: Snapshot,
  files: readonly FileEntry[],
  options: TreeOptions,
  shares: Shares,
  useOf: (path: string) => LandUse,
): Built {
  const key = `${options.root}|${options.exclude.join(",")}|${options.landUses.join(",")}|${options.densityPct}`;
  const byKey = trees.get(files) ?? new Map();
  trees.set(files, byKey);
  const kept = byKey.get(key);
  if (kept && kept.shares === shares && kept.folders === snapshot.folderFirstSeen) return kept.built;
  const built = buildTree({ ...snapshot, files }, options, shares, useOf);
  byKey.set(key, { shares, folders: snapshot.folderFirstSeen, built });
  return built;
}

/** The files no old town holds, kept per old-town list so the same list comes back while nothing changed. */
const outside = new WeakMap<readonly OldTown[], { files: readonly FileEntry[]; kept: readonly FileEntry[] }>();
function filesOutside(files: readonly FileEntry[], old: readonly OldTown[] | undefined): readonly FileEntry[] {
  if (!old) return files;
  const known = outside.get(old);
  if (known && known.files === files) return known.kept;
  const held = new Set(old.flatMap((o) => Object.values(o.members).flat()));
  const kept = files.filter((f) => !held.has(f.identity));
  outside.set(old, { files, kept });
  return kept;
}

interface Derived {
  readonly workspaces: readonly string[] | undefined;
  readonly useOf: (path: string) => LandUse;
  readonly groups: readonly string[];
  readonly memberFolders: readonly string[];
  readonly live: ReadonlySet<string>;
}
/** What a file list says on its own, kept per list: a commit that only edits files hands over the same list. */
const derived = new WeakMap<readonly FileEntry[], Derived>();

function derive(snapshot: Snapshot): Derived {
  const kept = derived.get(snapshot.files);
  if (kept && kept.workspaces === snapshot.workspaces) return kept;
  // Each path's land use, classified once for every tree a lay builds.
  const uses = new Map(snapshot.files.map((f) => [f.path, classifyLandUse(f.path)]));
  const useOf = (path: string) => uses.get(path)!;
  const paths = snapshot.files.map((f) => f.path);
  const fresh: Derived = {
    workspaces: snapshot.workspaces,
    useOf,
    groups: workspaceGroups(paths, useOf, snapshot.workspaces),
    memberFolders: workspaceMembers(paths, snapshot.workspaces),
    live: new Set(snapshot.files.map((f) => f.identity)),
  };
  derived.set(snapshot.files, fresh);
  return fresh;
}

/**
 * How far a lay has come, in lot seeds: `lots` in every town it lays, `placed` by their neighbourhoods so far, and
 * `shaped` by their warps (or at once, unwarped). Heard only: the city is the same with or without a listener.
 */
export interface LayProgress {
  readonly placed: number;
  readonly shaped: number;
  readonly lots: number;
}

export function layCity(
  snapshot: Snapshot,
  state: FoldState,
  options: Options,
  onProgress?: (progress: LayProgress) => void,
): { city: City; state: FoldState; events: PlatEvent[] } {
  if (snapshot.files.length > MAX_FILES)
    throw new CitymapError("snapshot/too-large", `a snapshot holds at most ${MAX_FILES} files`, {
      files: snapshot.files.length,
    });
  const key = settingKey(options);
  if (state.plat.setting !== key)
    throw new CitymapError("plat/setting-mismatch", `the plat is for ${state.plat.setting}, not ${key}`, {
      plat: state.plat.setting,
      options: key,
    });
  // Shallow copies of the records this lay changes; each town's own plat is copied where it is laid.
  const plat: Plat = {
    ...state.plat,
    towns: { ...state.plat.towns },
    old: { ...state.plat.old },
    rootForms: { ...state.plat.rootForms },
  };
  const { useOf, groups, memberFolders, live } = derive(snapshot);
  // The towns this lay lays, and nothing else: a town not laid now (it has no land) stood as nothing, so a later switch
  // freezes nothing for it, and laying the same commit again rebuilds this record exactly.
  const last: Record<string, Town> = {};
  const events: PlatEvent[] = [];
  const split = options.split ?? DEFAULT_SPLIT;
  const isSplit = (group: string) => split.includes(group) || split.includes(group.slice(group.lastIndexOf("/") + 1));
  const firstSeen = (folder: string) => snapshot.folderFirstSeen.get(folder) ?? 0;
  // A split group lends each member a town of its own; its other files stay in the main town.
  const townRoots = groups.flatMap((g) => (isSplit(g) ? memberFolders.filter((m) => m.startsWith(`${g}/`)) : [g]));
  const parts: Part[] = [
    { name: snapshot.repository, key: snapshot.repository, root: "", exclude: townRoots, firstSeen: 0 },
    ...townRoots
      .map((t) => ({ name: t, key: `${snapshot.repository}/${t}`, root: t, exclude: [], firstSeen: firstSeen(t) }))
      .toSorted((a, b) => a.firstSeen - b.firstSeen || compareKeys(a.name, b.name)),
  ];
  const treeOptions = (part: Part) => ({
    root: part.root,
    exclude: part.exclude,
    landUses: options.landUses,
    densityPct: options.densityPct,
  });

  // Each part's tree, without the files its old towns hold; a root switch first freezes the town as it stood.
  const laidParts = parts.flatMap((part) => {
    const treeFor = () =>
      treeOf(
        snapshot,
        filesOutside(snapshot.files, plat.old[part.key]),
        treeOptions(part),
        (plat.towns[part.key] ?? emptyTownPlat()).shares,
        useOf,
      );
    let built = treeFor();
    // The root's form is judged over the whole part, old towns' files included; without old towns that is this tree.
    const whole = plat.old[part.key]
      ? treeOf(snapshot, snapshot.files, treeOptions(part), NO_SHARES, useOf).tree
      : built.tree;
    const previous = plat.rootForms[part.key];
    const rootForm: Form = classifyNode(whole, previous);
    plat.rootForms[part.key] = rootForm;
    const before = state.last[part.key];
    const switched = previous !== undefined && rootForm !== previous && !(isFlat(previous) && isFlat(rootForm));
    if (switched && before) {
      // A town laid before has its plat.
      const townPlat = plat.towns[part.key]!;
      const members: Record<string, string[]> = {};
      for (const lots of Object.values(townPlat.shares)) for (const lot of lots) members[lot.key] = [...lot.members];
      for (const lot of before.lots) if (!lot.vacant) members[lot.key] ??= [lot.key];
      const list = [...(plat.old[part.key] ?? [])];
      plat.old[part.key] = list;
      const name = oldTownName(part.name, list.length + 1);
      const oldKey = oldTownName(part.key, list.length + 1);
      events.push({
        code: "plat/old-town",
        detail: { key: part.key, from: previous, to: rootForm, lots: before.lots.length },
      });
      list.push({ town: { ...before, key: oldKey, name, old: true }, members });
      plat.towns[part.key] = emptyTownPlat();
      built = treeFor();
    }
    return built.tree.demand > 0 ? [{ part, rootForm, ...built }] : [];
  });

  // Old towns stay where they stood; their lots stay lit while any of their files lives.
  const oldTowns: { town: Town; successor: string }[] = Object.entries(plat.old)
    .toSorted(([a], [b]) => compareKeys(a, b))
    .flatMap(([successor, list]: [string, OldTown[]]) =>
      list.map((o) => ({
        successor,
        town: {
          ...o.town,
          lots: o.town.lots.map((l) => ({ ...l, vacant: !(o.members[l.key] ?? []).some((m) => live.has(m)) })),
        },
      })),
    );
  const progress = { placed: 0, shaped: 0, lots: laidParts.reduce((sum, p) => sum + seedsOf(p.tree), 0) };
  const tell = () => onProgress?.({ ...progress });
  const hooks: LayHooks | undefined = onProgress && {
    placed: (seeds) => {
      progress.placed += seeds;
      tell();
    },
    shaped: (seeds) => {
      progress.shaped += seeds;
      tell();
    },
  };
  tell();
  const blockers = oldTowns.map((o) => footprint(o.town));
  const placed: { centre: Pt; radius: number }[] = [];
  const towns: Town[] = [];

  laidParts.forEach(({ part, rootForm, tree, shares, offLand, docs }, i) => {
    const townPlat = { ...(plat.towns[part.key] ?? emptyTownPlat()), shares };
    const demand2 = tree.demand * 2;
    if (townPlat.area2 === 0 || demand2 > townPlat.cap2) {
      if (townPlat.area2 > 0)
        events.push({ code: "plat/grow", detail: { key: part.key, from: townPlat.area2, to: demand2 } });
      townPlat.area2 = Math.max(townPlat.area2, demand2);
      townPlat.cap2 = floorDiv(demand2 * GROWTH_PCT, 100);
    }
    const radius = radiusOf(townPlat.area2);
    const clear = (c: Pt) =>
      [...placed, ...blockers].every((p) => distance2(p.centre, c) >= (p.radius + radius + floorDiv(GAP * 6, 10)) ** 2);
    const outward = (from: Pt, d: Dir) => {
      let length = isqrt(distance2(from, { x: 0, y: 0 }));
      let c = from;
      while (!clear(c)) {
        length += GAP / 2;
        c = along(d, length);
      }
      return c;
    };
    let centre: Pt;
    if (townPlat.centre) {
      // A remembered town stays put unless a neighbour grew into it; then it moves straight outward.
      const c = townPlat.centre;
      const d = c.x === 0 && c.y === 0 ? dir(hashAngle(part.key, 628)) : normalise(c.x, c.y);
      centre = outward(c, d);
    } else if (i === 0) {
      centre = outward({ x: 0, y: 0 }, dir(hashAngle(`${part.key}#new`, 628)));
    } else {
      const angle =
        -TURN / 4 + floorDiv((i - 1) * TURN, laidParts.length - 1) + floorDiv((fnv1a(part.key) % 100) * 163, 100);
      const d = dir(angle);
      // The main town is placed first, so a group town starts beyond it.
      centre = outward(along(d, placed[0]!.radius + radius + GAP), d);
    }
    townPlat.centre = centre;
    placed.push({ centre, radius });
    // A town is laid in its own coordinates, about its centre, then set down where it stands: a town that moves
    // outward moves whole, and its cuts, grids and warp never shift inside it.
    const outline = outlineFor(townPlat.area2, { x: 0, y: 0 }, part.key);
    const cache = state.cache
      ? (state.cache.towns[part.key] ??= { constants: "", entries: new Map(), hits: 0 })
      : undefined;
    const hitsBefore = cache?.hits ?? 0;
    const laid = layoutTown(part.name, part.key, tree, outline, townPlat, options, rootForm, cache, hooks);
    if (state.cache && cache) state.cache.hits += cache.hits - hitsBefore;
    events.push(...laid.events);
    plat.towns[part.key] = laid.plat;
    const town: Town = { ...translateTown(laid.town, centre), stats: { ...laid.town.stats, offLand, docs } };
    last[part.key] = town;
    towns.push(town);
  });

  // Highways join each group town to the main town, and each old town to the town that replaced it.
  const joined = new Map<Town, Town>();
  const ready = (town: Town, toward: Town) => {
    const t2 = withApproach(joined.get(town) ?? town, centroid(toward.outline));
    joined.set(town, t2);
    return t2;
  };
  const highways: Road[] = [];
  const pairs: [Town, Town][] = [];
  const main = towns[0];
  if (main) for (const town of towns.slice(1)) pairs.push([main, town]);
  for (const o of oldTowns) {
    const successor = towns.find((t2) => t2.key === o.successor) ?? main;
    if (successor) pairs.push([successor, o.town]);
  }
  for (const [from, to] of pairs) highways.push(highwayBetween(ready(from, to), ready(to, from)));
  const bend = warper(fnv1a(snapshot.repository) ^ 0x51ed27, [[240, 5600]]);
  // The bend fades to nothing at both ends, so a highway meets its roads exactly.
  const fade = (pts: Pt[]) =>
    pts.map((p, i) => {
      const n = pts.length - 1;
      const weight = floorDiv(4000 * i * (n - i), n * n);
      const q = bend(p);
      return { x: p.x + mulDiv(q.x - p.x, weight, 1000, "round"), y: p.y + mulDiv(q.y - p.y, weight, 1000, "round") };
    });
  const finalTowns = [...towns, ...oldTowns.map((o) => o.town)].map((t2) => joined.get(t2) ?? t2);
  const finalHighways = options.warp ? highways.map((h) => ({ ...h, pts: fade(densify(h.pts, 80, false)) })) : highways;
  checkExtent(finalTowns, finalHighways);
  return {
    city: { repository: snapshot.repository, commit: snapshot.commit, towns: finalTowns, highways: finalHighways },
    state: state.cache ? { plat, last, cache: state.cache } : { plat, last },
    events,
  };
}
