import { UNIT, type City, type Road } from "@citymap/ground-plan";
import type { Footprint } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { city } from "../components/testing/fixtures";
import {
  ROAD_CELL,
  SIGN_POOL,
  SIGN_REACH,
  middleOf,
  nearestLots,
  roadGrid,
  roadSegments,
  signName,
  wallFacing,
} from "./signs";

const square = (lot: number, x: number, z: number, size = 10): Footprint => ({
  lot,
  corners: [
    { x, z },
    { x: x + size, z },
    { x: x + size, z: z + size },
    { x, z: z + size },
  ],
  top: 8,
});

describe("roadSegments", () => {
  it("turns every road and highway into straight pieces in metres, z south", () => {
    const base = city("alpha");
    const street: Road = {
      cls: "street",
      pts: [
        { x: 0, y: 0 },
        { x: UNIT, y: UNIT },
        { x: 2 * UNIT, y: UNIT },
      ],
    };
    const highway: Road = {
      cls: "highway",
      pts: [
        { x: 0, y: 0 },
        { x: 0, y: 3 * UNIT },
      ],
    };
    const withRoads: City = { ...base, highways: [highway], towns: [{ ...base.towns[0]!, roads: [street] }] };
    expect(roadSegments(withRoads)).toEqual([
      { ax: 0, az: -0, bx: 0, bz: -30 },
      { ax: 0, az: -0, bx: 10, bz: -10 },
      { ax: 10, az: -10, bx: 20, bz: -10 },
    ]);
  });
});

describe("roadGrid", () => {
  const grid = roadGrid([
    { ax: 0, az: 0, bx: 100, bz: 0 },
    { ax: 500, az: 500, bx: 500, bz: 500 },
  ]);

  it("finds the nearest point on a road", () => {
    expect(grid.nearest(30, 7)).toEqual({ x: 30, z: 0 });
    // Past its end, the end.
    expect(grid.nearest(120, 3)).toEqual({ x: 100, z: 0 });
  });

  it("looks further out, ring by ring, and finds a road of one point", () => {
    expect(grid.nearest(500 + 2 * ROAD_CELL, 500, 400)).toEqual({ x: 500, z: 500 });
  });

  it("finds nothing beyond its reach", () => {
    expect(grid.nearest(300, 300, 50)).toBeNull();
  });
});

describe("wallFacing", () => {
  it("picks the wall whose face points at the street, wherever the street lies", () => {
    const building = square(0, 0, 0);
    // The street to the north (−z): the first edge, z = 0, faces −z.
    expect(wallFacing(building, { x: 5, z: -20 })).toEqual({ edge: 0, x: 5, z: 0, nx: 0, nz: -1, length: 10 });
    expect(wallFacing(building, { x: 30, z: 5 })).toMatchObject({ edge: 1, nx: 1, nz: 0 });
    // Corners the other way round, the same wall by its own number.
    const reversed = { ...building, corners: building.corners.toReversed() };
    expect(wallFacing(reversed, { x: 5, z: -20 })).toMatchObject({ nx: 0, nz: -1, z: 0 });
  });

  it("passes over a wall of no length, and faces outwards from a point inside", () => {
    const repeated = { ...square(0, 0, 0), corners: [{ x: 0, z: 0 }, ...square(0, 0, 0).corners] };
    expect(wallFacing(repeated, { x: 5, z: -20 }).length).toBe(10);
    expect(wallFacing(square(0, 0, 0), middleOf(square(0, 0, 0))).length).toBe(10);
    // A street point right on a wall's middle: that wall scores nothing, and another faces it no better.
    expect(wallFacing(square(0, 0, 0), { x: 5, z: 0 }).length).toBe(10);
  });
});

describe("nearestLots", () => {
  it("signs the nearest buildings within reach, nearest first, at most a pool of them", () => {
    const row = Array.from({ length: 40 }, (_unused, i) => square(i, i * 12, 0));
    const lots = nearestLots(row, { x: 0, z: 5 });
    expect(lots).toHaveLength(Math.min(SIGN_POOL, Math.floor((SIGN_REACH - 5) / 12) + 1));
    expect(lots.slice(0, 3)).toEqual([0, 1, 2]);
    expect(nearestLots(row, { x: 0, z: 5 }, 3)).toEqual([0, 1, 2]);
    expect(nearestLots(row, { x: 2000, z: 0 })).toEqual([]);
  });

  it("passes over footprints of no area", () => {
    expect(nearestLots([{ lot: 0, corners: [{ x: 0, z: 0 }], top: 1 }], { x: 0, z: 0 })).toEqual([]);
  });
});

describe("signName", () => {
  it("names a building by its file, and counts the files that share it", () => {
    expect(signName(["src/a.ts"])).toBe("a.ts");
    expect(signName(["src/a.ts", "src/b.ts", "src/c.ts"])).toBe("a.ts +2");
    expect(signName(["README"])).toBe("README");
    expect(signName([])).toBe("");
  });
});
