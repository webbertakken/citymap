// Composes a repository into one main town plus one town per workspace group (apps/, packages/, tools/ ...),
// each sized by its own land, joined to the main town by highways across open country.
import { isFlat, type Form } from "./archetype";
import type { RepoData } from "./extract";
import { area, centroid, densify, fnv1a, warper, type Pt } from "./geometry";
import {
  buildNodes,
  classifyNode,
  emptyTownPlat,
  GROWTH_ROOM,
  layoutTown,
  outlineFor,
  type Options,
  type Road,
  type RoadClass,
  type Town,
  type TownPlat,
} from "./town";

/** The plat of a region: one town plat per town key. Pass the same plat to every commit to fold history. */
export interface RegionPlat {
  towns: Record<string, TownPlat>;
  /** Old towns per town key: frozen geometry and the member identities of each lot. */
  old: Record<string, { town: Town; members: Record<string, string[]> }[]>;
  /** Each town as last laid out, to freeze when its root switches form. */
  last: Record<string, Town>;
  /** Each town's root form over the whole repository, with hysteresis. */
  rootForms: Record<string, Form>;
}
export const emptyRegionPlat = (): RegionPlat => ({ towns: {}, old: {}, last: {}, rootForms: {} });

export interface Region {
  name: string;
  towns: Town[];
  highways: Road[];
  tests: number;
  docs: number;
}

const GAP = 90;

/** Folders holding two or more workspace members whose land is mostly source code. */
export function workspaceGroups(data: RepoData): string[] {
  const members = data.members.filter((m) => !data.members.some((o) => o !== m && m.startsWith(`${o}/`)));
  const byParent = new Map<string, string[]>();
  for (const m of members) {
    const parent = m.includes("/") ? m.slice(0, m.lastIndexOf("/")) : "";
    if (parent === "") continue;
    byParent.set(parent, [...(byParent.get(parent) ?? []), m]);
  }
  const groups = [...byParent].filter(([parent, list]) => {
    if (list.length < 2) return false;
    const land = data.files.filter(
      (f) => f.path.startsWith(`${parent}/`) && !["tests", "fixtures", "docs"].includes(f.landUse),
    );
    const source = land.filter((f) => f.landUse === "source").length;
    return land.length > 0 && source / land.length >= 0.5;
  });
  const names = groups.map(([g]) => g).sort();
  return names.filter((g) => !names.some((o) => o !== g && g.startsWith(`${o}/`)));
}

export function composeRegion(data: RepoData, options: Options, plat: RegionPlat = emptyRegionPlat()): Region {
  const groups = workspaceGroups(data);
  const platOf = (key: string) => (plat.towns[key] ??= emptyTownPlat());
  const identity = (f: { identity?: string; path: string }) => f.identity ?? f.path;
  const live = new Set(data.files.map(identity));
  // Files kept by an old town live there for good; the town that replaced it lays out the rest.
  const oldIds = (key: string) => new Set((plat.old[key] ?? []).flatMap((o) => Object.values(o.members).flat()));
  const nodesFor = (key: string, root: string, exclude: string[]) => {
    const kept = oldIds(key);
    const files = kept.size ? data.files.filter((f) => !kept.has(identity(f))) : data.files;
    return buildNodes({ ...data, files }, root, exclude, options.density, options.noLand, platOf(key).shares);
  };
  const parts = [
    { name: data.name, key: data.name, root: "", exclude: groups, firstSeen: 0 },
    ...groups
      .map((g) => ({
        name: g,
        key: `${data.name}/${g}`,
        root: g,
        exclude: [],
        firstSeen: data.folderFirstSeen[g] ?? 0,
      }))
      .sort((a, b) => a.firstSeen - b.firstSeen || (a.name < b.name ? -1 : 1)),
  ]
    .map((p) => {
      let nodes = nodesFor(p.key, p.root, p.exclude);
      // Archetype switch at a town's root: the town as it stood is kept whole as an old town, and a new town grows
      // beside it from every file the old town does not hold.
      // The root's form describes the whole repository, old towns included, so a young new town keeps it.
      const whole = buildNodes(data, p.root, p.exclude, options.density, options.noLand, {});
      const previous = plat.rootForms[p.key];
      const rootForm = classifyNode(whole.root, previous);
      plat.rootForms[p.key] = rootForm;
      const townPlat = platOf(p.key);
      const last = plat.last[p.key];
      // Moving between the neighbourhood forms re-lays in place; any other change of form is an archetype switch.
      const switched = previous !== undefined && rootForm !== previous && !(isFlat(previous) && isFlat(rootForm));
      if (switched && last) {
        const members: Record<string, string[]> = {};
        for (const lots of Object.values(townPlat.shares)) for (const lot of lots) members[lot.key] = [...lot.members];
        for (const lot of last.lots) if (!lot.vacant) members[lot.key] ??= [lot.key];
        const count = (plat.old[p.key] ?? []).length + 1;
        const name = `${p.name} old town${count > 1 ? ` ${count}` : ""}`;
        console.log(`[plat] old town ${name}: ${previous} -> ${rootForm}, ${last.lots.length} lots`);
        (plat.old[p.key] ??= []).push({ town: { ...last, name, old: true }, members });
        plat.towns[p.key] = emptyTownPlat();
        nodes = nodesFor(p.key, p.root, p.exclude);
      }
      return { ...p, nodes, rootForm };
    })
    .filter((p) => p.nodes.root.gross > 0);

  // Old towns stay exactly where they stood; their lots light while any of their files lives.
  const oldTowns: { town: Town; successor: string }[] = Object.entries(plat.old).flatMap(([key, list]) =>
    list.map((o) => ({
      successor: key,
      town: {
        ...o.town,
        lots: o.town.lots.map((l) => ({ ...l, vacant: !(o.members[l.key] ?? []).some((m) => live.has(m)) })),
      },
    })),
  );
  const footprint = (t: Town) => {
    const c = centroid(t.outline);
    return { centre: c, radius: Math.max(...t.outline.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) };
  };
  const blockers = oldTowns.map((o) => footprint(o.town));

  // The main town sits at the origin; group towns ring it in first-seen order, pushed out until they clear.
  const placed: { centre: Pt; radius: number }[] = [];
  const towns: Town[] = [];
  const highways: Road[] = [];
  const radiusOf = (gross: number) => Math.sqrt(gross / Math.PI) * 1.08;
  parts.forEach((part, i) => {
    // A town keeps its outline until its land outgrows the band, then grows outward about the same centre.
    const townPlat = platOf(part.key);
    const gross = part.nodes.root.gross;
    if (townPlat.area === 0 || gross > townPlat.cap) {
      if (townPlat.area > 0)
        console.log(`[plat] grow town ${part.name} ${Math.round(townPlat.area)} -> ${Math.round(gross)}`);
      townPlat.area = Math.max(townPlat.area, gross);
      townPlat.cap = gross * GROWTH_ROOM;
    }
    const radius = radiusOf(townPlat.area);
    const clear = (c: Pt) =>
      [...placed, ...blockers].every(
        (p) => Math.hypot(p.centre.x - c.x, p.centre.y - c.y) >= p.radius + radius + GAP * 0.6,
      );
    const outward = (from: Pt, angle: number) => {
      let distance = Math.hypot(from.x, from.y);
      let c = from;
      while (!clear(c)) {
        distance += GAP / 2;
        c = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      }
      return c;
    };
    let centre: Pt;
    if (townPlat.centre) {
      // A remembered town stays put unless a neighbour grew into it; then it moves straight outward.
      const c = townPlat.centre;
      centre = outward(c, Math.atan2(c.y, c.x) || (fnv1a(part.key) % 628) / 100);
    } else if (i === 0) {
      // A new main town sits at the origin, or beside the old towns that hold it.
      centre = outward({ x: 0, y: 0 }, (fnv1a(`${part.key}#new`) % 628) / 100);
    } else {
      const angle = -Math.PI / 2 + ((i - 1) * 2 * Math.PI) / (parts.length - 1) + (fnv1a(part.key) % 100) / 400;
      const distance = placed[0].radius + radius + GAP;
      centre = outward({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }, angle);
    }
    townPlat.centre = centre;
    placed.push({ centre, radius });
    const outline = outlineFor(townPlat.area, centre, part.key);
    const town = layoutTown(part.name, part.nodes.root, options, outline, part.key, townPlat, part.rootForm);
    town.stats.tests = part.nodes.tests;
    town.stats.docs = part.nodes.docs;
    plat.last[part.key] = town;
    towns.push(town);
  });
  // Highways join real roads of one class in both towns, at the town edge, and take that class: seamless roads.
  const RANK: RoadClass[] = ["lane", "street", "collector", "avenue", "boulevard"];
  const edgeEnds = (town: Town, toward: Pt) => {
    const c = centroid(town.outline);
    if (town.roads.length === 0) {
      // A town without streets gets an approach street from its edge to its centre, so a highway has a road to join.
      const door = [...town.outline].sort(
        (a, b) => Math.hypot(a.x - toward.x, a.y - toward.y) - Math.hypot(b.x - toward.x, b.y - toward.y),
      )[0];
      town.roads.push({ pts: [door, c], cls: "street" });
    }
    const reach = Math.max(...town.outline.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    const ends = town.roads.flatMap((r) => [
      { p: r.pts[0], rank: RANK.indexOf(r.cls) },
      { p: r.pts[r.pts.length - 1], rank: RANK.indexOf(r.cls) },
    ]);
    const edge = ends.filter((e) => Math.hypot(e.p.x - c.x, e.p.y - c.y) >= 0.8 * reach);
    return edge.length ? edge : ends;
  };
  // The highway joins the closest pair of edge road ends of the shared class, so its gates face each other.
  const gates = (a: { p: Pt; rank: number }[], b: { p: Pt; rank: number }[], rank: number): [Pt, Pt] => {
    const pick = (ends: { p: Pt; rank: number }[]) =>
      ends.some((e) => e.rank === rank) ? ends.filter((e) => e.rank === rank) : ends;
    let best: [Pt, Pt] = [a[0].p, b[0].p];
    let bestLength = Infinity;
    for (const x of pick(a))
      for (const y of pick(b)) {
        const length = Math.hypot(x.p.x - y.p.x, x.p.y - y.p.y);
        if (length < bestLength) {
          bestLength = length;
          best = [x.p, y.p];
        }
      }
    return best;
  };
  const join = (from: Town, to: Town) => {
    const a = edgeEnds(from, centroid(to.outline));
    const b = edgeEnds(to, centroid(from.outline));
    const rank = Math.max(0, Math.min(Math.max(...a.map((e) => e.rank)), Math.max(...b.map((e) => e.rank))));
    highways.push({ pts: gates(a, b, rank), cls: RANK[rank] });
  };
  for (const town of towns.slice(1)) join(towns[0], town);
  // Each old town is joined to the town that replaced it.
  for (const o of oldTowns) {
    const successor = towns[parts.findIndex((p) => p.key === o.successor)] ?? towns[0];
    if (successor) join(successor, o.town);
  }
  const bend = warper(fnv1a(data.name) ^ 0x51ed27, [[30, 700]]);
  // The bend fades to nothing at both ends, so a highway meets its roads exactly.
  const warp = (p: Pt, i: number, all: Pt[]): Pt => {
    const s = Math.sin((Math.PI * i) / Math.max(1, all.length - 1));
    const q = bend(p);
    return { x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s };
  };
  return {
    name: data.name,
    towns: [...towns, ...oldTowns.map((o) => o.town)],
    highways: options.warp ? highways.map((h) => ({ ...h, pts: densify(h.pts, 10, false).map(warp) })) : highways,
    tests: parts.reduce((s, p) => s + p.nodes.tests, 0),
    docs: towns.reduce((s, t) => s + t.stats.docs, 0),
  };
}

export function regionStats(region: Region) {
  const lotArea = region.towns.reduce((s, t) => s + t.stats.lotArea, 0);
  const landArea = region.towns.reduce((s, t) => s + area(t.outline), 0);
  const roadLength: Record<string, number> = {};
  let longStraight = 0;
  for (const town of region.towns) {
    const diameter = 2 * Math.sqrt(area(town.outline) / Math.PI);
    for (const road of town.roads) {
      const length = road.pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - road.pts[i].x, p.y - road.pts[i].y), 0);
      roadLength[road.cls] = (roadLength[road.cls] ?? 0) + length;
      const a = road.pts[0];
      const b = road.pts[road.pts.length - 1];
      if (length > 0.45 * diameter && Math.hypot(b.x - a.x, b.y - a.y) / length > 0.995) longStraight++;
    }
  }
  const total = Object.values(roadLength).reduce((s, v) => s + v, 0);
  return {
    lotCoverage: Math.round((1000 * lotArea) / landArea) / 10,
    roadShare: Object.fromEntries(Object.entries(roadLength).map(([k, v]) => [k, Math.round((1000 * v) / total) / 10])),
    longStraightRoads: longStraight,
    overflow: region.towns.reduce((s, t) => s + t.stats.overflow, 0),
    lots: region.towns.reduce((s, t) => s + t.stats.lots, 0),
  };
}
