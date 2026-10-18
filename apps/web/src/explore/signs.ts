// Building names, as signs on the walls that face the street: which buildings are near enough to sign, which wall of
// each faces its street, and the words on it. Pure; metres, x east, z south.
import { UNIT, type City } from "@citymap/ground-plan";
import type { Footprint } from "@citymap/world";
import { METRE } from "./street";

/** A straight piece of road, in metres. */
export interface Segment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
}

/** At most this many buildings carry a sign at once: the nearest. */
export const SIGN_POOL = 24;
/** A building this far from the walker, in metres, carries none. */
export const SIGN_REACH = 80;
/** Road segments are found through a grid of cells this many metres square. */
export const ROAD_CELL = 32;

/** A plan coordinate (fixed units) in metres. */
const metres = (v: number) => v / UNIT / METRE;

/** Every road and highway of a city, as straight pieces in metres. */
export function roadSegments(city: City): Segment[] {
  const roads = [...city.highways, ...city.towns.flatMap((t) => t.roads)];
  return roads.flatMap((road) =>
    road.pts.slice(1).map((b, i) => {
      const a = road.pts[i]!;
      return { ax: metres(a.x), az: -metres(a.y), bx: metres(b.x), bz: -metres(b.y) };
    }),
  );
}

const cellKey = (cx: number, cz: number) => `${cx},${cz}`;

/** The roads in a grid, to find the nearest point on any of them. */
export interface RoadGrid {
  readonly nearest: (x: number, z: number, reach?: number) => { readonly x: number; readonly z: number } | null;
}

/** The roads in a grid: each cell lists the pieces whose box touches it. */
export function roadGrid(segments: readonly Segment[]): RoadGrid {
  const cells = new Map<string, Segment[]>();
  for (const s of segments)
    for (
      let cx = Math.floor(Math.min(s.ax, s.bx) / ROAD_CELL);
      cx <= Math.floor(Math.max(s.ax, s.bx) / ROAD_CELL);
      cx++
    )
      for (
        let cz = Math.floor(Math.min(s.az, s.bz) / ROAD_CELL);
        cz <= Math.floor(Math.max(s.az, s.bz) / ROAD_CELL);
        cz++
      )
        cells.set(cellKey(cx, cz), [...(cells.get(cellKey(cx, cz)) ?? []), s]);
  return {
    /** The nearest point on any road to (x, z), looking ever wider rings of cells out to `reach` metres; null if none. */
    nearest(x: number, z: number, reach = 200): { readonly x: number; readonly z: number } | null {
      const cx = Math.floor(x / ROAD_CELL);
      const cz = Math.floor(z / ROAD_CELL);
      const best = { x: 0, z: 0, d: Infinity };
      for (let ring = 0; ring * ROAD_CELL <= reach; ring++) {
        for (let i = -ring; i <= ring; i++)
          for (let j = -ring; j <= ring; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
            for (const s of cells.get(cellKey(cx + i, cz + j)) ?? []) {
              const dx = s.bx - s.ax;
              const dz = s.bz - s.az;
              const length2 = dx * dx + dz * dz;
              const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / length2));
              const px = s.ax + dx * t;
              const pz = s.az + dz * t;
              const d = Math.hypot(x - px, z - pz);
              if (d < best.d) Object.assign(best, { x: px, z: pz, d });
            }
          }
        // Anything in a further ring is at least `ring` cells away: once the best is nearer, it is the nearest.
        if (best.d <= ring * ROAD_CELL) break;
      }
      return best.d === Infinity ? null : { x: best.x, z: best.z };
    },
  };
}

/** A building's middle: the mean of its corners (its lot is convex). */
export const middleOf = (footprint: Footprint) => {
  const n = footprint.corners.length;
  return {
    x: footprint.corners.reduce((sum, c) => sum + c.x, 0) / n,
    z: footprint.corners.reduce((sum, c) => sum + c.z, 0) / n,
  };
};

/** The wall a sign goes on: its middle, which way it faces (a unit vector out of the building), and its length. */
export interface Wall {
  readonly edge: number;
  readonly x: number;
  readonly z: number;
  readonly nx: number;
  readonly nz: number;
  readonly length: number;
}

/** The wall of a footprint that faces a point (its street) most squarely: the one whose outward face points at it. */
export function wallFacing(footprint: Footprint, towards: { readonly x: number; readonly z: number }): Wall {
  const centre = middleOf(footprint);
  let best: (Wall & { score: number }) | null = null;
  footprint.corners.forEach((a, edge) => {
    const b = footprint.corners[(edge + 1) % footprint.corners.length]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length === 0) return;
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    // The edge's normal, turned to point away from the building's middle.
    // Written as differences, so a zero stays +0 rather than −0.
    let nx = (b.z - a.z) / length;
    let nz = (a.x - b.x) / length;
    if (nx * (x - centre.x) + nz * (z - centre.z) < 0) {
      nx = 0 - nx;
      nz = 0 - nz;
    }
    const to = Math.hypot(towards.x - x, towards.z - z) || 1;
    const score = (nx * (towards.x - x) + nz * (towards.z - z)) / to;
    if (!best || score > best.score) best = { edge, x, z, nx, nz, length, score };
  });
  const { score: _score, ...wall } = best!;
  return wall;
}

/** The buildings to sign: the nearest `pool` whose middle is within `reach` of the walker, nearest first. */
export function nearestLots(
  footprints: readonly Footprint[],
  feet: { readonly x: number; readonly z: number },
  pool = SIGN_POOL,
  reach = SIGN_REACH,
): number[] {
  const near: { lot: number; d: number }[] = [];
  for (const footprint of footprints) {
    if (footprint.corners.length < 3) continue;
    const m = middleOf(footprint);
    const d = Math.hypot(m.x - feet.x, m.z - feet.z);
    if (d <= reach) near.push({ lot: footprint.lot, d });
  }
  return near
    .toSorted((a, b) => a.d - b.d)
    .slice(0, pool)
    .map((n) => n.lot);
}

/** A building's name on its sign: its file's name, and how many more files share it. */
export function signName(files: readonly string[]): string {
  const first = files[0];
  if (first === undefined) return "";
  const name = first.slice(first.lastIndexOf("/") + 1);
  return files.length > 1 ? `${name} +${files.length - 1}` : name;
}
