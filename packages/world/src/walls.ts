// The city's walls without a physics engine: every building a convex prism on flat ground, found through a uniform grid.
// A person is a circle on the ground with a height: a move is cut into steps no longer than half its radius, so it never
// passes through a wall; after each step it is pushed out of every prism it cannot step onto, the shortest way, so it
// slides along walls. Low tops are stepped onto and roofs stood on; rays clip prisms in plan and in height. Metres.
import { GROUND, PERSON_RADIUS, SNAP_DOWN, STEP_UP, solid, type Footprint, type Vec3, type Walls } from "./world";

/** A building ready for queries: its corners anticlockwise from above, each edge's outward normal, its box and roof. */
interface Prism {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  /** Outward normals, one per edge from corner i to corner i + 1. */
  readonly nx: Float64Array;
  readonly nz: Float64Array;
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly top: number;
}

/** The grid's cells are this many metres square: about a building, so a person meets a handful per step. */
export const CELL = 16;
/** Pushes out of walls are repeated at most this often per step; a corner between two prisms needs two. */
export const PUSHES = 4;
/** A move is cut into at most this many steps; longer moves (a frame of seconds) are clamped by the session anyway. */
export const MAX_STEPS = 256;

/** The prism of a footprint: its corners turned anticlockwise when seen from above (y up, z south). */
function prismOf(footprint: Footprint): Prism {
  const n = footprint.corners.length;
  let turn = 0;
  footprint.corners.forEach((a, i) => {
    const b = footprint.corners[(i + 1) % n]!;
    turn += a.x * b.z - b.x * a.z;
  });
  // Seen from above with z south, a negative sum runs anticlockwise.
  const corners = turn < 0 ? footprint.corners : footprint.corners.toReversed();
  const xs = Float64Array.from(corners, (c) => c.x);
  const zs = Float64Array.from(corners, (c) => c.z);
  const nx = new Float64Array(n);
  const nz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const dx = xs[(i + 1) % n]! - xs[i]!;
    const dz = zs[(i + 1) % n]! - zs[i]!;
    const length = Math.hypot(dx, dz);
    // Anticlockwise from above, the outside lies to the left of each edge: (dz, −dx) turned to face it.
    nx[i] = -dz / length;
    nz[i] = dx / length;
  }
  return {
    xs,
    zs,
    nx,
    nz,
    minX: Math.min(...xs),
    minZ: Math.min(...zs),
    maxX: Math.max(...xs),
    maxZ: Math.max(...zs),
    top: footprint.top,
  };
}

/**
 * How far to push a circle out of a prism's plan, or null when they do not meet. From inside, out through the nearest
 * edge; from outside, away from the nearest point of the outline.
 */
function pushOut(p: Prism, x: number, z: number, r: number): { x: number; z: number } | null {
  const n = p.xs.length;
  let inside = true;
  let shallowest = Infinity;
  let exit = 0;
  for (let i = 0; i < n; i++) {
    const out = p.nx[i]! * (x - p.xs[i]!) + p.nz[i]! * (z - p.zs[i]!);
    if (out > 0) inside = false;
    if (-out < shallowest) {
      shallowest = -out;
      exit = i;
    }
  }
  if (inside) return { x: p.nx[exit]! * (shallowest + r), z: p.nz[exit]! * (shallowest + r) };
  let nearest = Infinity;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const ax = p.xs[i]!;
    const az = p.zs[i]!;
    const dx = p.xs[(i + 1) % n]! - ax;
    const dz = p.zs[(i + 1) % n]! - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < nearest) {
      nearest = d;
      cx = px;
      cz = pz;
    }
  }
  if (nearest >= r) return null;
  return { x: ((x - cx) / nearest) * (r - nearest), z: ((z - cz) / nearest) * (r - nearest) };
}

/** Where a segment from `a` to `b` first meets a prism, as a share of its length (0 to 1), or null if it never does. */
function hitPrism(p: Prism, a: Vec3, b: Vec3): number | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let enter = 0;
  let leave = 1;
  // In plan: the part of the segment inside every edge's half-plane.
  for (let i = 0; i < p.xs.length; i++) {
    const out = p.nx[i]! * (a.x - p.xs[i]!) + p.nz[i]! * (a.z - p.zs[i]!);
    const rate = p.nx[i]! * dx + p.nz[i]! * dz;
    if (rate === 0) {
      if (out > 0) return null;
      continue;
    }
    const t = -out / rate;
    if (rate < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return null;
  }
  // In height: the part between the ground and the roof.
  const dy = b.y - a.y;
  if (dy === 0) return a.y >= 0 && a.y <= p.top ? enter : null;
  const atRoof = (p.top - a.y) / dy;
  const atFoot = -a.y / dy;
  enter = Math.max(enter, Math.min(atRoof, atFoot));
  leave = Math.min(leave, Math.max(atRoof, atFoot));
  return enter <= leave ? enter : null;
}

/** The prisms in a uniform grid: each cell lists the prisms whose box touches it. */
class Grid {
  private readonly cells = new Map<number, number[]>();
  private readonly seen: Int32Array;
  private stamp = 0;

  constructor(readonly prisms: readonly Prism[]) {
    this.seen = new Int32Array(prisms.length);
    prisms.forEach((p, i) => {
      for (let cx = cellOf(p.minX); cx <= cellOf(p.maxX); cx++)
        for (let cz = cellOf(p.minZ); cz <= cellOf(p.maxZ); cz++) {
          const key = keyOf(cx, cz);
          const cell = this.cells.get(key);
          if (cell) cell.push(i);
          else this.cells.set(key, [i]);
        }
    });
  }

  /** Each prism whose cells meet a box, once. */
  near(minX: number, minZ: number, maxX: number, maxZ: number): Prism[] {
    this.stamp++;
    const found: Prism[] = [];
    for (let cx = cellOf(minX); cx <= cellOf(maxX); cx++)
      for (let cz = cellOf(minZ); cz <= cellOf(maxZ); cz++)
        for (const i of this.cells.get(keyOf(cx, cz)) ?? []) {
          if (this.seen[i] === this.stamp) continue;
          this.seen[i] = this.stamp;
          found.push(this.prisms[i]!);
        }
    return found;
  }
}

const cellOf = (metres: number) => Math.floor(metres / CELL);
/** A cell's key: cells within ±2²⁰ of the origin (16,000 km) never share one. */
const keyOf = (cx: number, cz: number) => (cx + 1_048_576) * 2_097_152 + (cz + 1_048_576);

export interface CityWallsOptions {
  /** How wide a person is, as a circle on the ground. */
  readonly radius?: number;
}

/** The walls of these buildings: footprints that enclose no ground or stand on none make no wall. */
export function cityWalls(footprints: readonly Footprint[], options: CityWallsOptions = {}): Walls {
  const r = options.radius ?? PERSON_RADIUS;
  const grid = new Grid(footprints.filter(solid).map(prismOf));
  const around = (x: number, z: number) => grid.near(x - r, z - r, x + r, z + r);

  /** The highest thing to stand on under a circle at a height: the ground, or a top no more than a step above it. */
  const floorAt = (x: number, z: number, y: number) =>
    around(x, z).reduce(
      (floor, p) => (p.top <= y + STEP_UP && p.top > floor && pushOut(p, x, z, r) ? p.top : floor),
      GROUND,
    );

  return {
    move: (feet, delta) => {
      const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / (r / 2))));
      let { x, y, z } = feet;
      // Each step lands a share of the way along the move, plus every push so far: a free move ends exactly there.
      let pushedX = 0;
      let pushedZ = 0;
      for (let s = 1; s <= steps; s++) {
        x = feet.x + (delta.x * s) / steps + pushedX;
        z = feet.z + (delta.z * s) / steps + pushedZ;
        for (let k = 0; k < PUSHES; k++) {
          let pushed = false;
          for (const p of around(x, z)) {
            // A top within a step is climbed, a roof below the feet is stood on; only the rest stop the person.
            if (p.top <= y + STEP_UP) continue;
            const push = pushOut(p, x, z, r);
            if (!push) continue;
            x += push.x;
            z += push.z;
            pushedX += push.x;
            pushedZ += push.z;
            pushed = true;
          }
          if (!pushed) break;
        }
        y = Math.max(y, floorAt(x, z, y));
      }
      const floor = floorAt(x, z, y);
      const wanted = y + delta.y;
      // Down onto the floor, or kept to it over a small drop; rising, the person leaves it.
      if (wanted <= floor || (delta.y <= 0 && wanted - floor <= SNAP_DOWN && feet.y - floor <= SNAP_DOWN))
        return { feet: { x, y: floor, z }, grounded: true };
      return { feet: { x, y: wanted, z }, grounded: false };
    },
    clearance: (from, to) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      if (length === 0) return 0;
      let first = 1;
      // The ground stops a line going down.
      if (to.y < GROUND && from.y >= GROUND) first = (from.y - GROUND) / (from.y - to.y);
      const boxed = grid.near(
        Math.min(from.x, to.x),
        Math.min(from.z, to.z),
        Math.max(from.x, to.x),
        Math.max(from.z, to.z),
      );
      for (const p of boxed) {
        const t = hitPrism(p, from, to);
        if (t !== null && t < first) first = t;
      }
      return first * length;
    },
    dispose: () => undefined,
  };
}
