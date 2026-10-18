import { UNIT, area2, roadWidth, centroid, type City, type Pt } from "@citymap/ground-plan";
import type { Theme } from "@citymap/themes";
import { BuildingsBuilder, type Buildings } from "./buildings";
import { triangulate } from "./triangulate";

export { triangulate } from "./triangulate";

/** One drawable layer: vertex positions and colours (three floats each) and triangle indices. */
export interface Layer {
  readonly name: string;
  readonly positions: Float32Array;
  readonly colours: Float32Array;
  readonly indices: Uint32Array;
}

export interface Label {
  readonly text: string;
  readonly x: number;
  readonly z: number;
  readonly size: "town" | "district" | "minor";
  /** The land it names, in scene units: the smaller side of its town's or district's bounding box. */
  readonly extent: number;
}

/** The smaller side of a polygon's bounding box, in scene units. */
const extentOf = (pts: readonly Pt[]) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / UNIT;
};

export interface Scene {
  readonly layers: readonly Layer[];
  /** Every lot that holds files, as a building: plinths in plan view, standing in the Buildings view. */
  readonly buildings: Buildings;
  readonly labels: readonly Label[];
  readonly bounds: { readonly min: { x: number; z: number }; readonly max: { x: number; z: number } };
}

/** The height of a lot's plinth in plan view, in street widths. */
export const LOT_HEIGHT = 0.12;
const HEIGHT = { ground: 0, blocks: 0.01, water: 0.015, casings: 0.02, roads: 0.025, lots: 0.03 } as const;
/** Where buildings stand: the lots' height, above the roads. */
export const LOTS_BASE = HEIGHT.lots;
/** A road's casing is this much wider than its fill, in fixed units. */
const CASING = 16;

const rgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];

/** Growing arrays for one layer. */
class Builder {
  private readonly positions: number[] = [];
  private readonly colours: number[] = [];
  private readonly indices: number[] = [];

  constructor(private readonly name: string) {}

  /** A flat convex polygon at a height. */
  flat(pts: readonly Pt[], colour: string, height: number) {
    if (pts.length < 3) return;
    const base = this.positions.length / 3;
    const [r, g, b] = rgb(colour);
    for (const p of pts) {
      this.positions.push(p.x / UNIT, height, 0 - p.y / UNIT);
      this.colours.push(r, g, b);
    }
    this.indices.push(...triangulate(pts.length, base));
  }

  done(): Layer {
    return {
      name: this.name,
      positions: Float32Array.from(this.positions),
      colours: Float32Array.from(this.colours),
      indices: Uint32Array.from(this.indices),
    };
  }
}

/** Polygons laid flat at a height, each in its own colour. */
export function flatLayer(
  name: string,
  polygons: readonly (readonly Pt[])[],
  colours: readonly string[],
  height: number,
): Layer {
  const builder = new Builder(name);
  polygons.forEach((pts, i) => builder.flat(pts, colours[i]!, height));
  return builder.done();
}

/**
 * A polyline as quads of the given width (fixed units), one per segment, mitred at each joint: the offset at a joint
 * runs along the bisector of the two normals, long enough to keep each edge's width, and no longer than twice the
 * half width, so hairpins stay bounded.
 */
export function roadRibbon(pts: readonly Pt[], width: number): Pt[][] {
  const half = width / 2;
  const line = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y);
  if (line.length < 2) return [];
  // Each segment's unit normal, to its left.
  const normals = line.slice(1).map((b, i) => {
    const a = line[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  });
  const offsets = line.map((_, i) => {
    const before = normals[i - 1];
    const after = normals[i];
    if (!before || !after) {
      const n = (before ?? after)!;
      return { x: n.x * half, y: n.y * half };
    }
    const sum = { x: before.x + after.x, y: before.y + after.y };
    const size = Math.hypot(sum.x, sum.y);
    // A full reversal has no bisector: turn round the end at the limit, along the first segment.
    const m = size < 1e-9 ? { x: before.y, y: -before.x } : { x: sum.x / size, y: sum.y / size };
    const reach = Math.min(2 * half, half / Math.max(1e-9, m.x * before.x + m.y * before.y));
    return { x: m.x * reach, y: m.y * reach };
  });
  return normals.map((_, i) => {
    const a = line[i]!;
    const b = line[i + 1]!;
    const oa = offsets[i]!;
    const ob = offsets[i + 1]!;
    return [
      { x: a.x - oa.x, y: a.y - oa.y },
      { x: b.x - ob.x, y: b.y - ob.y },
      { x: b.x + ob.x, y: b.y + ob.y },
      { x: a.x + oa.x, y: a.y + oa.y },
    ];
  });
}

/** The city as drawable layers, labels and bounds, in a theme. Pure; no WebGL. */
export function buildScene(city: City, theme: Theme): Scene {
  const ground = new Builder("ground");
  const blocks = new Builder("blocks");
  const water = new Builder("water");
  const casings = new Builder("casings");
  const roads = new Builder("roads");
  const lots = new Builder("lots");
  const buildings = new BuildingsBuilder();
  const labels: Label[] = [];
  const roadsOf = [...city.highways, ...city.towns.flatMap((t) => t.roads)];
  for (const town of city.towns) {
    ground.flat(town.outline, theme.ground, HEIGHT.ground);
    for (const b of town.blocks) {
      const colour =
        b.kind === "park" || b.kind === "green"
          ? theme.park
          : b.kind === "plaza"
            ? theme.plaza
            : b.kind === "reserve"
              ? theme.reserve(b.district)[0]
              : theme.block(b.district);
      blocks.flat(b.pts, colour, HEIGHT.blocks);
    }
    for (const w of town.water) water.flat(w, theme.water, HEIGHT.water);
    for (const w of town.canals ?? []) water.flat(w, theme.canal, HEIGHT.water);
    for (const lot of town.lots)
      if (lot.vacant) lots.flat(lot.pts, theme.reserve(lot.district)[0], HEIGHT.lots);
      else buildings.add(lot.pts, { town: town.key, key: lot.key, district: lot.district, use: lot.use });
    const heart = centroid(town.outline);
    labels.push({
      text: shortTownName(town.name).toUpperCase(),
      x: heart.x / UNIT,
      z: 0 - heart.y / UNIT,
      size: "town",
      extent: extentOf(town.outline),
    });
  }
  for (const r of roadsOf) {
    for (const quad of roadRibbon(r.pts, roadWidth(r) + CASING)) casings.flat(quad, theme.casing, HEIGHT.casings);
    for (const quad of roadRibbon(r.pts, roadWidth(r))) roads.flat(quad, theme.road, HEIGHT.roads);
  }
  // Districts as the SVG renderer labels them: the heaviest sixty, large enough to read, upper case when major.
  const districts = city.towns.flatMap((t) => t.districts).toSorted((a, b) => b.massMille - a.massMille);
  const heaviest = Math.max(1, ...districts.map((d) => d.massMille));
  const largest = Math.max(1, ...city.towns.map((t) => area2(t.outline)));
  for (const d of districts.slice(0, 60)) {
    if (area2(d.pts) * 1000 < largest * 8) continue;
    const major = d.depth === 1 || d.massMille * 100 >= 8 * heaviest;
    const at = centroid(d.pts);
    labels.push({
      text: major ? d.name.toUpperCase() : d.name,
      x: at.x / UNIT,
      z: 0 - at.y / UNIT,
      size: major ? "district" : "minor",
      extent: extentOf(d.pts),
    });
  }
  const outline = city.towns.flatMap((t) => t.outline);
  const xs = outline.map((p) => p.x / UNIT);
  const zs = outline.map((p) => 0 - p.y / UNIT);
  const bounds =
    outline.length > 0
      ? { min: { x: Math.min(...xs), z: Math.min(...zs) }, max: { x: Math.max(...xs), z: Math.max(...zs) } }
      : { min: { x: 0, z: 0 }, max: { x: 0, z: 0 } };
  return {
    layers: [ground, blocks, water, casings, roads, lots].map((b) => b.done()),
    buildings: buildings.done(),
    labels,
    bounds,
  };
}

/**
 * A town's name on the map: the text after its last slash. A workspace group's or separate town's name is its folder's
 * path (`packages/react-reconciler`, `apps/web old town`); the map names it by its last folder, the rest elsewhere.
 */
export const shortTownName = (name: string) => name.slice(name.lastIndexOf("/") + 1);
