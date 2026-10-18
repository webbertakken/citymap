import { GROUND, PERSON_RADIUS, cityWalls, type Footprint, type Vec3 } from "@citymap/world";
import { describe, expect, it } from "vitest";
import type { Landing } from "./landing";
import {
  BUMP,
  PARKING,
  REACH,
  VEHICLES,
  alightFrom,
  clearOfVehicles,
  distanceTo,
  parkedBy,
  reachable,
  stepVehicle,
  type Vehicle,
} from "./vehicles";
import { NO_INTENTS, facing } from "./walker";

const open = cityWalls([]);
const at = (x: number, z: number): Vec3 => ({ x, y: GROUND, z });
const car = (x = 0, z = 0, heading = 0, speed = 0): Vehicle => ({
  id: "car",
  kind: "car",
  feet: at(x, z),
  heading,
  speed,
  steer: 0,
});
const box = (x: number, z: number, w: number, d: number): Footprint => ({
  lot: 0,
  corners: [
    { x, z },
    { x: x + w, z },
    { x: x + w, z: z + d },
    { x, z: z + d },
  ],
  top: 10,
});
/** Steps a vehicle `n` times of a 120th of a second. */
const ride = (vehicle: Vehicle, intents = NO_INTENTS, n = 120, walls = open) => {
  let v = vehicle;
  for (let i = 0; i < n; i++) v = stepVehicle(v, intents, 1 / 120, walls);
  return v;
};

// A landing on a street running east (scene units: 1 is 10 m, a street 1 wide), at the origin.
const landing: Landing = {
  at: { x: 0, z: 0 },
  heading: 0,
  kind: "road",
  road: { at: { x: 0, z: 0 }, along: { x: 1, z: 0 }, width: 1 },
};

describe("parkedBy", () => {
  it("parks a bicycle and a car at the kerb on the right of the road, ahead, facing along it", () => {
    const [bicycle, motor] = parkedBy(landing, open);
    expect(bicycle).toMatchObject({ kind: "bicycle", speed: 0, steer: 0, heading: 0 });
    expect(bicycle!.feet.x).toBeCloseTo(PARKING.bicycle.ahead, 9);
    // Right of a road running east is south: +z, half the 10 m street less the inset.
    expect(bicycle!.feet.z).toBeCloseTo(5 - PARKING.bicycle.inset, 9);
    expect(motor!.feet.x).toBeCloseTo(PARKING.car.ahead, 9);
    expect(motor!.feet.z).toBeCloseTo(5 - PARKING.car.inset, 9);
  });

  it("keeps a parked vehicle clear of a building at the kerb", () => {
    const walls = cityWalls([box(5, 2, 10, 10)]);
    const [, motor] = parkedBy(landing, walls);
    expect(motor!.feet.z).toBeCloseTo(2 - VEHICLES.car.radius, 9);
  });

  it("parks in the road's middle when the road is too narrow for the kerb", () => {
    const lane: Landing = { ...landing, road: { ...landing.road, width: 0.1 } };
    expect(parkedBy(lane, open)[1]!.feet.z).toBe(0);
  });
});

describe("distanceTo and reachable", () => {
  it("measures to the vehicle's outline, along and across it, turned with it", () => {
    const { length, width } = VEHICLES.car;
    expect(distanceTo(at(length / 2 + 1, 0), car())).toBeCloseTo(1, 9);
    expect(distanceTo(at(0, width / 2 + 0.5), car())).toBeCloseTo(0.5, 9);
    expect(distanceTo(at(0, 0), car())).toBe(0);
    // Turned a quarter, the car's length runs north–south.
    expect(distanceTo(at(0, -(length / 2 + 1)), car(0, 0, Math.PI / 2))).toBeCloseTo(1, 9);
  });

  it("finds the nearest vehicle within reach, or none", () => {
    const near = car(0, 0);
    const nearer = { ...car(0, 3), id: "other" };
    // 0.7 m from the first, 0.5 m from the other: both within reach, the other nearer, in either order.
    expect(reachable(at(0, 1.6), [near, nearer])?.id).toBe("other");
    expect(reachable(at(0, 1.6), [nearer, near])?.id).toBe("other");
    expect(reachable(at(0, 0.9 + REACH + 0.1), [near])).toBeNull();
    expect(reachable(at(0, 50), [])).toBeNull();
  });
});

describe("stepVehicle", () => {
  it("speeds up under throttle to its top speed, and no faster", () => {
    const moving = ride(car(), { ...NO_INTENTS, forward: 1 });
    expect(moving.speed).toBeCloseTo(VEHICLES.car.accelerate, 6);
    expect(moving.feet.x).toBeGreaterThan(1.5);
    expect(ride(car(0, 0, 0, 24.9), { ...NO_INTENTS, forward: 1 }).speed).toBe(VEHICLES.car.topSpeed);
  });

  it("brakes with back, reverses once stopped, and no faster than its reverse", () => {
    expect(ride(car(0, 0, 0, 5), { ...NO_INTENTS, forward: -1 }, 30).speed).toBeCloseTo(5 - VEHICLES.car.brake / 4, 6);
    const reversing = ride(car(), { ...NO_INTENTS, forward: -1 }, 1200);
    expect(reversing.speed).toBe(-VEHICLES.car.reverseSpeed);
    expect(reversing.feet.x).toBeLessThan(0);
    // Forward while reversing brakes first.
    expect(ride(car(0, 0, 0, -3), { ...NO_INTENTS, forward: 1 }, 12).speed).toBeCloseTo(
      -3 + VEHICLES.car.brake / 10,
      6,
    );
  });

  it("stops hard with the brake and coasts slowly to a stop without it", () => {
    expect(ride(car(0, 0, 0, 5), { ...NO_INTENTS, jump: true }, 240).speed).toBe(0);
    expect(ride(car(0, 0, 0, 5)).speed).toBeCloseTo(5 - VEHICLES.car.coast, 6);
    expect(ride(car(0, 0, 0, -0.1)).speed).toBe(0);
  });

  it("turns right for right, round its rear axle, and steers more gently at speed", () => {
    const slow = ride(car(0, 0, 0, 3), { ...NO_INTENTS, forward: 0.2, right: 1 });
    expect(slow.heading).toBeLessThan(0);
    expect(slow.steer).toBeLessThan(0);
    const aimAt = (speed: number) => ride(car(0, 0, 0, speed), { ...NO_INTENTS, right: 1 }, 600).steer;
    expect(Math.abs(aimAt(20))).toBeLessThan(Math.abs(aimAt(2)));
    // Let go, and the wheel comes back straight.
    expect(ride(slow, NO_INTENTS).steer).toBe(0);
  });

  it("bumps off a wall, keeping a little of its speed", () => {
    const walls = cityWalls([box(3, -10, 5, 20)]);
    let v = car(0, 0, 0, 10);
    let bumped = false;
    for (let i = 0; i < 120 && !bumped; i++) {
      const next = stepVehicle(v, NO_INTENTS, 1 / 120, walls);
      bumped = next.speed < v.speed * BUMP + 1e-9;
      v = next;
    }
    expect(bumped).toBe(true);
    expect(v.feet.x).toBeLessThanOrEqual(3 - VEHICLES.car.radius + 1e-6);
  });

  it("stands still at no speed, with nothing to bump", () => {
    expect(stepVehicle(car(), NO_INTENTS, 1 / 120, open)).toEqual(car());
  });
});

describe("alightFrom", () => {
  it("steps down on the vehicle's left", () => {
    const where = alightFrom(car(), open);
    const out = VEHICLES.car.width / 2 + PERSON_RADIUS + 0.2;
    // Facing east, the left is north: −z.
    expect(where.z).toBeCloseTo(-out, 9);
    expect(facing(0).x).toBe(1);
  });

  it("steps down on the right where the left is walled, and as far as it can where both are", () => {
    const leftWall = cityWalls([box(-5, -3, 10, 1.5)]);
    expect(alightFrom(car(), leftWall).z).toBeGreaterThan(0);
    // Walled both sides, the left a little further off: as far out as it goes, on the left.
    const narrow = cityWalls([box(-5, -2.05, 10, 1), box(-5, 0.85, 10, 1)]);
    const squeezed = alightFrom(car(), narrow);
    expect(squeezed.z).toBeCloseTo(-1.05 + PERSON_RADIUS, 9);
  });
});

describe("clearOfVehicles", () => {
  const r = PERSON_RADIUS;
  const { length, width } = VEHICLES.car;

  it("leaves feet clear of every vehicle where they are", () => {
    expect(clearOfVehicles(at(0, 5), r, [car()], null)).toEqual({ feet: at(0, 5), hit: false });
  });

  it("pushes feet touching a vehicle's side or end out to a radius from it", () => {
    const side = clearOfVehicles(at(0, width / 2 + r / 2), r, [car()], null);
    expect(side.hit).toBe(true);
    expect(side.feet.z).toBeCloseTo(width / 2 + r, 9);
    const end = clearOfVehicles(at(-(length / 2 + r / 2), 0), r, [car()], null);
    expect(end.feet.x).toBeCloseTo(-(length / 2 + r), 9);
    // Off a corner, along the line from it.
    const corner = clearOfVehicles(at(length / 2 + 0.1, width / 2 + 0.1), r, [car()], null);
    expect(Math.hypot(corner.feet.x - length / 2, corner.feet.z - width / 2)).toBeCloseTo(r, 9);
  });

  it("pushes feet inside a vehicle out through its nearer side, turned with it", () => {
    const inside = clearOfVehicles(at(0, 0.5), r, [car()], null);
    expect(inside.feet.z).toBeCloseTo(width / 2 + r, 9);
    const nose = clearOfVehicles(at(length / 2 - 0.1, 0), r, [car()], null);
    expect(nose.feet.x).toBeCloseTo(length / 2 + r, 9);
    expect(clearOfVehicles(at(-length / 2 + 0.1, 0), r, [car()], null).feet.x).toBeCloseTo(-(length / 2 + r), 9);
    expect(clearOfVehicles(at(0, -0.5), r, [car()], null).feet.z).toBeCloseTo(-(width / 2 + r), 9);
    // Turned a quarter, its side faces east.
    const turned = clearOfVehicles(at(0.5, 0), r, [car(0, 0, Math.PI / 2)], null);
    expect(turned.feet.x).toBeCloseTo(width / 2 + r, 9);
    // Dead centre, out through a side.
    expect(clearOfVehicles(at(0, 0), r, [{ ...car(), kind: "bicycle" }], null).hit).toBe(true);
    expect(clearOfVehicles(at(0, 0), r, [car()], null).feet.z).toBeCloseTo(width / 2 + r, 9);
  });

  it("ignores the vehicle it is asked to", () => {
    expect(clearOfVehicles(at(0, 0), r, [car()], "car").hit).toBe(false);
  });
});
