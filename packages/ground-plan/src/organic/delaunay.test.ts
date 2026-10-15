import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Pt } from "../fixed/polygon";
import { delaunay } from "./delaunay";

const orient = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** True when d lies strictly inside the circle through the anticlockwise triangle a, b, c (exact). */
function inCircle(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const [ax, ay] = [BigInt(a.x - d.x), BigInt(a.y - d.y)];
  const [bx, by] = [BigInt(b.x - d.x), BigInt(b.y - d.y)];
  const [cx, cy] = [BigInt(c.x - d.x), BigInt(c.y - d.y)];
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  return det > 0n;
}

describe("delaunay", () => {
  it("triangulates a square's four corners and its centre into four anticlockwise triangles", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 50, y: 50 },
    ];
    const { triangles } = delaunay(pts);
    expect(triangles).toHaveLength(4);
    for (const [a, b, c] of triangles) expect(orient(pts[a]!, pts[b]!, pts[c]!)).toBeGreaterThan(0);
    expect(triangles.every((t) => t.includes(4))).toBe(true);
  });

  it("leaves no point inside any triangle's circumcircle, every triangle anticlockwise", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fc.integer({ min: -2000, max: 2000 }), fc.integer({ min: -2000, max: 2000 })), {
          minLength: 3,
          maxLength: 60,
          selector: ([x, y]) => `${x},${y}`,
        }),
        (raw) => {
          const pts = raw.map(([x, y]) => ({ x, y }));
          const { triangles } = delaunay(pts);
          const flipped = triangles.filter(([a, b, c]) => orient(pts[a]!, pts[b]!, pts[c]!) <= 0);
          const crowded = triangles.filter(([a, b, c]) =>
            pts.some((p, d) => d !== a && d !== b && d !== c && inCircle(pts[a]!, pts[b]!, pts[c]!, p)),
          );
          expect([flipped, crowded]).toEqual([[], []]);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("names each triangle's neighbour across each edge, and is the same every time", () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: (i * 7919) % 997, y: (i * 104729) % 991 }));
    const first = delaunay(pts);
    expect(delaunay(pts)).toEqual(first);
    first.triangles.forEach((t, i) => {
      first.neighbours[i]!.forEach((n, k) => {
        if (n < 0) return;
        // The edge opposite vertex k of triangle i is shared, reversed, by triangle n.
        const [u, v] = [t[(k + 1) % 3]!, t[(k + 2) % 3]!];
        const other = first.triangles[n]!;
        expect(other.some((x, j) => x === v && other[(j + 1) % 3] === u)).toBe(true);
      });
    });
  });

  it("returns nothing for fewer than three points, or points on one line", () => {
    expect(delaunay([{ x: 0, y: 0 }]).triangles).toEqual([]);
    expect(
      delaunay([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]).triangles,
    ).toEqual([]);
  });
});
