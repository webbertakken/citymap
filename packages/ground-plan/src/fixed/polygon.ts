import { floorDiv, mulDiv } from "./arithmetic";
import { DIRECTION, dir, normalise, type Dir } from "./direction";

/** An integer point in fixed units. */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** A convex polygon, anticlockwise; w[i] is the road width on the edge from p[i] to p[i + 1]. */
export interface Poly {
  readonly p: readonly Pt[];
  readonly w: readonly number[];
}

const EMPTY: Poly = { p: [], w: [] };
const next = <T>(list: readonly T[], i: number): T => list[(i + 1) % list.length] as T;

/** Twice the signed area (the shoelace sum), measured from the first vertex so terms stay small. */
export function area2(pts: readonly Pt[]): number {
  const o = pts[0];
  if (!o) return 0;
  let sum = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i] as Pt;
    const b = pts[i + 1] as Pt;
    sum += (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y);
  }
  return sum;
}

/** The centre of mass, rounded; the first point for a degenerate polygon. */
export function centroid(pts: readonly Pt[]): Pt {
  const o = pts[0];
  if (!o) return { x: 0, y: 0 };
  let a = 0n;
  let cx = 0n;
  let cy = 0n;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as Pt;
    const q = pts[i + 1] as Pt;
    const px = BigInt(p.x - o.x);
    const py = BigInt(p.y - o.y);
    const qx = BigInt(q.x - o.x);
    const qy = BigInt(q.y - o.y);
    const c = px * qy - qx * py;
    a += c;
    cx += (px + qx) * c;
    cy += (py + qy) * c;
  }
  if (a === 0n) return o;
  const div = (n: bigint) => {
    const d = 3n * a;
    const [num, den] = d < 0n ? [-n, -d] : [n, d];
    const twice = 2n * num + den;
    const q = twice / (2n * den);
    return Number(twice % (2n * den) !== 0n && twice < 0n ? q - 1n : q);
  };
  return { x: o.x + div(cx), y: o.y + div(cy) };
}

/** n·q − c: negative or zero on the kept side of a line. */
export const side = (n: Dir, c: number, q: Pt): number => n[0] * q.x + n[1] * q.y - c;

/** The point where segment a→b crosses the line, given the sides sa and sb of its ends (of opposite sign). */
function crossing(a: Pt, b: Pt, sa: number, sb: number): Pt {
  const [num, den] = sa - sb < 0 ? [-sa, sb - sa] : [sa, sa - sb];
  return { x: a.x + mulDiv(b.x - a.x, num, den, "round"), y: a.y + mulDiv(b.y - a.y, num, den, "round") };
}

const tidy = (pts: Pt[], widths: number[]): Poly => {
  const p: Pt[] = [];
  const w: number[] = [];
  pts.forEach((q, i) => {
    const prev = p[p.length - 1];
    if (prev && prev.x === q.x && prev.y === q.y) {
      w[w.length - 1] = widths[i] as number;
      return;
    }
    p.push(q);
    w.push(widths[i] as number);
  });
  const first = p[0];
  const last = p[p.length - 1];
  if (p.length > 1 && first && last && first.x === last.x && first.y === last.y) {
    p.pop();
    w.pop();
  }
  return p.length >= 3 ? { p, w } : EMPTY;
};

/** Keeps the part where n·q ≤ c; the new edge along the cut gets cutWidth. */
export function clip(poly: Poly, n: Dir, c: number, cutWidth: number): Poly {
  const out: Pt[] = [];
  const widths: number[] = [];
  poly.p.forEach((cur, i) => {
    const nxt = next(poly.p, i);
    const sc = side(n, c, cur);
    const sn = side(n, c, nxt);
    if (sc <= 0) {
      out.push(cur);
      widths.push(poly.w[i] as number);
      if (sn > 0) {
        out.push(crossing(cur, nxt, sc, sn));
        widths.push(cutWidth);
      }
    } else if (sn <= 0) {
      out.push(crossing(cur, nxt, sc, sn));
      widths.push(poly.w[i] as number);
    }
  });
  return tidy(out, widths);
}

/** Moves every edge inward by half its road width plus the pavement; empty when it collapses. */
export function inset(poly: Poly, pavement: number): Poly {
  let result: Poly = { p: poly.p, w: poly.w.map(() => 0) };
  for (let i = 0; i < poly.p.length; i++) {
    const a = poly.p[i] as Pt;
    const b = next(poly.p, i);
    if (a.x === b.x && a.y === b.y) continue;
    const n = normalise(b.y - a.y, a.x - b.x);
    const d = floorDiv(poly.w[i] as number, 2) + pavement;
    result = clip(result, n, n[0] * a.x + n[1] * a.y - d * DIRECTION, 0);
    if (result.p.length < 3) return EMPTY;
  }
  return { p: result.p, w: result.p.map(() => 0) };
}

/** The two crossings of the line n·q = c through the polygon, in edge order, or null. */
export function chord(pts: readonly Pt[], n: Dir, c: number): [Pt, Pt] | null {
  const hits: Pt[] = [];
  pts.forEach((a, i) => {
    const b = next(pts, i);
    const sa = side(n, c, a);
    const sb = side(n, c, b);
    if ((sa <= 0 && sb > 0) || (sa > 0 && sb <= 0)) hits.push(crossing(a, b, sa, sb));
  });
  const [first, second] = hits;
  return first && second ? [first, second] : null;
}

/** The least and greatest n·q over the points. */
export function extent(pts: readonly Pt[], n: Dir): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of pts) {
    const t = n[0] * q.x + n[1] * q.y;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return [lo, hi];
}

/** The direction of the longest edge (squared length; ties to the first). */
export function longestEdge(pts: readonly Pt[]): Dir {
  let best = -1;
  let vector: [number, number] = [1, 0];
  pts.forEach((a, i) => {
    const b = next(pts, i);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    if (length > best) {
      best = length;
      vector = [dx, dy];
    }
  });
  return normalise(vector[0], vector[1]);
}

/** The least integer offset c such that the land with n·q ≤ c holds at least num/den of the polygon's area. */
export function offsetFor(poly: Poly, n: Dir, num: number, den: number): number {
  const total = BigInt(area2(poly.p)) * BigInt(num);
  const [lo0, hi0] = extent(poly.p, n);
  let lo = lo0;
  let hi = hi0;
  while (lo < hi) {
    const mid = lo + floorDiv(hi - lo, 2);
    if (BigInt(area2(clip(poly, n, mid, 0).p)) * BigInt(den) >= total) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The distance from centre along angle step a to the polygon's boundary, in fixed units (floor). */
export function reach(pts: readonly Pt[], centre: Pt, a: number): number {
  const [dx, dy] = dir(a);
  let best = 0;
  pts.forEach((p, i) => {
    const q = next(pts, i);
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    let den = dx * ey - dy * ex;
    let tNum = (p.x - centre.x) * ey - (p.y - centre.y) * ex;
    let uNum = (p.x - centre.x) * dy - (p.y - centre.y) * dx;
    if (den === 0) return;
    if (den < 0) {
      den = -den;
      tNum = -tNum;
      uNum = -uNum;
    }
    if (tNum <= 0 || uNum < 0 || uNum > den) return;
    const t = mulDiv(tNum, DIRECTION, den, "floor");
    if (t > best) best = t;
  });
  return best;
}
