// Loop connectors: lanes joining street ends that stop near each other, so the grid has no needless dead ends.
import type { Road } from "../city/city";
import { PAVEMENT, ROAD_WIDTH, U } from "../constants";
import type { Pt } from "../fixed/polygon";

/** Two dead ends at most this far apart are joined: three street widths. */
export const LOOP_REACH = 3 * U;
/** An end within this much of another road's edge meets that road; it is no dead end. */
const TOUCH = 2 * PAVEMENT;
/** An end this close to the town's outline is an exit, not a dead end. */
const EDGE = 2 * U;

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** True when p lies within `reach` of the segment a-b, exactly. */
function within(p: Pt, a: Pt, b: Pt, reach: number): boolean {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const r2 = BigInt(reach) * BigInt(reach);
  const along = dot(ap, ab);
  const length2 = dot(ab, ab);
  if (along <= 0 || length2 === 0) return BigInt(dot(ap, ap)) <= r2;
  if (along >= length2) return BigInt(dot(sub(p, b), sub(p, b))) <= r2;
  const c = BigInt(cross(ab, ap));
  return c * c <= r2 * BigInt(length2);
}

const nearPath = (p: Pt, pts: readonly Pt[], reach: number, closed = false) =>
  pts.some((q, i) => (i > 0 || closed) && within(p, pts[(i + pts.length - 1) % pts.length]!, q, reach));

/** True when segments a-b and c-d share any point. */
/** Which side of p-q the point r lies on: -1, 0 or 1. */
const orient = (p: Pt, q: Pt, r: Pt) => Math.sign(cross(sub(q, p), sub(r, p)));
/** True when r, on the line through p and q, lies between them. */
const on = (p: Pt, q: Pt, r: Pt) => dot(sub(r, p), sub(q, p)) >= 0 && dot(sub(r, q), sub(p, q)) >= 0;

function meet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const [o1, o2, o3, o4] = [orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)];
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b))
  );
}

/** True when p lies inside the polygon (even-odd), in integers: each edge straddling p's row is compared without division. */
function inside(p: Pt, pts: readonly Pt[]): boolean {
  let odd = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y === b.y > p.y) continue;
    // p lies left of the edge where it crosses p's row: p.x < a.x + (b.x - a.x)(p.y - a.y) / (b.y - a.y).
    const rise = b.y - a.y;
    const left = (p.x - a.x) * rise;
    const right = (b.x - a.x) * (p.y - a.y);
    if (rise > 0 ? left < right : left > right) odd = !odd;
  }
  return odd;
}

/** True when the segment a-b touches the shape: crosses an edge, or lies within it. */
const crosses = (a: Pt, b: Pt, shape: readonly Pt[]) =>
  shape.some((q, i) => meet(a, b, shape[(i + shape.length - 1) % shape.length]!, q)) || inside(a, shape);

/**
 * The lanes that join the town's dead ends: ends of streets and lanes that meet no other road and lie inside the town,
 * each joined to the nearest such end of another road within `LOOP_REACH`, closest pairs first, never across a shape
 * that must stay whole (lots, parks, greens, plazas).
 */
export function loopConnectors(
  roads: readonly Road[],
  shapes: readonly (readonly Pt[])[],
  outline: readonly Pt[],
): Road[] {
  const ends = roads.flatMap((road, r) =>
    road.cls === "street" || road.cls === "lane"
      ? [road.pts[0]!, road.pts[road.pts.length - 1]!]
          .filter(
            (p) =>
              !roads.some((other, o) => o !== r && nearPath(p, other.pts, ROAD_WIDTH[other.cls] / 2 + TOUCH)) &&
              !nearPath(p, outline, EDGE, true),
          )
          .map((p) => ({ p, r }))
      : [],
  );
  const pairs = ends.flatMap((e, i) =>
    ends.slice(i + 1).flatMap((f, k) => {
      const d2 = dot(sub(e.p, f.p), sub(e.p, f.p));
      return e.r !== f.r && d2 > 0 && d2 <= LOOP_REACH * LOOP_REACH ? [{ i, j: i + 1 + k, d2 }] : [];
    }),
  );
  const used = new Set<number>();
  const lanes: Road[] = [];
  // Closest first; the sort is stable, so pairs equally far apart keep the order of their ends.
  for (const { i, j } of pairs.toSorted((a, b) => a.d2 - b.d2)) {
    if (used.has(i) || used.has(j)) continue;
    const [a, b] = [ends[i]!.p, ends[j]!.p];
    if (shapes.some((shape) => crosses(a, b, shape))) continue;
    used.add(i).add(j);
    lanes.push({ pts: [a, b], cls: "lane" });
  }
  return lanes;
}
