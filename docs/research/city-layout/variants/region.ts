// Composes a repository into one main town plus one town per workspace group (apps/, packages/, tools/ ...),
// each sized by its own land, joined to the main town by highways across open country.
import type { RepoData } from "./extract";
import { area, centroid, densify, fnv1a, warper, type Pt } from "./geometry";
import { buildNodes, layoutTown, outlineFor, type Options, type Road, type RoadClass, type Town } from "./town";

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

export function composeRegion(data: RepoData, options: Options): Region {
  const groups = workspaceGroups(data);
  const main = buildNodes(data, "", groups, options.density, options.noLand);
  const parts = [
    { name: data.name, key: data.name, nodes: main, firstSeen: 0 },
    ...groups
      .map((g) => ({
        name: g,
        key: `${data.name}/${g}`,
        nodes: buildNodes(data, g, [], options.density, options.noLand),
        firstSeen: data.folderFirstSeen[g] ?? 0,
      }))
      .sort((a, b) => a.firstSeen - b.firstSeen || (a.name < b.name ? -1 : 1)),
  ].filter((p) => p.nodes.root.gross > 0);

  // The main town sits at the origin; group towns ring it in first-seen order, pushed out until they clear.
  const placed: { centre: Pt; radius: number }[] = [];
  const towns: Town[] = [];
  const highways: Road[] = [];
  const radiusOf = (gross: number) => Math.sqrt(gross / Math.PI) * 1.08;
  parts.forEach((part, i) => {
    const radius = radiusOf(part.nodes.root.gross);
    let centre: Pt = { x: 0, y: 0 };
    if (i > 0) {
      const angle = -Math.PI / 2 + ((i - 1) * 2 * Math.PI) / (parts.length - 1) + (fnv1a(part.key) % 100) / 400;
      let distance = placed[0].radius + radius + GAP;
      const clear = (c: Pt) =>
        placed.every((p) => Math.hypot(p.centre.x - c.x, p.centre.y - c.y) >= p.radius + radius + GAP * 0.6);
      centre = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      while (!clear(centre)) {
        distance += GAP / 2;
        centre = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      }
    }
    placed.push({ centre, radius });
    const outline = outlineFor(part.nodes.root.gross, centre, part.key);
    const town = layoutTown(part.name, part.nodes.root, options, outline, part.key);
    town.stats.tests = part.nodes.tests;
    town.stats.docs = part.nodes.docs;
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
  const gate = (ends: { p: Pt; rank: number }[], rank: number, toward: Pt): Pt => {
    const pool = ends.filter((e) => e.rank === rank);
    const near = (e: { p: Pt }) => Math.hypot(e.p.x - toward.x, e.p.y - toward.y);
    return (pool.length ? pool : ends).sort((a, b) => near(a) - near(b))[0].p;
  };
  for (const town of towns.slice(1)) {
    const a = edgeEnds(towns[0], centroid(town.outline));
    const b = edgeEnds(town, centroid(towns[0].outline));
    const shared = Math.min(Math.max(...a.map((e) => e.rank)), Math.max(...b.map((e) => e.rank)));
    const rank = Math.max(0, shared);
    highways.push({
      pts: [gate(a, rank, centroid(town.outline)), gate(b, rank, centroid(towns[0].outline))],
      cls: RANK[rank],
    });
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
    towns,
    highways: options.warp ? highways.map((h) => ({ ...h, pts: densify(h.pts, 10, false).map(warp) })) : highways,
    tests: main.tests + parts.slice(1).reduce((s, p) => s + p.nodes.tests, 0),
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
