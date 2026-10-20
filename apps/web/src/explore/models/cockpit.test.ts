import { describe, expect, it } from "vitest";
import { COCKPIT, cockpitOf, isGlass, panesOf, type Paint } from "./cockpit";
import type { Point } from "./contacts";

// A made cabin in the helicopter file's frame (metres, ahead −z, the pilot's right +x): 2 m wide about x = 0.1, from z =
// −3 to 2; its floor 0.5 m up, rising a quarter of a metre a metre ahead of z = −1 into the nose; its roof 2.2 m up.

/** A mesh being made: its positions, and its hull's and its glass's triangles as index lists into them. */
interface Made {
  readonly positions: number[];
  readonly hull: number[];
  readonly glass: number[];
}

const floorAt = (z: number) => 0.5 + Math.max(0, -1 - z) * 0.25;

/** A quad's two triangles from four corners in order round it, onto the hull or the glass. */
function quad(made: Made, to: "hull" | "glass", ...corners: readonly Point[]) {
  const first = made.positions.length / 3;
  for (const corner of corners) made.positions.push(...corner);
  made[to].push(first, first + 1, first + 2, first, first + 2, first + 3);
}

/** The cabin's floor (in strips a quarter of a metre long) and roof, and whichever panes are asked for. */
function cabin(panes: readonly (readonly Point[])[], floor: (z: number) => number = floorAt): Made {
  const made: Made = { positions: [], hull: [], glass: [] };
  for (let z = -3; z < 2; z += 0.25) {
    const [a, b] = [z, z + 0.25];
    quad(made, "hull", [-0.9, floor(a), a], [1.1, floor(a), a], [1.1, floor(b), b], [-0.9, floor(b), b]);
  }
  quad(made, "hull", [-0.9, 2.2, -3], [1.1, 2.2, -3], [1.1, 2.2, 2], [-0.9, 2.2, 2]);
  for (const pane of panes) quad(made, "glass", ...pane);
  return made;
}

/** An upright pane on a side of the cabin (x), from `low` to `high` and `front` to `back`. */
const side = (x: number, low: number, high: number, front: number, back: number): Point[] => [
  [x, low, front],
  [x, low, back],
  [x, high, back],
  [x, high, front],
];

const DOOR = side(1.1, 1.2, 1.8, -1.2, -0.4);
const REAR = side(1.1, 1.2, 1.8, -0.2, 0.6);
const LOWER = side(1.1, 0.7, 1.0, -1.8, -1.3);
const LEFT_DOOR = side(-0.9, 1.2, 1.8, -1.4, -0.6);
const WINDSCREEN: Point[] = [
  [-0.9, 1.2, -2.5],
  [1.1, 1.2, -2.5],
  [1.1, 2.0, -1.8],
  [-0.9, 2.0, -1.8],
];
const PANES = [WINDSCREEN, LEFT_DOOR, LOWER, REAR, DOOR];

const measured = (made: Made) => cockpitOf(made.positions, made.hull, made.glass);

/** The most two points differ by along any axis. */
const gap = (a: Point, b: Point) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

describe("isGlass", () => {
  it("knows the panes' blue from the hull's red, white, greys and near-black frames", () => {
    expect(isGlass([60, 120, 150])).toBe(true);
    expect(isGlass([90, 160, 200])).toBe(true);
    expect(isGlass([210, 40, 40])).toBe(false);
    expect(isGlass([240, 240, 240])).toBe(false);
    expect(isGlass([120, 120, 130])).toBe(false);
    expect(isGlass([20, 30, 60])).toBe(false);
  });
});

/** A texture with glass on its left half and paint on its right. */
const halves: Paint = (u) => (u < 0.5 ? [60, 120, 150] : [210, 40, 40]);

describe("panesOf", () => {
  it("finds the triangles painted as glass under the middle of their UVs, wrapping UVs past the texture's edge", () => {
    const uvs = [0.1, 0.1, 0.3, 0.1, 0.2, 0.3, 0.7, 0.1, 0.9, 0.1, 0.8, 0.3, 1.1, 0.1, 1.3, 0.1, 1.2, 0.3];
    expect(panesOf(uvs, [0, 1, 2, 3, 4, 5, 6, 7, 8], halves)).toEqual([0, 2]);
  });

  it("reads a negative UV from the texture's far side", () => {
    const seen: number[] = [];
    const paint: Paint = (u, v) => {
      seen.push(u, v);
      return [60, 120, 150];
    };
    panesOf([-0.25, -0.5, -0.25, -0.5, -0.25, -0.5], [0, 1, 2], paint);
    expect(seen).toEqual([0.75, 0.5]);
  });
});

describe("cockpitOf", () => {
  it("seats the pilot beside their door window, halfway to the side, on the floor there", () => {
    const found = measured(cabin(PANES));
    if (!("cockpit" in found)) throw new Error(`missing ${found.missing}`);
    const { seat } = found.cockpit;
    // The hull's middle across is 0.1 and the door window's 1.1; its middle along is −0.8, where the floor is 0.5 up.
    expect(gap(seat, [0.6, 0.5 + COCKPIT.seatHeight, -0.8])).toBeLessThan(1e-9);
  });

  it("puts the pedals where the floor ahead has risen into the nose, either side of the seat's line, on the floor", () => {
    const found = measured(cabin(PANES));
    if (!("cockpit" in found)) throw new Error(`missing ${found.missing}`);
    const { left, right } = found.cockpit.pedals;
    // The floor has risen 0.1 m by z = −1.4.
    const half = COCKPIT.pedalApart / 2;
    expect(gap(left, [0.6 - half, floorAt(left[2]) + COCKPIT.pedalUp, -1.4])).toBeLessThan(COCKPIT.pedalStep);
    expect(gap(right, [0.6 + half, floorAt(right[2]) + COCKPIT.pedalUp, -1.4])).toBeLessThan(COCKPIT.pedalStep);
    expect(left[1]).toBeCloseTo(floorAt(left[2]) + COCKPIT.pedalUp, 9);
  });

  it("sets the cyclic between the knees and the collective beside the left hip, from the seat", () => {
    const found = measured(cabin(PANES));
    if (!("cockpit" in found)) throw new Error(`missing ${found.missing}`);
    const { seat, cyclic, collective } = found.cockpit;
    expect(gap(cyclic, [seat[0], seat[1] + COCKPIT.cyclicUp, seat[2] - COCKPIT.cyclicAhead])).toBeLessThan(1e-9);
    expect(
      gap(collective, [
        seat[0] - COCKPIT.collectiveIn,
        seat[1] + COCKPIT.collectiveUp,
        seat[2] - COCKPIT.collectiveAhead,
      ]),
    ).toBeLessThan(1e-9);
  });

  it("takes the frontmost door window, whichever pane comes first", () => {
    expect(measured(cabin([DOOR, REAR]))).toEqual(measured(cabin([REAR, DOOR])));
  });

  it("finds no door window without a tall side pane on the pilot's side", () => {
    expect(measured(cabin([WINDSCREEN, LEFT_DOOR, LOWER]))).toEqual({ missing: "door" });
  });

  it("takes a pane without area as facing nowhere", () => {
    const flat: Point[] = [
      [1.1, 1.2, -1],
      [1.1, 1.8, -1],
      [1.1, 1.8, -1],
      [1.1, 1.2, -1],
    ];
    expect(measured(cabin([flat]))).toEqual({ missing: "door" });
  });

  it("finds no floor beside a door window beyond the hull", () => {
    expect(measured(cabin([side(1.1, 1.2, 1.8, -5.2, -4.4)]))).toEqual({ missing: "floor" });
  });

  it("finds no pedals where the floor never rises before the hull ends", () => {
    expect(measured(cabin(PANES, () => 0.5))).toEqual({ missing: "pedals" });
  });

  it("finds no pedal where the floor under one side of them is gone", () => {
    // A floor and roof only along the seat's line, narrower than the pedals are apart; the hull's width set far behind.
    const made: Made = { positions: [], hull: [], glass: [] };
    for (let z = -3; z < 2; z += 0.25) {
      const [a, b] = [z, z + 0.25];
      quad(made, "hull", [0.55, floorAt(a), a], [0.65, floorAt(a), a], [0.65, floorAt(b), b], [0.55, floorAt(b), b]);
    }
    quad(made, "hull", [0.55, 2.2, -3], [0.65, 2.2, -3], [0.65, 2.2, 2], [0.55, 2.2, 2]);
    for (const x of [-0.9, 1.05])
      quad(made, "hull", [x, 0.5, 1.9], [x + 0.05, 0.5, 1.9], [x + 0.05, 0.5, 2], [x, 0.5, 2]);
    quad(made, "glass", ...DOOR);
    expect(measured(made)).toEqual({ missing: "pedals" });
  });
});
