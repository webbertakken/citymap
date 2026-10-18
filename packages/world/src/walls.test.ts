import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CELL, MAX_STEPS, cityHits, cityWalls } from "./walls";
import { GROUND, PERSON_RADIUS, SNAP_DOWN, STEP_UP, type Footprint, type Vec3 } from "./world";

/** A box building from (x, z) to (x + w, z + d), its corners either way round. */
const box = (lot: number, x: number, z: number, w: number, d: number, top: number, clockwise = false): Footprint => {
  const corners = [
    { x, z },
    { x: x + w, z },
    { x: x + w, z: z + d },
    { x, z: z + d },
  ];
  return { lot, corners: clockwise ? corners.toReversed() : corners, top };
};
const at = (x: number, z: number, y = GROUND): Vec3 => ({ x, y, z });
const flat = (x: number, z: number): Vec3 => ({ x, y: 0, z });
const r = PERSON_RADIUS;

describe("cityWalls: moving", () => {
  it("walks freely where nothing stands", () => {
    const walls = cityWalls([box(0, 50, 50, 10, 10, 10)]);
    expect(walls.move(at(0, 0), flat(1, 2))).toEqual({ feet: at(1, 2), grounded: true });
  });

  it("stops at a wall, a radius short of it, whichever way round its corners run", () => {
    for (const clockwise of [false, true]) {
      const walls = cityWalls([box(0, 10, -5, 10, 10, 10, clockwise)]);
      const { feet } = walls.move(at(0, 0), flat(20, 0));
      expect(feet.x).toBeCloseTo(10 - r, 9);
      expect(feet.z).toBeCloseTo(0, 9);
    }
  });

  it("slides along a wall when walking into it at a slant", () => {
    const walls = cityWalls([box(0, 10, -50, 10, 100, 10)]);
    const { feet } = walls.move(at(9, 0), flat(4, 3));
    expect(feet.x).toBeCloseTo(10 - r, 9);
    expect(feet.z).toBeCloseTo(3, 9);
  });

  it("never passes through a thin wall, however long the move", () => {
    const walls = cityWalls([box(0, 10, -50, 0.1, 100, 10)]);
    expect(walls.move(at(0, 0), flat(30, 0)).feet.x).toBeLessThan(10);
    // A move longer than its steps allow is taken in steps as long as needed.
    expect(walls.move(at(0, 0), flat(MAX_STEPS * r, 0)).feet.x).toBeLessThan(10);
  });

  it("is pushed out of a building it starts inside, by the nearest wall", () => {
    const walls = cityWalls([box(0, 0, 0, 10, 10, 10)]);
    const { feet } = walls.move(at(1, 5), flat(0, 0));
    expect(feet.x).toBeCloseTo(-r, 9);
    expect(feet.z).toBeCloseTo(5, 9);
  });

  it("steps up onto a low top and down off it again", () => {
    // Low enough to step up onto, and to step down from without a fall.
    const kerb = GROUND + Math.min(STEP_UP, SNAP_DOWN) - 0.05;
    const walls = cityWalls([box(0, 10, -5, 10, 10, kerb)]);
    const up = walls.move(at(5, 0), flat(10, 0));
    expect(up).toEqual({ feet: at(15, 0, kerb), grounded: true });
    const down = walls.move(up.feet, flat(10, 0));
    expect(down.feet.y).toBe(GROUND);
  });

  it("stands on a roof, and falls off its edge when the drop is more than a step", () => {
    const walls = cityWalls([box(0, 0, 0, 10, 10, 12)]);
    const roof = at(5, 5, 12);
    expect(walls.move(roof, { x: 1, y: -0.001, z: 0 })).toEqual({ feet: at(6, 5, 12), grounded: true });
    const off = walls.move(roof, { x: 6, y: -0.001, z: 0 });
    expect(off.grounded).toBe(false);
    expect(off.feet.y).toBeCloseTo(12 - 0.001, 9);
  });

  it("lands on the ground, keeps to it over a small drop, and leaves it rising", () => {
    const walls = cityWalls([]);
    expect(walls.move(at(0, 0, GROUND + 0.1), { x: 0, y: -1, z: 0 })).toEqual({ feet: at(0, 0), grounded: true });
    expect(walls.move(at(0, 0, GROUND + SNAP_DOWN / 2), { x: 0, y: -0.001, z: 0 }).grounded).toBe(true);
    expect(walls.move(at(0, 0, GROUND + 2 * SNAP_DOWN), { x: 0, y: -0.001, z: 0 }).grounded).toBe(false);
    expect(walls.move(at(0, 0), { x: 0, y: 0.05, z: 0 })).toEqual({ feet: at(0, 0, GROUND + 0.05), grounded: false });
  });

  it("walks between buildings in different cells, and finds a building spanning many", () => {
    const wide = box(0, -3 * CELL, 10, 6 * CELL, 5, 10);
    const walls = cityWalls([wide, box(1, 40, -5, 5, 5, 10)]);
    expect(walls.move(at(2 * CELL, 0), flat(0, 20)).feet.z).toBeCloseTo(10 - r, 9);
  });

  it("makes no wall of a footprint without area or height", () => {
    const line: Footprint = {
      lot: 0,
      corners: [
        { x: 5, z: -5 },
        { x: 5, z: 5 },
        { x: 5, z: 0 },
      ],
      top: 10,
    };
    const walls = cityWalls([line, box(1, 10, -5, 1, 10, 0)]);
    expect(walls.move(at(0, 0), flat(20, 0)).feet.x).toBe(20);
  });

  it("moves a wider mover by its own radius", () => {
    const walls = cityWalls([box(0, 10, -5, 10, 10, 10)]);
    expect(walls.move(at(0, 0), flat(20, 0), 1).feet.x).toBeCloseTo(9, 9);
    expect(walls.move(at(0, 0), flat(20, 0)).feet.x).toBeCloseTo(10 - r, 9);
  });

  it("never leaves a person inside a building, however they walk among many", () => {
    const blocks = Array.from({ length: 9 }, (_unused, i) => box(i, (i % 3) * 12, Math.floor(i / 3) * 12, 8, 8, 10));
    const walls = cityWalls(blocks);
    const inside = (p: Vec3) =>
      blocks.some((b) => {
        const [a, , c] = b.corners;
        // Deeper than a millimetre inside the radius of any building's plan.
        const dx = Math.max(a!.x - p.x, 0, p.x - c!.x);
        const dz = Math.max(a!.z - p.z, 0, p.z - c!.z);
        return Math.hypot(dx, dz) < r - 1e-3;
      });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true })), {
          maxLength: 60,
        }),
        (moves) => {
          // Starting in a street between the blocks.
          let feet = at(10, 10);
          for (const [dx, dz] of moves) {
            feet = walls.move(feet, flat(dx, dz)).feet;
            if (inside(feet)) return false;
          }
          return true;
        },
      ),
      { seed: 12, numRuns: 200 },
    );
  });
});

describe("cityWalls: clearance", () => {
  const walls = cityWalls([box(0, 10, -5, 10, 10, 6)]);

  it("runs clear to the end of a line that meets nothing", () => {
    expect(walls.clearance(at(0, 0, 1.5), at(-4, 0, 1.5))).toBeCloseTo(4, 9);
  });

  it("stops at a wall in the way", () => {
    expect(walls.clearance(at(0, 0, 1.5), at(20, 0, 1.5))).toBeCloseTo(10, 9);
  });

  it("passes over a roof and stops at one it meets on the way down", () => {
    expect(walls.clearance(at(0, 0, 8), at(30, 0, 8))).toBeCloseTo(30, 9);
    // Falling from 12 m at x 0 to 2 m at x 20: it meets the roof (6 m) at x 12.
    expect(walls.clearance(at(0, 0, 12), at(20, 0, 2))).toBeCloseTo(Math.hypot(12, 6), 9);
  });

  it("stops at the ground going down", () => {
    expect(walls.clearance(at(-10, 0, 5), at(-10, 0, -5))).toBeCloseTo(5 - GROUND, 9);
  });

  it("is nothing from inside a building, or for a line of no length", () => {
    expect(walls.clearance(at(15, 0, 2), at(0, 0, 2))).toBe(0);
    expect(walls.clearance(at(0, 0, 2), at(0, 0, 2))).toBe(0);
  });

  it("misses a building it runs beside, and one it passes under the roof of", () => {
    expect(walls.clearance(at(0, 10, 2), at(30, 10, 2))).toBeCloseTo(30, 9);
    expect(walls.clearance(at(15, -10, 2), at(15, -20, 2))).toBeCloseTo(10, 9);
    // Straight up from inside the plan, starting above the roof.
    expect(walls.clearance(at(15, 0, 7), at(15, 0, 20))).toBeCloseTo(13, 9);
  });
});

describe("cityWalls: dispose", () => {
  it("has nothing to free", () => {
    expect(() => cityWalls([]).dispose()).not.toThrow();
  });
});

describe("cityHits", () => {
  // A building 10 m to 20 m east, 5 m either side of z = 0, 12 m tall; its corners run west to east first.
  const hits = cityHits([box(7, 10, -5, 10, 10, 12)]);

  it("finds the wall a line meets, which of the footprint's walls it is, and where along and up it", () => {
    // From the west at 4 m up: the west wall, the footprint's fourth edge (corner 3 back to corner 0).
    const hit = hits.hit(at(0, 2, 4), at(30, 2, 4));
    expect(hit).toMatchObject({ lot: 7, face: { kind: "wall", edge: 3, length: 10 } });
    expect(hit?.at.x).toBeCloseTo(10, 9);
    expect(hit?.at.y).toBeCloseTo(4, 9);
    // The fourth edge runs from z = 5 back to z = −5: 3 m along at z = 2.
    expect(hit?.face.kind === "wall" && hit.face.along).toBeCloseTo(3, 9);
  });

  it("finds the roof a line comes down on", () => {
    const hit = hits.hit(at(15, 0, 30), at(15, 0, 0));
    expect(hit).toMatchObject({ lot: 7, face: { kind: "roof" } });
    expect(hit?.at.y).toBeCloseTo(12, 9);
  });

  it("finds nothing for a line that misses, or passes over", () => {
    expect(hits.hit(at(0, 20, 4), at(30, 20, 4))).toBeNull();
    expect(hits.hit(at(0, 0, 13), at(30, 0, 13))).toBeNull();
  });

  it("finds the nearer of two buildings in line", () => {
    const two = cityHits([box(1, 30, -5, 5, 10, 10), box(2, 10, -5, 5, 10, 10)]);
    expect(two.hit(at(0, 0, 3), at(50, 0, 3))?.lot).toBe(2);
  });

  it("measures along a wall from the footprint's first corner of it, whichever way the corners run", () => {
    const clockwise = cityHits([box(7, 10, -5, 10, 10, 12, true)]);
    const hit = clockwise.hit(at(0, 2, 4), at(30, 2, 4));
    // Reversed, the west wall is still the fourth edge, now from z = −5 to z = 5: 7 m along at z = 2.
    expect(hit?.face).toMatchObject({ kind: "wall", edge: 3 });
    expect(hit?.face.kind === "wall" && hit.face.along).toBeCloseTo(7, 9);
  });
});
