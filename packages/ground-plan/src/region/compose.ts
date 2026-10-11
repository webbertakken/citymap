import { classifyNode } from "../archetype/classify";
import { isFlat, type Form } from "../archetype/forms";
import type { City, Road, Town } from "../city/city";
import type { RoadClass } from "../constants";
import { CitymapError } from "../errors";
import { floorDiv, isqrt, mulDiv } from "../fixed/arithmetic";
import { DIRECTION, TURN, dir, normalise, type Dir } from "../fixed/direction";
import { compareKeys, fnv1a } from "../fixed/hash";
import { centroid, type Pt } from "../fixed/polygon";
import { densify, warper } from "../fixed/warp";
import { landKey, type LandUse } from "../land-use/land-use";
import { emptyTownPlat, type OldTown, type Plat } from "../plat/plat";
import type { Snapshot } from "../snapshot/snapshot";
import type { PlatEvent } from "../town/context";
import { layoutTown } from "../town/layout";
import { buildTree } from "../tree/tree";
import { workspaceGroups } from "../workspace/workspace";
import { outlineFor } from "./outline";

export interface Options {
  readonly densityPct: number;
  readonly landUses: readonly LandUse[];
  readonly order: "centre-out" | "first-seen";
  readonly jog: "off" | "top-level" | "all";
  readonly warp: boolean;
}

/** The plat and the runtime state a fold carries between commits: each town as last laid, to freeze on a switch. */
export interface FoldState {
  readonly plat: Plat;
  readonly last: Readonly<Record<string, Town>>;
}

const GROWTH_PCT = 135;
/** Open country between towns. */
const GAP = 720;
const RANK: readonly RoadClass[] = ["lane", "street", "collector", "avenue", "boulevard"];

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

function oldTownName(name: string, count: number) {
  return count > 1 ? `${name} old town ${count}` : `${name} old town`;
}

/** Lays out one commit's city from the plat and returns the new state. Pure. */
export function layCity(
  snapshot: Snapshot,
  state: FoldState,
  options: Options,
): { city: City; state: FoldState; events: PlatEvent[] } {
  const key = landKey(options.landUses);
  if (state.plat.landKey !== key)
    throw new CitymapError("plat/land-mismatch", `the plat is for land ${state.plat.landKey}, not ${key}`, {
      plat: state.plat.landKey,
      options: key,
    });
  const plat: Plat = structuredClone(state.plat);
  const last: Record<string, Town> = { ...state.last };
  const events: PlatEvent[] = [];
  const groups = workspaceGroups(snapshot.files.map((f) => f.path));
  const parts: Part[] = [
    { name: snapshot.repository, key: snapshot.repository, root: "", exclude: groups, firstSeen: 0 },
    ...groups
      .map((g) => ({ name: g, key: `${snapshot.repository}/${g}`, root: g, exclude: [], firstSeen: snapshot.folderFirstSeen.get(g) ?? 0 }))
      .sort((a, b) => a.firstSeen - b.firstSeen || compareKeys(a.name, b.name)),
  ];
  const live = new Set(snapshot.files.map((f) => f.identity));
  const treeOptions = (part: Part) => ({ root: part.root, exclude: part.exclude, landUses: options.landUses, densityPct: options.densityPct });

  // Each part's tree, without the files its old towns hold; a root switch first freezes the town as it stood.
  const laidParts = parts.flatMap((part) => {
    const heldBy = (p: string) => new Set((plat.old[p] ?? []).flatMap((o) => Object.values(o.members).flat()));
    const treeFor = () => {
      const held = heldBy(part.key);
      const files = held.size > 0 ? snapshot.files.filter((f) => !held.has(f.identity)) : snapshot.files;
      return buildTree({ ...snapshot, files }, treeOptions(part), (plat.towns[part.key] ?? emptyTownPlat()).shares);
    };
    const whole = buildTree(snapshot, treeOptions(part), {}).tree;
    const previous = plat.rootForms[part.key];
    const rootForm: Form = classifyNode(whole, previous);
    plat.rootForms[part.key] = rootForm;
    const before = last[part.key];
    const switched = previous !== undefined && rootForm !== previous && !(isFlat(previous) && isFlat(rootForm));
    if (switched && before) {
      const townPlat = plat.towns[part.key] ?? emptyTownPlat();
      const members: Record<string, string[]> = {};
      for (const lots of Object.values(townPlat.shares)) for (const lot of lots) members[lot.key] = [...lot.members];
      for (const lot of before.lots) if (!lot.vacant) members[lot.key] ??= [lot.key];
      const list = (plat.old[part.key] ??= []);
      const name = oldTownName(part.name, list.length + 1);
      events.push({ code: "plat/old-town", detail: { key: part.key, from: previous, to: rootForm, lots: before.lots.length } });
      list.push({ town: { ...before, name, old: true }, members });
      plat.towns[part.key] = emptyTownPlat();
    }
    const built = treeFor();
    return built.tree.demand > 0 ? [{ part, rootForm, ...built }] : [];
  });

  // Old towns stay where they stood; their lots stay lit while any of their files lives.
  const oldTowns: { town: Town; successor: string }[] = Object.entries(plat.old)
    .sort(([a], [b]) => compareKeys(a, b))
    .flatMap(([successor, list]: [string, OldTown[]]) =>
      list.map((o) => ({
        successor,
        town: { ...o.town, lots: o.town.lots.map((l) => ({ ...l, vacant: !(o.members[l.key] ?? []).some((m) => live.has(m)) })) },
      })),
    );
  const footprint = (t: Town) => {
    const c = centroid(t.outline);
    return { centre: c, radius: isqrt(Math.max(...t.outline.map((p) => distance2(p, c)))) };
  };
  const blockers = oldTowns.map((o) => footprint(o.town));
  const placed: { centre: Pt; radius: number }[] = [];
  const towns: Town[] = [];
  const firstRadius = (index: number) => (placed[0] ? placed[0].radius : 0) + index;

  laidParts.forEach(({ part, rootForm, tree, shares, offLand, docs }, i) => {
    const townPlat = { ...(plat.towns[part.key] ?? emptyTownPlat()), shares };
    const demand2 = tree.demand * 2;
    if (townPlat.area2 === 0 || demand2 > townPlat.cap2) {
      if (townPlat.area2 > 0) events.push({ code: "plat/grow", detail: { key: part.key, from: townPlat.area2, to: demand2 } });
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
      const angle = -TURN / 4 + floorDiv((i - 1) * TURN, laidParts.length - 1) + floorDiv((fnv1a(part.key) % 100) * 163, 100);
      const d = dir(angle);
      centre = outward(along(d, firstRadius(radius + GAP)), d);
    }
    townPlat.centre = centre;
    placed.push({ centre, radius });
    const outline = outlineFor(townPlat.area2, centre, part.key);
    const laid = layoutTown(part.name, part.key, tree, outline, townPlat, options, rootForm);
    events.push(...laid.events);
    plat.towns[part.key] = laid.plat;
    const town: Town = { ...laid.town, stats: { ...laid.town.stats, offLand, docs } };
    last[part.key] = town;
    towns.push(town);
  });

  // Highways join a real road of one class in both towns at their edges, and take that class: seamless roads.
  const highways: Road[] = [];
  const withApproach = new Map<Town, Town>();
  const ends = (town: Town, toward: Pt) => {
    let t = withApproach.get(town) ?? town;
    const c = centroid(t.outline);
    if (t.roads.length === 0) {
      const door = t.outline.reduce((a, b) => (distance2(b, toward) < distance2(a, toward) ? b : a));
      t = { ...t, roads: [{ pts: [door, c], cls: "street" }] };
    }
    withApproach.set(town, t);
    const reach2 = Math.max(...t.outline.map((p) => distance2(p, c)));
    const all = t.roads.flatMap((r) => [
      { p: r.pts[0] as Pt, rank: RANK.indexOf(r.cls) },
      { p: r.pts[r.pts.length - 1] as Pt, rank: RANK.indexOf(r.cls) },
    ]);
    const edge = all.filter((e) => distance2(e.p, c) * 100 >= 64 * reach2);
    return edge.length > 0 ? edge : all;
  };
  const join = (from: Town, to: Town) => {
    const a = ends(from, centroid(to.outline));
    const b = ends(to, centroid(from.outline));
    const rank = Math.max(0, Math.min(Math.max(...a.map((e) => e.rank)), Math.max(...b.map((e) => e.rank))));
    const pick = (list: typeof a) => (list.some((e) => e.rank === rank) ? list.filter((e) => e.rank === rank) : list);
    let best: [Pt, Pt] = [(a[0] as (typeof a)[number]).p, (b[0] as (typeof b)[number]).p];
    let bestLength = Infinity;
    for (const x of pick(a))
      for (const y of pick(b)) {
        const length = distance2(x.p, y.p);
        if (length < bestLength) {
          bestLength = length;
          best = [x.p, y.p];
        }
      }
    highways.push({ pts: best, cls: RANK[rank] as RoadClass });
  };
  const main = towns[0];
  if (main) for (const town of towns.slice(1)) join(main, town);
  for (const o of oldTowns) {
    const successor = towns.find((t) => t.key === o.successor) ?? main;
    if (successor) join(successor, o.town);
  }
  const bend = warper(fnv1a(snapshot.repository) ^ 0x51ed27, [[240, 5600]]);
  // The bend fades to nothing at both ends, so a highway meets its roads exactly.
  const fade = (pts: Pt[]) =>
    pts.map((p, i) => {
      const n = pts.length - 1;
      const weight = floorDiv(4000 * i * (n - i), n * n);
      const q = bend(p);
      return { x: p.x + mulDiv(q.x - p.x, weight, 1000, "round"), y: p.y + mulDiv(q.y - p.y, weight, 1000, "round") };
    });
  const finalTowns = [...towns, ...oldTowns.map((o) => o.town)].map((t) => withApproach.get(t) ?? t);
  return {
    city: {
      repository: snapshot.repository,
      commit: snapshot.commit,
      towns: finalTowns,
      highways: options.warp ? highways.map((h) => ({ ...h, pts: fade(densify(h.pts, 80, false)) })) : highways,
    },
    state: { plat, last },
    events,
  };
}

