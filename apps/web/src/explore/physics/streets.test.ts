import type { Footprint } from "@citymap/world";
import { describe, expect, it } from "vitest";
import {
  LOOK_AHEAD,
  REBASE,
  STREETS_KEEP,
  STREETS_REACH,
  aheadOf,
  gapTo,
  nearbyLots,
  planStreets,
  rebased,
  standingOf,
  streetGrid,
} from "./streets";

/** A square building `size` metres across, its middle at (x, z). */
const square = (lot: number, x: number, z: number, size = 10, top = 10): Footprint => ({
  lot,
  corners: [
    { x: x - size / 2, z: z - size / 2 },
    { x: x + size / 2, z: z - size / 2 },
    { x: x + size / 2, z: z + size / 2 },
    { x: x - size / 2, z: z + size / 2 },
  ],
  top,
});

describe("a building in the window", () => {
  it("stands as a circle round its middle through its furthest corner", () => {
    const building = standingOf(square(3, 100, -40, 10));
    expect(building).toEqual({ lot: 3, middle: { x: 100, z: -40 }, radius: Math.hypot(5, 5) });
    expect(gapTo(building, { x: 100, z: -40 })).toBe(0);
    expect(gapTo(building, { x: 120, z: -40 })).toBeCloseTo(20 - Math.hypot(5, 5), 9);
  });

  it("leaves out a building that cannot stand", () => {
    const grid = streetGrid([square(0, 0, 0), square(1, 20, 0, 10, 0), { lot: 2, corners: [], top: 5 }]);
    expect([...grid.standing.keys()]).toEqual([0]);
  });
});

describe("the nearby buildings", () => {
  // A street of buildings every 30 m along x, from −600 to 600 m.
  const street = Array.from({ length: 41 }, (_, i) => square(i, -600 + i * 30, 0));
  const grid = streetGrid(street);

  it("are those within reach of a point, nearest first", () => {
    const lots = nearbyLots(grid, { x: 0, z: 0 }, STREETS_REACH);
    const middles = lots.map((lot) => grid.standing.get(lot)!.middle.x);
    expect(middles[0]).toBe(0);
    expect(middles.every((x, i) => i === 0 || Math.abs(x) >= Math.abs(middles[i - 1]!))).toBe(true);
    expect(Math.max(...middles.map(Math.abs))).toBeLessThanOrEqual(STREETS_REACH + 10);
    expect(lots.length).toBe(11);
  });

  it("break ties by lot, so the order is the same on every device", () => {
    const lots = nearbyLots(grid, { x: 15, z: 0 }, 20);
    expect(lots).toEqual([20, 21]);
  });

  it("are found across cells, far from the city's middle and below zero", () => {
    const far = streetGrid([square(7, -50_000, -50_000)]);
    expect(nearbyLots(far, { x: -50_030, z: -50_000 }, 40)).toEqual([7]);
  });
});

describe("the window's plan", () => {
  const grid = streetGrid(Array.from({ length: 41 }, (_, i) => square(i, -600 + i * 30, 0)));

  it("raises what is in reach and not yet raised, and lowers what is left behind", () => {
    const raised = new Set([20, 0]);
    const plan = planStreets(grid, raised, { x: 0, z: 0 });
    expect(plan.raise).not.toContain(20);
    expect(plan.raise[0]).toBe(19);
    expect(plan.lower).toEqual([0]);
  });

  it("keeps a raised building between the reach and the keeping distance", () => {
    // Lot 26 stands at 180 m: beyond the reach, short of the keeping distance.
    const plan = planStreets(grid, new Set([26]), { x: 0, z: 0 });
    expect(gapTo(grid.standing.get(26)!, { x: 0, z: 0 })).toBeGreaterThan(STREETS_REACH);
    expect(gapTo(grid.standing.get(26)!, { x: 0, z: 0 })).toBeLessThan(STREETS_KEEP);
    expect(plan.lower).toEqual([]);
  });

  it("lowers a raised lot the grid does not know", () => {
    expect(planStreets(grid, new Set([999]), { x: 0, z: 0 }).lower).toEqual([999]);
  });
});

describe("where the player will be, and the frame round it", () => {
  it("looks ahead along the way it moves", () => {
    expect(aheadOf({ x: 10, z: 5 }, { x: 20, z: -4 })).toEqual({ x: 10 + 20 * LOOK_AHEAD, z: 5 - 4 * LOOK_AHEAD });
  });

  it("re-centres the frame once the player has gone far from its origin, to the metre", () => {
    expect(rebased({ x: 0, z: 0 }, { x: REBASE - 1, z: 0 })).toBeNull();
    expect(rebased({ x: 0, z: 0 }, { x: REBASE + 0.6, z: -3.2 })).toEqual({ x: REBASE + 1, z: -3 });
  });
});
