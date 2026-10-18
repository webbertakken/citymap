import { UNIT, type City, type Road } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { city } from "../components/testing/fixtures";
import { METRE, headingOf, longestStreet, onStreet, type Street } from "./street";

/** The fixture city with these roads in its one town. */
const withRoads = (roads: readonly Road[]): City => {
  const base = city("alpha");
  return { ...base, towns: [{ ...base.towns[0]!, roads }] };
};

const road = (cls: Road["cls"], ...pts: readonly (readonly [number, number])[]): Road => ({
  cls,
  pts: pts.map(([x, y]) => ({ x: x * UNIT, y: y * UNIT })),
});

describe("longestStreet", () => {
  it("joins pieces that meet end to end in one direction into one straight run", () => {
    const street = longestStreet(withRoads([road("street", [0, 0], [3, 0]), road("street", [3, 0], [8, 0])]));
    expect(street).toEqual({ start: { x: 0, z: -0 }, along: { x: 1, z: -0 }, length: 8, width: 1 });
  });

  it("breaks a run where the road turns, and keeps the longer leg", () => {
    const street = longestStreet(withRoads([road("street", [0, 0], [0, 7], [3, 7])]));
    expect(street?.length).toBe(7);
    // North in the plan is −z in the scene.
    expect(street?.along).toEqual({ x: 0, z: -1 });
  });

  it("walks the streets people use, never a lane or a highway", () => {
    const street = longestStreet(
      withRoads([road("lane", [0, 0], [50, 0]), road("highway", [0, 5], [60, 5]), road("collector", [0, 9], [4, 9])]),
    );
    expect(street?.length).toBe(4);
    expect(street?.width).toBe(1.5);
  });

  it("skips repeated points, and has nothing to offer without a street", () => {
    expect(longestStreet(withRoads([road("street", [0, 0], [0, 0], [2, 0])]))?.length).toBe(2);
    expect(longestStreet(withRoads([]))).toBeNull();
  });

  it("follows a gentle curve across west, and stops where it comes round to where it joined", () => {
    // A ring of 400 pieces turns less than the straight limit at each joint; a piece runs into it from outside.
    const ring = Array.from({ length: 401 }, (_unused, k): [number, number] => {
      const a = (k / 400) * 2 * Math.PI;
      return [Math.round(Math.sin(a) * 64_000) / UNIT, Math.round((1 - Math.cos(a)) * 64_000) / UNIT];
    });
    const street = longestStreet(withRoads([road("street", [-1, 0], [0, 0]), road("street", ...ring)]));
    // The run goes once round the ring and ends back where it joined it: one street width from its start.
    expect(street?.length).toBeCloseTo(1, 9);
    expect(street?.start).toEqual({ x: -1, z: -0 });
  });
});

describe("onStreet", () => {
  const east: Street = { start: { x: 1, z: 2 }, along: { x: 1, z: 0 }, length: 10, width: 1 };

  it("measures in metres along the street and to its left, ten metres to a street width", () => {
    expect(METRE).toBe(0.1);
    const p = onStreet(east, 20, 0);
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.z).toBeCloseTo(2, 9);
  });

  it("puts left to the north of a street running east, and right to the south", () => {
    expect(onStreet(east, 0, 5).z).toBeCloseTo(1.5, 9);
    expect(onStreet(east, 0, -5).z).toBeCloseTo(2.5, 9);
  });
});

describe("headingOf", () => {
  it("turns a model facing +x to face along the street", () => {
    const north: Street = { start: { x: 0, z: 0 }, along: { x: 0, z: -1 }, length: 1, width: 1 };
    const heading = headingOf(north);
    // A turn about y takes +x to (cos h, 0, −sin h).
    expect(Math.cos(heading)).toBeCloseTo(0, 9);
    expect(-Math.sin(heading)).toBeCloseTo(-1, 9);
  });
});
