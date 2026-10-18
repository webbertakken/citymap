import { UNIT, type City, type Road } from "@citymap/ground-plan";
import { GROUND, cityWalls, type Footprint } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { city } from "../components/testing/fixtures";
import { ROTOR_RADIUS } from "./helicopter";
import type { Landing } from "./landing";
import {
  BICYCLE_SHARE,
  CAR_SHARE,
  MOTORBIKE_SHARE,
  PICKUP_SHARE,
  kindAt,
  JUNCTION_GAP,
  LANDING_CLEAR,
  PARKED_MOST,
  PLACE_GAP,
  HELIPAD_FROM,
  HELIPAD_MARGIN,
  helipadBy,
  parkedIn,
  placeHash,
} from "./parking";
import { PARKING, VEHICLES, distanceTo, standing } from "./vehicles";

const open = cityWalls([]);
/** A road through plan points given in street widths (10 m each). */
const road = (cls: Road["cls"], ...pts: readonly (readonly [number, number])[]): Road => ({
  cls,
  pts: pts.map(([x, y]) => ({ x: x * UNIT, y: y * UNIT })),
});
const withRoads = (roads: readonly Road[], highways: readonly Road[] = []): City => {
  const base = city("alpha");
  return { ...base, highways, towns: [{ ...base.towns[0]!, roads }] };
};
/** Landed far from everything, or at a point (scene units). */
const landingAt = (x: number, z: number): Landing => ({
  at: { x, z },
  heading: 0,
  kind: "road",
  road: { at: { x, z }, along: { x: 1, z: 0 }, width: 1 },
});
const away = landingAt(-1000, 0);
// A street running east along the plan's y = 0 (the scene's z = 0), 200 m long.
const street = withRoads([road("street", [0, 0], [20, 0])]);

describe("placeHash", () => {
  it("spreads a road's places evenly over [0, 1), the same every time", () => {
    const values = Array.from({ length: 2000 }, (_, k) => placeHash(k % 7, k));
    expect(values.every((u) => u >= 0 && u < 1)).toBe(true);
    expect(values.reduce((a, b) => a + b, 0) / values.length).toBeCloseTo(0.5, 1);
    expect(new Set(values).size).toBe(values.length);
    expect(placeHash(3, 4)).toBe(placeHash(3, 4));
  });
});

describe("parkedIn", () => {
  it("fills kerb places along a street as the plan's hash says, alternating sides, facing the traffic's way", () => {
    const parked = parkedIn(street, away, open);
    expect(parked).toEqual(parkedIn(street, away, open));
    expect(parked.length).toBeGreaterThan(0);
    for (const vehicle of parked) {
      const k = Number(/^parked-0-(\d+)$/.exec(vehicle.id)![1]);
      const u = placeHash(0, k);
      expect(vehicle.kind).toBe(kindAt(u));
      expect(u).toBeLessThan(BICYCLE_SHARE + CAR_SHARE + MOTORBIKE_SHARE);
      expect(vehicle.feet.x).toBeCloseTo((k + 0.5) * PLACE_GAP, 9);
      // A street is 10 m wide: the kerb is 5 m out, the vehicle its inset in from it; right of east is +z.
      const out = 5 - PARKING[kindAt(u)!].inset;
      expect(vehicle.feet.z).toBeCloseTo(k % 2 === 0 ? out : -out, 9);
      expect(Math.cos(vehicle.heading)).toBeCloseTo(k % 2 === 0 ? 1 : -1, 9);
      expect(vehicle.speed).toBe(0);
    }
  });

  it("parks bicycles, cars and motorbikes in about the shares asked, over a long street", () => {
    const long = parkedIn(withRoads([road("avenue", [0, 0], [400, 0])]), away, open);
    const share = (kind: string) => long.filter((v) => v.kind === kind).length / Math.floor(4000 / PLACE_GAP);
    expect(share("bicycle")).toBeCloseTo(BICYCLE_SHARE, 1);
    expect(share("car")).toBeCloseTo(CAR_SHARE, 1);
    expect(share("motorbike")).toBeCloseTo(MOTORBIKE_SHARE, 1);
    // Cars are saloons and pickups, about a third of them pickups.
    const cars = long.filter((v) => v.kind === "car");
    const pickups = cars.filter((v) => v.kind === "car" && v.body === "pickup").length / cars.length;
    expect(pickups).toBeGreaterThan(PICKUP_SHARE - 0.15);
    expect(pickups).toBeLessThan(PICKUP_SHARE + 0.15);
  });

  it("never parks in a junction, nor along lanes and highways", () => {
    // A lane ends on the street at 100 m; a highway runs beside it.
    const crossed = withRoads(
      [road("street", [0, 0], [20, 0]), road("lane", [10, 0], [10, 10])],
      [road("street", [0, 5], [20, 5])],
    );
    const parked = parkedIn(crossed, away, open);
    expect(parked.every((v) => v.id.startsWith("parked-0-"))).toBe(true);
    const ends = [0, 100, 200];
    for (const vehicle of parked)
      for (const end of ends) expect(Math.abs(vehicle.feet.x - end)).toBeGreaterThan(JUNCTION_GAP);
    expect(parkedIn(withRoads([road("lane", [0, 0], [20, 0])]), away, open)).toEqual([]);
  });

  it("keeps clear of the landing, and only the nearest few hundred to it, nearest first", () => {
    const long = withRoads([road("street", [0, 0], [2000, 0])]);
    // Landed 960 m along, halfway between two places: places pair off at equal distances, settled by their ids.
    const parked = parkedIn(long, landingAt(96, 0), open);
    expect(parked).toHaveLength(PARKED_MOST);
    const distances = parked.map((v) => Math.abs(v.feet.x - 960));
    expect(Math.min(...distances)).toBeGreaterThan(LANDING_CLEAR);
    expect(distances).toEqual(distances.toSorted((a, b) => a - b));
  });

  it("moves a parked vehicle out of the road's middle only as far as a building at the kerb lets it", () => {
    const wall: Footprint = {
      lot: 0,
      corners: [
        { x: 0, z: 3 },
        { x: 200, z: 3 },
        { x: 200, z: 20 },
        { x: 0, z: 20 },
      ],
      top: 10,
    };
    const parked = parkedIn(street, away, cityWalls([wall]));
    for (const vehicle of parked.filter((v) => v.feet.z > 0))
      expect(vehicle.feet.z).toBeCloseTo(3 - VEHICLES[vehicle.kind].radius, 9);
  });

  it("parks nothing in a city without streets", () => {
    expect(parkedIn(withRoads([]), away, open)).toEqual([]);
    // A road of no points or one, or none long enough for a place.
    expect(parkedIn(withRoads([road("street"), road("street", [0, 0])]), away, open)).toEqual([]);
  });
});

/** A building from (x0, z0) to (x1, z1), metres. */
const block = (x0: number, z0: number, x1: number, z1: number, top = 10): Footprint => ({
  lot: 0,
  corners: [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ],
  top,
});
// Landed on a road through the origin running east (scene units: a tenth of a metre's tenfold).
const landed = landingAt(0, 0);
/** Whether the rotor's circle about a point is clear of every building, as the walls say. */
const clear = (walls: ReturnType<typeof cityWalls>, x: number, z: number) => {
  const spot = { x, y: GROUND, z };
  const moved = walls.move(spot, { x: 0, y: 0, z: 0 }, ROTOR_RADIUS + HELIPAD_MARGIN).feet;
  return moved.x === x && moved.z === z && moved.y === GROUND;
};

describe("helipadBy", () => {
  it("stands the helicopter on the landing's road ahead, facing along it, its rotor still", () => {
    const pad = helipadBy(landed, open, [])!;
    expect(pad.kind).toBe("helicopter");
    expect(pad.id).toBe("helicopter");
    expect(pad.feet).toEqual({ x: HELIPAD_FROM, y: GROUND, z: 0 });
    expect(Math.cos(pad.heading)).toBe(1);
    expect(pad.heli.rotor).toBe(0);
    expect(pad.heli.grounded).toBe(true);
  });

  it("goes on along the road until its rotor clears the buildings beside it", () => {
    const walls = cityWalls([block(20, 3, 60, 20)]);
    const pad = helipadBy(landed, walls, [])!;
    expect(pad.feet.x).toBeGreaterThanOrEqual(60 + ROTOR_RADIUS + HELIPAD_MARGIN);
    expect(clear(walls, pad.feet.x, pad.feet.z)).toBe(true);
    expect(pad.feet.x).toBeLessThan(60 + ROTOR_RADIUS + HELIPAD_MARGIN + 2.01);
  });

  it("stands clear of a vehicle parked in its way", () => {
    const parked = [standing("car", "car", { x: HELIPAD_FROM, y: GROUND, z: 0 }, 0)];
    const pad = helipadBy(landed, open, parked)!;
    expect(pad.feet.x).toBeGreaterThan(HELIPAD_FROM);
    expect(distanceTo(parked[0]!.feet, pad)).toBeGreaterThan(0);
    expect(distanceTo(pad.feet, parked[0]!)).toBeGreaterThan(VEHICLES.helicopter.width / 2);
  });

  it("stands behind the landing, facing away from it, when the way ahead is walled", () => {
    const walls = cityWalls([block(10, -50, 30, 50)]);
    const pad = helipadBy(landed, walls, [])!;
    expect(pad.feet.x).toBe(-HELIPAD_FROM);
    expect(Math.cos(pad.heading)).toBeCloseTo(-1, 12);
  });

  it("stands nowhere when no ground along the road is open enough", () => {
    expect(helipadBy(landed, cityWalls([block(-500, 2, 500, 50)]), [])).toBeNull();
  });
});
