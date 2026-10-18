import { GROUND, PERSON_RADIUS, cityWalls, type Footprint, type Vec3 } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { FALL_LEAN, HARD_HIT, START_GEAR, resting } from "./bicycle";
import type { Landing } from "./landing";
import { parkedMoto } from "./motorbike";
import {
  BUMP,
  CAR,
  MAX_STEER,
  PARKING,
  REACH,
  VEHICLES,
  alightFrom,
  bumped,
  clearOfVehicles,
  distanceTo,
  nearestOf,
  parkedBy,
  parkedNow,
  reachable,
  standing,
  stepVehicle,
  yawOf,
  arcadeOf,
  type Bicycle,
  type Car,
  type Motorbike,
  type Vehicle,
} from "./vehicles";
import { NO_INTENTS, facing } from "./walker";

/** The vehicle as a car, failing the test when it is not one. */
const asCar = (vehicle: Vehicle | null | undefined): Car => {
  if (vehicle?.kind !== "car") throw new Error(`expected a car, got ${vehicle?.kind ?? "nothing"}`);
  return vehicle;
};
/** The vehicle as a motorbike, failing the test when it is not one. */
const asMotorbike = (vehicle: Vehicle | null | undefined): Motorbike => {
  if (vehicle?.kind !== "motorbike") throw new Error(`expected a motorbike, got ${vehicle?.kind ?? "nothing"}`);
  return vehicle;
};

const open = cityWalls([]);
const at = (x: number, z: number): Vec3 => ({ x, y: GROUND, z });
const car = (x = 0, z = 0, heading = 0, speed = 0): Car => ({
  id: "car",
  kind: "car",
  feet: at(x, z),
  heading,
  speed,
  turn: 0,
  steer: 0,
  body: "saloon",
  attitude: yawOf(heading),
  gear: 0,
  rpm: 0,
});
const bike = (x = 0, z = 0, heading = 0, speed = 0): Bicycle => ({
  id: "bicycle",
  kind: "bicycle",
  feet: at(x, z),
  heading,
  speed,
  turn: 0,
  steer: 0,
  cycle: { ...resting(), footDown: speed < 1.2 },
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
/** The vehicle as a bicycle, failing the test when it is not one. */
const asBicycle = (vehicle: Vehicle | null | undefined): Bicycle => {
  if (vehicle?.kind !== "bicycle") throw new Error(`expected a bicycle, got ${vehicle?.kind ?? "nothing"}`);
  return vehicle;
};
/** Steps a vehicle `n` times of a 120th of a second. */
const ride = (vehicle: Vehicle, intents = NO_INTENTS, n = 120, walls = open): Vehicle => {
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
  it("parks a bicycle at the kerb on the right, ahead, facing along the road, and a car across the street", () => {
    const [bicycle, motor] = parkedBy(landing, open);
    expect(bicycle).toMatchObject({ kind: "bicycle", speed: 0, turn: 0, steer: 0, cycle: resting() });
    expect(Math.cos(bicycle!.heading)).toBeCloseTo(1, 9);
    expect(bicycle!.feet.x).toBeCloseTo(PARKING.bicycle.ahead, 9);
    // Right of a road running east is south: +z, half the 10 m street less the inset.
    expect(bicycle!.feet.z).toBeCloseTo(5 - PARKING.bicycle.inset, 9);
    expect(motor!.feet.x).toBeCloseTo(PARKING.car.ahead, 9);
    expect(motor!.feet.z).toBeCloseTo(-(5 - PARKING.car.inset), 9);
    expect(Math.cos(motor!.heading)).toBeCloseTo(-1, 9);
  });

  it("keeps a parked vehicle clear of a building at the kerb", () => {
    const walls = cityWalls([box(5, -12, 10, 10)]);
    const [, motor] = parkedBy(landing, walls);
    expect(motor!.feet.z).toBeCloseTo(-2 + VEHICLES.car.radius, 9);
  });

  it("parks a motorbike behind the landing at the near kerb, facing away", () => {
    const [, , motorbike] = parkedBy(landing, open);
    expect(motorbike).toMatchObject({ id: "motorbike", kind: "motorbike", speed: 0, moto: parkedMoto() });
    expect(motorbike!.feet.x).toBeCloseTo(PARKING.motorbike.ahead, 9);
    expect(motorbike!.feet.z).toBeCloseTo(5 - PARKING.motorbike.inset, 9);
    expect(Math.cos(motorbike!.heading)).toBeCloseTo(-1, 9);
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
  it("speeds up under throttle, strongly at first and tapering to its top speed, never past it", () => {
    const moving = ride(car(), { ...NO_INTENTS, forward: 1 });
    // A second from a standstill: nearly its full power all the way, as speed is still far from the top.
    expect(moving.speed).toBeGreaterThan(0.95 * CAR.accelerate);
    expect(moving.speed).toBeLessThan(CAR.accelerate);
    expect(moving.feet.x).toBeGreaterThan(3);
    const flatOut = ride(car(), { ...NO_INTENTS, forward: 1 }, 120 * 60);
    expect(flatOut.speed).toBeGreaterThan(0.95 * CAR.topSpeed);
    expect(flatOut.speed).toBeLessThanOrEqual(CAR.topSpeed);
    expect(stepVehicle(car(0, 0, 0, 40), { ...NO_INTENTS, forward: 1 }, 1 / 120, open).speed).toBe(CAR.topSpeed);
  });

  it("brakes with back, reverses once stopped, and no faster than its reverse", () => {
    expect(ride(car(0, 0, 0, 5), { ...NO_INTENTS, forward: -1 }, 30).speed).toBeCloseTo(5 - CAR.brake / 4, 6);
    const reversing = ride(car(), { ...NO_INTENTS, forward: -1 }, 1200);
    expect(reversing.speed).toBeLessThan(-0.9 * CAR.reverseSpeed);
    expect(reversing.speed).toBeGreaterThanOrEqual(-CAR.reverseSpeed);
    expect(reversing.feet.x).toBeLessThan(0);
    // Forward while reversing brakes first.
    expect(ride(car(0, 0, 0, -3), { ...NO_INTENTS, forward: 1 }, 12).speed).toBeCloseTo(-3 + CAR.brake / 10, 6);
  });

  it("stops hard with the brake and coasts slowly to a stop without it", () => {
    expect(ride(car(0, 0, 0, 5), { ...NO_INTENTS, jump: true }, 240).speed).toBe(0);
    expect(ride(car(0, 0, 0, 5)).speed).toBeCloseTo(5 - CAR.coast, 6);
    expect(ride(car(0, 0, 0, -0.1)).speed).toBe(0);
  });

  it("turns right for right, tight when slow and wide when fast, its wheel angle following", () => {
    const slow = ride(car(0, 0, 0, 3), { ...NO_INTENTS, forward: 0.2, right: 1 }, 60);
    expect(slow.heading).toBeLessThan(0);
    expect(slow.turn).toBeLessThan(0);
    expect(slow.steer).toBeLessThan(0);
    // Held a second: slow, the tightest radius limits the turn; fast, its fastest rate does.
    const held = (speed: number) => ride(car(0, 0, 0, speed), { ...NO_INTENTS, right: 1 });
    const slowly = held(2);
    expect(slowly.turn).toBeCloseTo(-slowly.speed / CAR.turnRadius, 9);
    expect(held(25).turn).toBeCloseTo(-CAR.turnRate, 9);
    expect(Math.abs(held(25).steer)).toBeLessThan(Math.abs(slowly.steer));
    // Let go, and it runs straight again, quickly.
    expect(ride(slow, NO_INTENTS, 30).turn).toBe(0);
  });

  it("turns the other way reversing, as a car does, and not at all standing still", () => {
    const back = ride(car(0, 0, 0, -3), { ...NO_INTENTS, right: 1, forward: -0.2 }, 30);
    expect(back.turn).toBeGreaterThan(0);
    expect(ride(car(), { ...NO_INTENTS, right: 1 }, 30)).toMatchObject({ turn: 0, steer: 0 });
  });

  it("holds its wheel angle to its limit", () => {
    const spun = stepVehicle({ ...car(0, 0, 0, 0.2), turn: 5 }, { ...NO_INTENTS, forward: 0.01 }, 1 / 120, open);
    expect(spun.steer).toBe(MAX_STEER);
  });

  it("bumps off a wall, keeping a little of its speed", () => {
    const walls = cityWalls([box(3, -10, 5, 20)]);
    let v: Vehicle = car(0, 0, 0, 10);
    let knocked = false;
    for (let i = 0; i < 120 && !knocked; i++) {
      const next = stepVehicle(v, NO_INTENTS, 1 / 120, walls);
      knocked = next.speed < v.speed * BUMP + 1e-9;
      v = next;
    }
    expect(knocked).toBe(true);
    expect(v.feet.x).toBeLessThanOrEqual(3 - VEHICLES.car.radius + 1e-6);
  });

  it("stands still at no speed, with nothing to bump", () => {
    expect(stepVehicle(car(), NO_INTENTS, 1 / 120, open)).toEqual(car());
  });
});

describe("stepVehicle on the bicycle", () => {
  it("rides on its own physics: pedalled, it gains speed and turns its crank; asked right, it leans and turns right", () => {
    const pedalled = asBicycle(ride(bike(), { ...NO_INTENTS, forward: 1 }, 240));
    expect(pedalled.speed).toBeGreaterThan(3);
    expect(pedalled.feet.x).toBeGreaterThan(2);
    expect(pedalled.cycle.crank).toBeGreaterThan(0);
    const turning = asBicycle(ride(pedalled, { ...NO_INTENTS, forward: 0.5, right: 1 }, 120));
    expect(turning.cycle.lean).toBeLessThan(0);
    expect(turning.turn).toBeLessThan(0);
    expect(turning.heading).toBeLessThan(0);
    // The fork shows the bicycle's own steer.
    expect(turning.steer).toBe(turning.cycle.steer);
  });

  it("throws its rider at a wall hit hard, and only bumps off it at a walk", () => {
    const walls = cityWalls([box(3, -10, 5, 20)]);
    const fast = asBicycle(ride(bike(0, 0, 0, HARD_HIT + 2), NO_INTENTS, 120, walls));
    expect(fast.cycle.fall?.cause).toBe("hit");
    const slow = asBicycle(ride(bike(1.5, 0, 0, 2), NO_INTENTS, 120, walls));
    expect(slow.cycle.fall).toBeNull();
    expect(slow.feet.x).toBeLessThanOrEqual(3 - VEHICLES.bicycle.radius + 1e-6);
  });
});

/** A motorbike standing at the origin facing east, rolling at a speed. */
const motorbike = (speed = 0): Motorbike => Object.assign(standing("moto", "motorbike", at(0, 0), 0), { speed });

describe("stepVehicle on the motorbike", () => {
  it("rides on its engine: throttled, it pulls away along its heading", () => {
    const away = asMotorbike(ride(motorbike(), { ...NO_INTENTS, forward: 1 }, 240));
    expect(away.speed).toBeGreaterThan(5);
    expect(away.feet.x).toBeGreaterThan(5);
    expect(away.steer).toBe(away.moto.steer);
  });

  it("throws its rider at a wall hit hard, and not again once down", () => {
    const hard = asMotorbike(bumped({ ...motorbike(HARD_HIT + 1), moto: { ...parkedMoto(), footDown: false } }));
    expect(hard.moto.fall).toMatchObject({ cause: "hit" });
    const again = asMotorbike(bumped({ ...hard, speed: HARD_HIT + 1 }));
    expect(again.moto.fall).toBe(hard.moto.fall);
    expect(asMotorbike(bumped(motorbike(1))).moto.fall).toBeNull();
  });

  it("stands parked on its foot in first when left", () => {
    const left = parkedNow({ ...motorbike(1), moto: { ...parkedMoto(), gear: 3, lean: 0.2 } });
    expect(left).toMatchObject({ speed: 0, moto: parkedMoto() });
  });
});

describe("an arcade car", () => {
  it("stays level on its heading as it turns", () => {
    const turned = asCar(ride(car(0, 0, 0, 8), { ...NO_INTENTS, forward: 1, right: 1 }, 60));
    expect(turned.attitude).toEqual(yawOf(turned.heading));
  });

  it("is made level, its engine unread, from a car Rapier left tipped", () => {
    const tipped: Car = { ...car(0, 0, 0.5), attitude: { x: 1, y: 0, z: 0, w: 0 }, gear: 3, rpm: 4000 };
    expect(arcadeOf(tipped)).toEqual({ ...tipped, attitude: yawOf(0.5), gear: 0, rpm: 0 });
  });
});

describe("bumped", () => {
  it("keeps a little of the speed, and throws a bicycle's rider when the knock is hard", () => {
    expect(bumped(car(0, 0, 0, 10)).speed).toBeCloseTo(10 * BUMP, 9);
    const hard = asBicycle(bumped(bike(0, 0, 0, HARD_HIT)));
    expect(hard.cycle.fall).toMatchObject({ cause: "hit", speed: HARD_HIT });
    expect(hard.speed).toBeCloseTo(HARD_HIT * BUMP, 9);
    expect(asBicycle(bumped(bike(0, 0, 0, HARD_HIT - 0.1))).cycle.fall).toBeNull();
    // Already down, a knock is only a knock.
    const down = {
      ...bike(0, 0, 0, 5),
      cycle: { ...resting(), fall: { time: 1, side: 1, cause: "grip", speed: 6 } },
    } as const;
    expect(asBicycle(bumped(down)).cycle.fall).toEqual(down.cycle.fall);
  });
});

describe("parkedNow", () => {
  it("stops a vehicle where it is, a bicycle upright on its stand with its gear and crank kept", () => {
    const moving = { ...bike(3, 4, 1, 5), turn: 0.4, steer: 0.2 };
    const rolled = { ...moving, cycle: { ...moving.cycle, lean: -0.3, gear: 5, crank: 7, fall: null } };
    expect(parkedNow(rolled)).toEqual({ ...rolled, speed: 0, turn: 0, steer: 0, cycle: resting(5, 7) });
    expect(parkedNow({ ...car(0, 0, 0, 2), turn: 0.1, steer: 0.1 })).toEqual(car());
    expect(resting().gear).toBe(START_GEAR);
    expect(FALL_LEAN).toBeGreaterThan(0);
  });
});

describe("nearestOf", () => {
  it("names the nearest few of each kind, and always the one ridden", () => {
    const vehicles: Vehicle[] = [
      { ...car(50, 0), id: "far car" },
      { ...car(5, 0), id: "near car" },
      { ...bike(9, 0), id: "near bike" },
      { ...bike(90, 0), id: "far bike" },
      { ...bike(30, 0), id: "middle bike" },
    ];
    expect(nearestOf(vehicles, { x: 0, z: 0 }, 1, null)).toEqual(["near car", "near bike"]);
    expect(nearestOf(vehicles, { x: 0, z: 0 }, 2, null)).toEqual(["near car", "far car", "near bike", "middle bike"]);
    expect(nearestOf(vehicles, { x: 0, z: 0 }, 1, "far bike")).toEqual(["far bike", "near car", "near bike"]);
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
    expect(clearOfVehicles(at(0, 0), r, [bike()], null).hit).toBe(true);
    expect(clearOfVehicles(at(0, 0), r, [car()], null).feet.z).toBeCloseTo(width / 2 + r, 9);
  });

  it("ignores the vehicle it is asked to", () => {
    expect(clearOfVehicles(at(0, 0), r, [car()], "car").hit).toBe(false);
  });
});
