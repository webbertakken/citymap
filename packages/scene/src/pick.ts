import {
  UNIT,
  roadWidth,
  type BlockKind,
  type City,
  type LandUse,
  type Pt,
  type RoadClass,
} from "@citymap/ground-plan";

/** What lies under a point of the map: the topmost thing there, with its town's name and key. */
export type Hit =
  | {
      readonly kind: "lot";
      readonly town: string;
      readonly townKey: string;
      readonly district: string | null;
      readonly path: string;
      readonly use: LandUse;
      readonly address: string;
      readonly vacant: boolean;
    }
  | {
      readonly kind: "block";
      readonly town: string;
      readonly townKey: string;
      readonly district: string | null;
      readonly block: BlockKind;
    }
  | { readonly kind: "road"; readonly town: string | null; readonly townKey: string | null; readonly cls: RoadClass }
  | { readonly kind: "district"; readonly town: string; readonly townKey: string; readonly district: string }
  | { readonly kind: "town"; readonly town: string; readonly townKey: string };

interface Entry {
  readonly layer: 0 | 1 | 2 | 3 | 4;
  readonly pts: readonly Pt[];
  readonly box: readonly [number, number, number, number];
  readonly hit: (p: Pt, district: string | null) => Hit | null;
  readonly area: number;
  readonly town: string | null;
  readonly name: string;
}

/** A grid over the city, listing per cell what may lie there. */
export interface PickIndex {
  readonly cells: ReadonlyMap<string, readonly Entry[]>;
}

/** Cells of 8 street widths, in fixed units. */
const CELL = 8 * UNIT;

const boxOf = (pts: readonly Pt[], pad = 0): [number, number, number, number] => [
  Math.min(...pts.map((p) => p.x)) - pad,
  Math.min(...pts.map((p) => p.y)) - pad,
  Math.max(...pts.map((p) => p.x)) + pad,
  Math.max(...pts.map((p) => p.y)) + pad,
];

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

const area = (pts: readonly Pt[]) => {
  const [x0, y0, x1, y1] = boxOf(pts);
  return (x1 - x0) * (y1 - y0);
};

/** Builds the picking grid for a city: lots, blocks, roads, districts and towns by their bounding boxes. */
export function pickIndex(city: City): PickIndex {
  const entries: Entry[] = [];
  const polygon = (layer: Entry["layer"], pts: readonly Pt[], town: string, name: string, hit: Entry["hit"]) =>
    entries.push({
      layer,
      pts,
      box: boxOf(pts),
      hit: (p, d) => (inside(p, pts) ? hit(p, d) : null),
      area: area(pts),
      town,
      name,
    });
  const road = (pts: readonly Pt[], cls: RoadClass, width: number, town: string | null, townKey: string | null) => {
    const half = width / 2;
    entries.push({
      layer: 2,
      pts,
      box: boxOf(pts, half),
      hit: (p) =>
        pts.some((a, i) => i > 0 && distance(p, pts[i - 1]!, a) <= half) ? { kind: "road", town, townKey, cls } : null,
      area: 0,
      town,
      name: cls,
    });
  };
  for (const t of city.towns) {
    for (const lot of t.lots)
      polygon(0, lot.pts, t.name, lot.path, (_, district) => ({
        kind: "lot",
        town: t.name,
        townKey: t.key,
        district,
        path: lot.path,
        use: lot.use,
        address: lot.address,
        vacant: lot.vacant,
      }));
    for (const b of t.blocks)
      polygon(1, b.pts, t.name, b.kind, (_, district) => ({
        kind: "block",
        town: t.name,
        townKey: t.key,
        district,
        block: b.kind,
      }));
    for (const r of t.roads) road(r.pts, r.cls, roadWidth(r), t.name, t.key);
    for (const d of t.districts.filter((x) => !x.ward))
      polygon(3, d.pts, t.name, d.name, () => ({ kind: "district", town: t.name, townKey: t.key, district: d.name }));
    polygon(4, t.outline, t.name, t.name, () => ({ kind: "town", town: t.name, townKey: t.key }));
  }
  for (const h of city.highways) road(h.pts, h.cls, roadWidth(h), null, null);
  const cells = new Map<string, Entry[]>();
  for (const e of entries)
    for (let cx = Math.floor(e.box[0] / CELL); cx <= Math.floor(e.box[2] / CELL); cx++)
      for (let cy = Math.floor(e.box[1] / CELL); cy <= Math.floor(e.box[3] / CELL); cy++) {
        const key = `${cx},${cy}`;
        cells.set(key, [...(cells.get(key) ?? []), e]);
      }
  return { cells };
}

/** The topmost thing at a map point (scene units): a lot, else a block, a road, a district, a town; or null. */
export function pick(index: PickIndex, x: number, z: number): Hit | null {
  const p = { x: x * UNIT, y: -z * UNIT };
  const here = (index.cells.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`) ?? []).filter(
    (e) => p.x >= e.box[0] && p.x <= e.box[2] && p.y >= e.box[1] && p.y <= e.box[3],
  );
  // The smallest district holding the point names it for lots and blocks.
  const district =
    here.filter((e) => e.layer === 3 && inside(p, e.pts)).toSorted((a, b) => a.area - b.area)[0]?.name ?? null;
  for (const layer of [0, 1, 2, 3, 4] as const) {
    const candidates = here.filter((e) => e.layer === layer);
    const ordered = layer === 3 ? candidates.toSorted((a, b) => a.area - b.area) : candidates;
    for (const e of ordered) {
      const hit = e.hit(p, district);
      if (hit) return hit;
    }
  }
  return null;
}
