import { describe, expect, it } from "vitest";
import {
  axleOf,
  endsOf,
  hubOf,
  meanOf,
  partsOf,
  rotated,
  seatOf,
  surfaceTopAt,
  topOf,
  turnBetween,
  type Point,
} from "./contacts";

/** A ring of points: a tyre of radius `r` about the x axis at `centre`, `n` round, each at two widths across it. */
function tyre(r: number, centre: Point, n = 24, width = 0.03): Point[] {
  return Array.from({ length: n }, (_, i) => (i / n) * 2 * Math.PI).flatMap((a) =>
    [-width / 2, width / 2].map((x): Point => [
      centre[0] + x,
      centre[1] + r * Math.sin(a),
      centre[2] + r * Math.cos(a),
    ]),
  );
}

/** A wheel: its tyre, and a hub and spokes nearer the middle. */
const wheel = (r: number, centre: Point = [0, 0, 0]): Point[] => [
  ...tyre(r, centre),
  ...tyre(r * 0.1, centre, 8, 0.1),
  ...tyre(r * 0.6, centre, 12, 0.01),
];

/** Points turned by a quaternion. */
const turnedAll = (q: readonly [number, number, number, number], points: readonly Point[]) =>
  points.map((p) => rotated(q, p));

/** The most two points differ by along any axis. */
const gap = (a: Point, b: Point) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

describe("meanOf", () => {
  it("is the middle of the points", () => {
    expect(
      meanOf([
        [0, 0, 0],
        [2, 4, -6],
      ]),
    ).toEqual([1, 2, -3]);
  });
});

describe("turnBetween and rotated", () => {
  it("turns one direction onto another, by the shortest way", () => {
    const q = turnBetween([1, 0, 0], [0, 1, 0]);
    expect(gap(rotated(q, [1, 0, 0]), [0, 1, 0])).toBeLessThan(1e-6);
    expect(gap(rotated(q, [0, 0, 1]), [0, 0, 1])).toBeLessThan(1e-6);
  });

  it("keeps a direction already there, and turns one exactly opposite about an axis across it", () => {
    expect(turnBetween([0, 0, 2], [0, 0, 1])).toEqual([0, 0, 0, 1]);
    expect(gap(rotated(turnBetween([1, 0, 0], [-1, 0, 0]), [1, 0, 0]), [-1, 0, 0])).toBeLessThan(1e-6);
    expect(gap(rotated(turnBetween([0, 1, 0], [0, -1, 0]), [0, 1, 0]), [0, -1, 0])).toBeLessThan(1e-6);
  });
});

describe("axleOf", () => {
  it("finds the axle of a true wheel along the axis across it", () => {
    expect(gap(axleOf(tyre(0.3, [0.1, 0.4, -0.2]), 0), [1, 0, 0])).toBeLessThan(1e-6);
  });

  it("finds the tilt of a wheel leaning over, pointing along the axis asked", () => {
    const lean = 0.14;
    const leaning = turnedAll([0, 0, Math.sin(lean / 2), Math.cos(lean / 2)], tyre(0.34, [0, 0.34, 0]));
    expect(gap(axleOf(leaning, 0), [Math.cos(lean), Math.sin(lean), 0])).toBeLessThan(1e-6);
    expect(
      gap(
        axleOf(
          leaning.map(([x, y, z]): Point => [-x, -y, z]),
          0,
        ),
        [Math.cos(lean), Math.sin(lean), 0],
      ),
    ).toBeLessThan(1e-6);
  });

  it("finds a wheel lying flat's axle up y", () => {
    const flat = tyre(0.3, [0, 0, 0]).map(([x, y, z]): Point => [y, x, z]);
    expect(gap(axleOf(flat, 1), [0, 1, 0])).toBeLessThan(1e-6);
  });

  it("finds a motorbike's axle across z", () => {
    const points = tyre(0.8, [0, 0, 0]).map(([x, y, z]): Point => [z, y, x]);
    expect(gap(axleOf(points, 2), [0, 0, 1])).toBeLessThan(1e-6);
  });

  it("calls a ring with nothing to fit across it (all in a line) its own axis", () => {
    expect(
      axleOf(
        [
          [0, 0, 0],
          [0, 1, 0],
          [0, 2, 0],
        ],
        0,
      ),
    ).toEqual([1, 0, 0]);
  });
});

describe("hubOf", () => {
  it("finds a wheel's hub, axle and radius from its outermost ring, not its hub or spokes", () => {
    const hub = hubOf(wheel(0.34, [0.05, 0.34, -0.5]), 0);
    expect(gap(hub.centre, [0.05, 0.34, -0.5])).toBeLessThan(1e-6);
    expect(gap(hub.axle, [1, 0, 0])).toBeLessThan(1e-6);
    expect(hub.radius).toBeCloseTo(0.34, 6);
  });

  it("finds a leaning wheel's tilted axle and the hub it turns about", () => {
    const lean = 0.14;
    const q = [0, 0, Math.sin(lean / 2), Math.cos(lean / 2)] as const;
    const hub = hubOf(turnedAll(q, wheel(0.34, [0, 0.34, 0])), 0);
    expect(gap(hub.centre, rotated(q, [0, 0.34, 0]))).toBeLessThan(1e-6);
    expect(gap(hub.axle, [Math.cos(lean), Math.sin(lean), 0])).toBeLessThan(1e-6);
  });
});

describe("endsOf", () => {
  it("finds the middle of each end of a part across an axis, within a span of its extreme", () => {
    const bars: Point[] = [
      [0, 1, -0.3],
      [0.02, 1.02, -0.28],
      [0, 0.9, 0],
      [0, 1, 0.3],
      [0.02, 1.02, 0.28],
    ];
    const { low, high } = endsOf(bars, 2, 0.05);
    expect(gap(low, [0.01, 1.01, -0.29])).toBeLessThan(1e-6);
    expect(gap(high, [0.01, 1.01, 0.29])).toBeLessThan(1e-6);
  });
});

describe("topOf", () => {
  it("finds the middle of a part's top, within a depth of its highest point, at that height", () => {
    const saddle: Point[] = [
      [-0.1, 0.95, 0],
      [0.1, 0.94, 0.02],
      [0, 0.8, 0],
    ];
    expect(gap(topOf(saddle, 0.02), [0, 0.95, 0.01])).toBeLessThan(1e-6);
  });
});

/** A flat square, `size` across, at a height, centred at (x, z); two triangles. */
function square(x: number, z: number, y: number, size: number) {
  const h = size / 2;
  const corners = [x - h, y, z - h, x + h, y, z - h, x + h, y, z + h, x - h, y, z + h];
  return { positions: corners, indices: [0, 1, 2, 0, 2, 3] };
}

/** Squares joined into one mesh. */
function joined(...meshes: { positions: number[]; indices: number[] }[]) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const mesh of meshes) {
    indices.push(...mesh.indices.map((i) => i + positions.length / 3));
    positions.push(...mesh.positions);
  }
  return { positions, indices };
}

describe("surfaceTopAt", () => {
  it("finds the highest surface straight above a point, and none off the mesh or under an edge-on face", () => {
    const { positions, indices } = joined(square(0, 0, 0.5, 1), square(0.2, 0, 0.9, 0.2), square(0.2, 0, 0.7, 0.4));
    expect(surfaceTopAt(positions, indices, 0.2, 0)).toBeCloseTo(0.9, 9);
    expect(surfaceTopAt(positions, indices, -0.3, 0.1)).toBeCloseTo(0.5, 9);
    expect(surfaceTopAt(positions, indices, 3, 0)).toBeNull();
    expect(surfaceTopAt([0, 0, 0, 0, 1, 0, 1, 1, 0], [0, 1, 2], 0.5, 0)).toBeNull();
  });
});

describe("seatOf", () => {
  it("finds the lowest top along the middle line: a chopper's seat between its fender and its tank", () => {
    const { positions, indices } = joined(
      square(-0.9, 0, 0.78, 0.3),
      square(-0.5, 0, 0.7, 0.2),
      square(-0.2, 0, 0.75, 0.2),
      square(0.1, 0, 1.09, 0.3),
    );
    expect(seatOf(positions, indices, { from: -1, to: 0.2, step: 0.05 })).toEqual([
      expect.closeTo(-0.6, 6),
      expect.closeTo(0.7, 9),
      0,
    ]);
  });

  it("finds none over a mesh with no surface along its middle line", () => {
    expect(seatOf(square(0, 3, 1, 1).positions, square(0, 3, 1, 1).indices, { from: -1, to: 1, step: 0.1 })).toBeNull();
  });
});

describe("partsOf", () => {
  it("splits a mesh's triangles into the parts they join, vertices at the same place joined", () => {
    // Two triangles sharing an edge by position (not index), and one apart.
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 5, 5, 5, 6, 5, 5, 5, 6, 5];
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const parts = partsOf(positions, indices);
    expect(parts.map((p) => p.triangles)).toEqual([[0, 1], [2]]);
    expect(parts.map((p) => p.vertices)).toEqual([
      [0, 1, 2, 3, 4, 5],
      [6, 7, 8],
    ]);
  });
});
