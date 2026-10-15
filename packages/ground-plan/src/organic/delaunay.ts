// An exact Delaunay triangulation of integer points (Bowyer-Watson), for the organic layer's district regions.
import type { Pt } from "../fixed/polygon";

export interface Triangulation {
  /** Anticlockwise triangles, as indices into the points. */
  readonly triangles: readonly (readonly [number, number, number])[];
  /** For each triangle, the triangle across the edge opposite each of its vertices, or -1 on the hull. */
  readonly neighbours: readonly (readonly [number, number, number])[];
}

interface Tri {
  v: [number, number, number];
  n: [number, number, number];
  alive: boolean;
}

const big = (p: Pt) => [BigInt(p.x), BigInt(p.y)] as const;

/** Twice the signed area of a, b, c: positive when anticlockwise (exact). */
function orient(a: Pt, b: Pt, c: Pt): bigint {
  const [ax, ay] = big(a);
  const [bx, by] = big(b);
  const [cx, cy] = big(c);
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Positive when d lies inside the circle through the anticlockwise triangle a, b, c (exact). */
function inCircle(a: Pt, b: Pt, c: Pt, d: Pt): bigint {
  const [dx, dy] = big(d);
  const [ax, ay] = [BigInt(a.x) - dx, BigInt(a.y) - dy];
  const [bx, by] = [BigInt(b.x) - dx, BigInt(b.y) - dy];
  const [cx, cy] = [BigInt(c.x) - dx, BigInt(c.y) - dy];
  return (
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay)
  );
}

/**
 * The Delaunay triangulation of distinct integer points. Points are inserted in sorted order, each located by walking
 * from the last triangle made; a point cocircular with a triangle does not break it, so the result is deterministic.
 */
export function delaunay(points: readonly Pt[]): Triangulation {
  const n = points.length;
  if (n < 3) return { triangles: [], neighbours: [] };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 1) * 1000;
  const [mx, my] = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
  // Three far points round everything; the triangles touching them are dropped at the end.
  const pts: Pt[] = [
    ...points,
    { x: mx - 3 * span, y: my - 3 * span },
    { x: mx + 3 * span, y: my - 3 * span },
    { x: mx, y: my + 3 * span },
  ];
  const tris: Tri[] = [{ v: [n, n + 1, n + 2], n: [-1, -1, -1], alive: true }];
  const P = (i: number) => pts[i]!;
  let last = 0;

  const locate = (p: Pt): number => {
    let t = last;
    for (;;) {
      const tri = tris[t]!;
      const step = [0, 1, 2].find((k) => orient(P(tri.v[(k + 1) % 3]!), P(tri.v[(k + 2) % 3]!), p) < 0n);
      if (step === undefined) return t;
      t = tri.n[step]!;
    }
  };

  const order = points.map((_, i) => i).toSorted((a, b) => xs[a]! - xs[b]! || ys[a]! - ys[b]!);
  for (const i of order) {
    const p = P(i);
    // The cavity: every triangle whose circumcircle holds p, reached from the one containing it.
    const start = locate(p);
    const bad = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const t = queue.pop()!;
      for (const m of tris[t]!.n)
        if (m >= 0 && !bad.has(m) && inCircle(P(tris[m]!.v[0]), P(tris[m]!.v[1]), P(tris[m]!.v[2]), p) > 0n) {
          bad.add(m);
          queue.push(m);
        }
    }
    // Its boundary edges, each with the triangle beyond it, become new triangles fanned from p.
    const made: number[] = [];
    const byStart = new Map<number, number>();
    for (const t of bad) {
      const tri = tris[t]!;
      tri.alive = false;
      for (let k = 0; k < 3; k++) {
        const beyond = tri.n[k]!;
        if (beyond >= 0 && bad.has(beyond)) continue;
        const [u, v] = [tri.v[(k + 1) % 3]!, tri.v[(k + 2) % 3]!];
        const id = tris.length;
        tris.push({ v: [i, u, v], n: [beyond, -1, -1], alive: true });
        if (beyond >= 0) {
          const other = tris[beyond]!;
          other.n[other.n.indexOf(t)] = id;
        }
        byStart.set(u, id);
        made.push(id);
      }
    }
    // Neighbours among the fan: the triangle on p-v is the one whose edge starts at v.
    for (const id of made) {
      const tri = tris[id]!;
      tri.n[1] = byStart.get(tri.v[2])!;
      tris[tri.n[1]]!.n[2] = id;
    }
    last = made[0]!;
  }

  const kept = tris.map((t, i) => (t.alive && t.v.every((v) => v < n) ? i : -1)).filter((i) => i >= 0);
  const index = new Map(kept.map((t, k) => [t, k]));
  return {
    triangles: kept.map((t) => {
      const [a, b, c] = tris[t]!.v;
      return [a, b, c];
    }),
    neighbours: kept.map((t) => {
      const [a, b, c] = tris[t]!.n.map((m) => index.get(m) ?? -1);
      return [a!, b!, c!];
    }),
  };
}
