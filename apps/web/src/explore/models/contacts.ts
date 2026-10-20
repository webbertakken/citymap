// Where a rider meets a vehicle, measured from the vehicle's own meshes by the model build: a wheel's hub and axle, the
// ends of its bars and of its crank, the top of its saddle or the dip of its seat, and the parts a mesh is made of (to
// find a kickstand among them). Points are in a part's own frame, in its file's units.

/** A point, or a direction, in a part's frame. */
export type Point = readonly [number, number, number];
/** An axis of a part's frame: x, y or z. */
export type Axis = 0 | 1 | 2;
/** A turn, as a unit quaternion (x, y, z, w). */
export type Turn = readonly [number, number, number, number];

/** The share of a wheel's radius its outermost ring is measured within: its tyre, not its spokes or hub. */
export const RING = 0.03;

const unit = (axis: Axis): Point => [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scaled = (a: Point, s: number): Point => [a[0] * s, a[1] * s, a[2] * s];
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const normal = (a: Point): Point => scaled(a, 1 / Math.hypot(...a));

/** The middle of some points. */
export function meanOf(points: readonly Point[]): Point {
  const sum = points.reduce<Point>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
  return scaled(sum, 1 / points.length);
}

/** A point turned by a turn. */
export function rotated(q: Turn, p: Point): Point {
  const v: Point = [q[0], q[1], q[2]];
  const t = scaled(cross(v, p), 2);
  const w = cross(v, t);
  return [p[0] + q[3] * t[0] + w[0], p[1] + q[3] * t[1] + w[1], p[2] + q[3] * t[2] + w[2]];
}

/** The shortest turn taking one direction onto another; half a turn about a line across them when they are opposite. */
export function turnBetween(from: Point, to: Point): Turn {
  const a = normal(from);
  const b = normal(to);
  const d = dot(a, b);
  if (d > 1 - 1e-12) return [0, 0, 0, 1];
  if (d < -1 + 1e-12) {
    const across = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
    const n = normal(across);
    return [n[0], n[1], n[2], 0];
  }
  const c = cross(a, b);
  const length = Math.hypot(c[0], c[1], c[2], 1 + d);
  return [c[0] / length, c[1] / length, c[2] / length, (1 + d) / length];
}

/** Rounds of inverse iteration that settle a plane's normal well past a millionth. */
const SETTLE = 40;

/**
 * The axle of a ring of points: the normal of the plane they lie nearest (their spread's least direction, by inverse
 * iteration on its covariance from the axis asked), pointing along +`across`. Points in a line give the axis itself.
 */
export function axleOf(points: readonly Point[], across: Axis): Point {
  const middle = meanOf(points);
  const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of points) {
    const d = minus(p, middle);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j]! += d[i]! * d[j]!;
  }
  // Shifted a hair, so a flat ring (no spread across at all) still inverts.
  const shift = 1e-9 * (c[0]! + c[4]! + c[8]!) + 1e-30;
  for (const i of [0, 4, 8]) c[i]! += shift;
  const [a = 0, b = 0, d = 0, , e = 0, f = 0, , , g = 0] = c;
  // The inverse of the symmetric [[a b d] [b e f] [d f g]], up to its determinant (a scale the normalising drops).
  const inverse = [e * g - f * f, d * f - b * g, b * f - d * e, a * g - d * d, b * d - a * f, a * e - b * b];
  const [ia = 0, ib = 0, id = 0, ie = 0, iff = 0, ig = 0] = inverse;
  let n = unit(across);
  for (let k = 0; k < SETTLE; k++)
    n = normal([
      ia * n[0] + ib * n[1] + id * n[2],
      ib * n[0] + ie * n[1] + iff * n[2],
      id * n[0] + iff * n[1] + ig * n[2],
    ]);
  // Each round keeps the side of the axis it began on: the normal points along +`across`.
  return n;
}

/** How far a point is from a line through `centre` along `axle` (a unit direction). */
const offAxle = (p: Point, centre: Point, axle: Point) => {
  const d = minus(p, centre);
  return Math.hypot(...minus(d, scaled(axle, dot(d, axle))));
};

/** The middle of the box round some points. */
function boxMiddle(points: readonly Point[]): Point {
  const middle = (k: Axis) => {
    const values = points.map((p) => p[k]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  };
  return [middle(0), middle(1), middle(2)];
}

/** The determinant of a 3×3 matrix, rows first. */
const det3 = (m: readonly number[]) =>
  m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
  m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
  m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);

/**
 * The middle of a ring of points about an axle (a unit direction): across it, the centre of the circle they lie nearest
 * (least squares, Kasa's fit, so points sampled unevenly round it weigh nothing); along it, halfway between its ends.
 */
function circleMiddle(ring: readonly Point[], axle: Point): Point {
  const first = normal(cross(axle, Math.abs(axle[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const second = cross(axle, first);
  const flat = ring.map((p) => [dot(p, first), dot(p, second)] as const);
  // The normal equations of u² + v² + D u + E v + F = 0 over the ring.
  const sums = { uu: 0, uv: 0, vv: 0, u: 0, v: 0, uw: 0, vw: 0, w: 0 };
  for (const [u, v] of flat) {
    const w = -(u * u + v * v);
    sums.uu += u * u;
    sums.uv += u * v;
    sums.vv += v * v;
    sums.u += u;
    sums.v += v;
    sums.uw += u * w;
    sums.vw += v * w;
    sums.w += w;
  }
  const n = flat.length;
  const { uu, uv, vv, u, v, uw, vw, w } = sums;
  const whole = det3([uu, uv, u, uv, vv, v, u, v, n]);
  const d = det3([uw, uv, u, vw, vv, v, w, v, n]) / whole;
  const e = det3([uu, uw, u, uv, vw, v, u, w, n]) / whole;
  const along = ring.map((p) => dot(p, axle));
  const middle = (Math.min(...along) + Math.max(...along)) / 2;
  const at = (k: Axis) => first[k] * (-d / 2) + second[k] * (-e / 2) + axle[k] * middle;
  return [at(0), at(1), at(2)];
}

/** Rounds of finding a wheel's outermost ring about its middle, and its middle from that ring. */
const RING_ROUNDS = 3;

/**
 * A wheel's hub (where it turns), axle and radius: from its outermost ring of points (within `RING` of the farthest from
 * its middle, found again about the ring's own middle), so its spokes, hub and any detail off its middle weigh nothing;
 * `across` the axis its axle is nearest.
 */
export function hubOf(points: readonly Point[], across: Axis) {
  let centre = boxMiddle(points);
  let axle = unit(across);
  let ring: readonly Point[] = points;
  for (let round = 0; round < RING_ROUNDS; round++) {
    const far = points.map((p) => offAxle(p, centre, axle));
    const farthest = Math.max(...far);
    ring = points.filter((_, i) => far[i]! >= (1 - RING) * farthest);
    axle = axleOf(ring, across);
    centre = circleMiddle(ring, axle);
  }
  const radius = ring.reduce((sum, p) => sum + offAxle(p, centre, axle), 0) / ring.length;
  return { centre, axle, radius };
}

/** The two ends of a part along an axis: the middle of its points within `span` of each extreme (bars' grips, pedals). */
export function endsOf(points: readonly Point[], along: Axis, span: number) {
  const values = points.map((p) => p[along]);
  const most = Math.max(...values);
  const least = Math.min(...values);
  return {
    low: meanOf(points.filter((p) => p[along] <= least + span)),
    high: meanOf(points.filter((p) => p[along] >= most - span)),
  };
}

/** A part's top: the middle of its points within `depth` of its highest, at that height (a saddle's). */
export function topOf(points: readonly Point[], depth: number): Point {
  const highest = Math.max(...points.map((p) => p[1]));
  const middle = meanOf(points.filter((p) => p[1] >= highest - depth));
  return [middle[0], highest, middle[2]];
}

/** Every height of a mesh's surface over (x, z), in its triangles' order: each triangle that point lies under or over. */
function surfacesAt(positions: ArrayLike<number>, indices: ArrayLike<number>, x: number, z: number): number[] {
  const heights: number[] = [];
  const at = (i: number, k: number) => positions[indices[i]! * 3 + k]!;
  for (let t = 0; t < indices.length; t += 3) {
    const [ax, ay, az] = [at(t, 0), at(t, 1), at(t, 2)];
    const [bx, by, bz] = [at(t + 1, 0), at(t + 1, 1), at(t + 1, 2)];
    const [cx, cy, cz] = [at(t + 2, 0), at(t + 2, 1), at(t + 2, 2)];
    // Where (x, z) is in the triangle seen from above, by its barycentric weights; an edge-on triangle hides nothing.
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    heights.push(u * ay + v * by + (1 - u - v) * cy);
  }
  return heights;
}

/** The height of a mesh's surface straight above (x, z): its highest triangle over that point; null where there is none. */
export function surfaceTopAt(positions: ArrayLike<number>, indices: ArrayLike<number>, x: number, z: number) {
  const heights = surfacesAt(positions, indices, x, z);
  return heights.length > 0 ? Math.max(...heights) : null;
}

/** The height of a mesh's lowest surface over (x, z), a hull's floor under its roof; null where there is none. */
export function surfaceBottomAt(positions: ArrayLike<number>, indices: ArrayLike<number>, x: number, z: number) {
  const heights = surfacesAt(positions, indices, x, z);
  return heights.length > 0 ? Math.min(...heights) : null;
}

/**
 * A seat that dips between its fender and its tank (a chopper's): the lowest of a mesh's surface tops along its middle
 * line (z = 0) from x = `from` to x = `to`, every `step`, where it has a surface; null where it has none at all.
 */
export function seatOf(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  span: { readonly from: number; readonly to: number; readonly step: number },
): Point | null {
  let seat: Point | null = null;
  for (let x = span.from; x <= span.to; x += span.step) {
    const y = surfaceTopAt(positions, indices, x, 0);
    if (y !== null && (seat === null || y < seat[1])) seat = [x, y, 0];
  }
  return seat;
}

/** One part of a mesh: its vertices and its triangles (by their order in the index), each in order. */
export interface MeshPart {
  readonly vertices: readonly number[];
  readonly triangles: readonly number[];
}

/**
 * The parts a mesh is made of: its triangles joined where they share a vertex, or a vertex at the same place (to the
 * tenth of a millimetre, as a mesh split by its seams keeps each side's own), in the order of each part's first triangle.
 */
export function partsOf(positions: ArrayLike<number>, indices: ArrayLike<number>): MeshPart[] {
  const count = positions.length / 3;
  const parent = Array.from({ length: count }, (_, i) => i);
  const root = (i: number): number => {
    let at = i;
    while (parent[at] !== at) at = parent[at] = parent[parent[at]!]!;
    return at;
  };
  const join = (a: number, b: number) => {
    parent[root(a)] = root(b);
  };
  const seen = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const key = [0, 1, 2].map((k) => Math.round(positions[i * 3 + k]! * 1e4)).join(",");
    const same = seen.get(key);
    if (same === undefined) seen.set(key, i);
    else join(i, same);
  }
  for (let t = 0; t < indices.length; t += 3) {
    join(indices[t]!, indices[t + 1]!);
    join(indices[t + 1]!, indices[t + 2]!);
  }
  const parts = new Map<number, { vertices: Set<number>; triangles: number[] }>();
  for (let t = 0; t < indices.length / 3; t++) {
    const part = parts.get(root(indices[t * 3]!)) ?? { vertices: new Set<number>(), triangles: [] };
    parts.set(root(indices[t * 3]!), part);
    part.triangles.push(t);
    for (let k = 0; k < 3; k++) part.vertices.add(indices[t * 3 + k]!);
  }
  return [...parts.values()].map((p) => ({
    vertices: [...p.vertices].toSorted((a, b) => a - b),
    triangles: p.triangles,
  }));
}
