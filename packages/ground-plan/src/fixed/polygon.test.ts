import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DIRECTION, dir, negate, type Dir } from "./direction";
import {
  area2,
  centroid,
  chord,
  clip,
  extent,
  inset,
  longestEdge,
  offsetFor,
  reach,
  type Poly,
  type Pt,
} from "./polygon";

const pt = (x: number, y: number): Pt => ({ x, y });
const square = (size: number, width = 0): Poly => ({
  p: [pt(0, 0), pt(size, 0), pt(size, size), pt(0, size)],
  w: [width, width, width, width],
});
const EAST: Dir = [DIRECTION, 0];
const NORTH: Dir = [0, DIRECTION];

describe("area2", () => {
  it("is twice the area, positive anticlockwise", () => {
    expect(area2(square(1000).p)).toBe(2_000_000);
    expect(area2([...square(1000).p].reverse())).toBe(-2_000_000);
    expect(area2([])).toBe(0);
  });

  it("stays exact far from the origin", () => {
    const far = square(1000).p.map((q) => pt(q.x + 2 ** 21, q.y - 2 ** 21));
    expect(area2(far)).toBe(2_000_000);
  });
});

describe("centroid", () => {
  it("finds the centre of mass", () => {
    expect(centroid(square(1000).p)).toEqual(pt(500, 500));
    expect(centroid([pt(0, 0), pt(9, 0), pt(0, 9)])).toEqual(pt(3, 3));
  });

  it("does not depend on orientation", () => {
    expect(centroid([...square(1000).p].reverse())).toEqual(pt(500, 500));
  });

  it("is the origin for no points", () => {
    expect(centroid([])).toEqual(pt(0, 0));
  });

  it("returns the first point of a degenerate polygon", () => {
    expect(centroid([pt(4, 4), pt(8, 8), pt(12, 12)])).toEqual(pt(4, 4));
  });
});

describe("clip", () => {
  it("keeps the side where n·p ≤ c and gives the cut edge its width", () => {
    const left = clip(square(1000), EAST, 300 * DIRECTION, 64);
    expect(area2(left.p)).toBe(600_000);
    expect(left.w).toContain(64);
    expect(left.p.every((q) => q.x <= 300)).toBe(true);
  });

  it("drops the duplicate points of a cut through vertices", () => {
    const diamond: Poly = { p: [pt(0, -10), pt(10, 0), pt(0, 10), pt(-10, 0)], w: [1, 2, 3, 4] };
    const half = clip(diamond, EAST, 0, 9);
    expect(half.p).toEqual([pt(0, -10), pt(0, 10), pt(-10, 0)]);
    expect(half.w).toEqual([9, 3, 4]);
  });

  it("drops a repeated closing point", () => {
    const ring: Poly = { p: [...square(10).p, pt(0, 0)], w: [0, 0, 0, 0, 0] };
    expect(clip(ring, EAST, 99 * DIRECTION, 0).p).toEqual(square(10).p);
  });

  it("returns the whole polygon or nothing when the line misses", () => {
    expect(clip(square(1000), EAST, 2000 * DIRECTION, 0).p).toHaveLength(4);
    expect(clip(square(1000), EAST, -5 * DIRECTION, 0).p).toHaveLength(0);
  });

  it("conserves area across both sides within rounding", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4095 }), fc.integer({ min: -600, max: 600 }), (a, offset) => {
        const poly = square(1000);
        const n = dir(a);
        const c = n[0] * 500 + n[1] * 500 + offset * DIRECTION;
        const both = area2(clip(poly, n, c, 0).p) + area2(clip(poly, negate(n), -c, 0).p);
        return Math.abs(both - area2(poly.p)) <= 4 * 1000;
      }),
    );
  });
});

describe("inset", () => {
  it("moves each edge in by half its road plus pavement", () => {
    const inner = inset(square(1000, 64), 12);
    expect(area2(inner.p)).toBe(2 * 912 * 912);
  });

  it("skips a repeated vertex", () => {
    const repeated: Poly = { p: [pt(0, 0), pt(0, 0), pt(1000, 0), pt(1000, 1000), pt(0, 1000)], w: [64, 64, 64, 64, 64] };
    expect(area2(inset(repeated, 12).p)).toBe(2 * 912 * 912);
  });

  it("collapses to nothing when the polygon is too small", () => {
    expect(inset(square(50, 64), 12).p).toHaveLength(0);
  });
});

describe("chord", () => {
  it("returns the crossings in edge order", () => {
    expect(chord(square(1000).p, EAST, 250 * DIRECTION)).toEqual([pt(250, 0), pt(250, 1000)]);
    expect(chord(square(1000).p, EAST, 5000 * DIRECTION)).toBeNull();
  });
});

describe("extent and longestEdge", () => {
  it("projects onto a direction", () => {
    expect(extent(square(1000).p, NORTH)).toEqual([0, 1000 * DIRECTION]);
  });

  it("finds the longest edge, ties to the first", () => {
    expect(longestEdge([pt(0, 0), pt(10, 0), pt(10, 30), pt(0, 30)])).toEqual(NORTH);
    expect(longestEdge(square(1000).p)).toEqual(EAST);
  });
});

describe("offsetFor", () => {
  it("returns the least offset leaving the share below the line", () => {
    const c = offsetFor(square(1000), EAST, 1, 4);
    expect(area2(clip(square(1000), EAST, c, 0).p) * 4).toBeGreaterThanOrEqual(2_000_000);
    expect(area2(clip(square(1000), EAST, c - 1, 0).p) * 4).toBeLessThan(2_000_000);
  });

  it("handles shares of large demands exactly", () => {
    const c = offsetFor(square(1000), NORTH, 2 ** 40, 2 ** 41);
    expect(Math.abs(c - 500 * DIRECTION)).toBeLessThanOrEqual(DIRECTION);
  });
});

describe("reach", () => {
  it("measures from a point to the boundary along an angle", () => {
    expect(reach(square(1000).p, pt(500, 500), 0)).toBe(500);
    expect(reach(square(1000).p, pt(500, 500), 1024)).toBe(500);
    expect(reach(square(1000).p, pt(500, 500), 512)).toBe(707);
  });
});
