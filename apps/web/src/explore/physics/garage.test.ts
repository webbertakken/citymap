import { GROUND, type Footprint } from "@citymap/world";
import { ColliderDesc } from "@dimforge/rapier3d-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Step } from "../../load/step";
import { standing, type Bicycle, type Car, type Vehicle } from "../vehicles";
import { NO_INTENTS, stepWalker, type Body, type Intents } from "../walker";
import {
  BRAKE,
  CAR_ENGINE,
  CAR_GEARBOX,
  CREEP,
  REVERSE_TOP,
  RIGHTING_AFTER,
  SLOW_WINDOW,
  STREETS_SLICE,
  headingOf,
  openGarage,
  pedalsOf,
  steerReach,
  tiltOf,
  tiltedBy,
  upOf,
  type Garage,
} from "./garage";
import { STREETS_KEEP, STREETS_REACH } from "./streets";

/** The vehicle as a car, failing the test when it is not one. */
const asCar = (vehicle: Vehicle | null | undefined): Car => {
  if (vehicle?.kind !== "car") throw new Error(`expected a car, got ${vehicle?.kind ?? "nothing"}`);
  return vehicle;
};

const DT = 1 / 120;
/** A square building `size` metres across and `top` high, its middle at (x, z). */
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
const car = (x = 0, z = 0, heading = 0, id = "car") => standing(id, "car", { x, y: GROUND, z }, heading);
const THROTTLE: Intents = { ...NO_INTENTS, forward: 1 };
const opened: Garage[] = [];
async function garageOf(footprints: readonly Footprint[], at = { x: 0, z: 0 }, extra = {}) {
  const garage = await openGarage(footprints, { at, ...extra });
  opened.push(garage);
  return garage;
}

/** Drives for `seconds`, the cars by `drivers` (each frame the window following the first vehicle). */
function drive(garage: Garage, start: readonly Vehicle[], seconds: number, drivers: (t: number) => Intents) {
  let vehicles = start;
  const path: (readonly Vehicle[])[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (i % 4 === 0) garage.follow(vehicles[0]!.feet, { x: 0, z: 0 }, vehicles, 50);
    vehicles = garage.drive(vehicles, new Map([[vehicles[0]!.id, drivers(i * DT)]]), DT);
    path.push(vehicles);
  }
  return path;
}
const first = (vehicles: readonly Vehicle[]) => asCar(vehicles[0]);
/** The vehicle as a bicycle, failing the test when it is not one. */
const asBicycle = (vehicle: Vehicle | null | undefined): Bicycle => {
  if (vehicle?.kind !== "bicycle") throw new Error(`expected a bicycle, got ${vehicle?.kind ?? "nothing"}`);
  return vehicle;
};
/** Drives on full throttle until the car goes `speed` (m/s): the vehicles then. */
function upTo(garage: Garage, speed: number) {
  let vehicles: readonly Vehicle[] = [car()];
  for (let i = 0; first(vehicles).speed < speed && i < 2400; i++)
    vehicles = drive(garage, vehicles, DT, () => THROTTLE).at(-1)!;
  expect(first(vehicles).speed).toBeGreaterThanOrEqual(speed);
  return vehicles;
}

afterEach(() => {
  for (const garage of opened.splice(0)) garage.dispose();
  vi.restoreAllMocks();
});

describe("the nearby streets", () => {
  it("raises the streets round the landing behind the card, counted, and says so", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const steps: Step[] = [];
    // A row of buildings every 20 m: those within reach of the landing are raised, the rest wait.
    const row = Array.from({ length: 60 }, (_, i) => square(i, 20 + i * 20, 30));
    const garage = await garageOf(row, { x: 0, z: 0 }, { onStep: (step: Step) => steps.push(step) });
    const within = row.filter((f) => Math.hypot(f.corners[0]!.x, 30) < STREETS_REACH + 20).length;
    expect(steps.at(-1)).toMatchObject({ phase: "streets", done: steps.at(-1)!.of });
    expect(info.mock.calls.some(([line]) => String(line).startsWith("explore/streets buildings="))).toBe(true);
    const { standing: count } = garage.follow({ x: 0, y: GROUND, z: 0 }, { x: 0, z: 0 }, [], 0);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(within);
  });

  it("raises a building Rapier can make no hull of as nothing, once, and says so", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const hull = vi.spyOn(ColliderDesc, "convexHull").mockReturnValue(null);
    const garage = await garageOf([square(4, 20, 0)]);
    expect(hull).toHaveBeenCalledOnce();
    expect(info.mock.calls.filter(([line]) => String(line) === "explore/no-hull lot=4")).toHaveLength(1);
    expect(garage.follow({ x: 0, y: GROUND, z: 0 }, { x: 0, z: 0 }, [], 5).waiting).toBe(0);
    // Far away it is let go without a collider to free.
    garage.follow({ x: 5000, y: GROUND, z: 0 }, { x: 0, z: 0 }, [], 5);
  });

  it("counts the streets in slices on a large landing", async () => {
    const steps: Step[] = [];
    const grid = Array.from({ length: 900 }, (_, i) =>
      square(i, (i % 30) * 12 - 180, Math.floor(i / 30) * 12 - 180, 8),
    );
    await garageOf(grid, { x: 0, z: 0 }, { onStep: (step: Step) => steps.push(step) });
    const counted = steps.filter((s) => s.phase === "streets");
    expect(counted.length).toBeGreaterThan(2);
    expect(counted[1]!.done).toBe(STREETS_SLICE);
  });

  it("stops when the walk is cancelled, freeing what it made", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(openGarage([square(0, 20, 0)], { at: { x: 0, z: 0 }, signal: controller.signal })).rejects.toThrow(
      /abort/i,
    );
    const late = new AbortController();
    const cancelling = openGarage([square(0, 20, 0)], {
      at: { x: 0, z: 0 },
      signal: late.signal,
      onStep: (step) => {
        if (step.phase === "streets") late.abort();
      },
    });
    await expect(cancelling).rejects.toThrow(/abort/i);
  });

  it("raises ahead of the player within its budget, never waiting, and lowers what is left behind", async () => {
    let clock = 0;
    const row = Array.from({ length: 100 }, (_, i) => square(i, i * 20, 30));
    const garage = await garageOf(row, { x: 0, z: 0 }, { now: () => clock });
    // No time to spare: nothing more is raised this frame, and what waits is counted.
    const busy = garage.follow({ x: 1000, y: GROUND, z: 0 }, { x: 0, z: 0 }, [], 0);
    expect(busy.waiting).toBeGreaterThan(0);
    // The nearest of them: lot 50, its west wall 25 m from where the player stands.
    expect(busy.nearest).toBeCloseTo(Math.hypot(0, 30) - Math.hypot(5, 5), 6);
    // With time, the window is raised round where the player will be: ahead of it at its speed.
    const spare = vi.fn<() => number>(() => clock++);
    const roomy = await garageOf(row, { x: 0, z: 0 }, { now: spare });
    const ahead = roomy.follow({ x: 1000, y: GROUND, z: 0 }, { x: 100, z: 0 }, [], 1e9);
    expect(ahead.waiting).toBe(0);
    expect(ahead.nearest).toBe(Infinity);
    expect(ahead.standing).toBe(row.filter((f) => Math.abs(f.corners[0]!.x + 5 - 1150) <= STREETS_REACH + 8).length);
  });

  it("re-centres round the player as it goes, with every building where it was", async () => {
    // A wall across the way 600 m from the landing: the car is stopped by it, wherever the frame's origin is.
    const garage = await garageOf([square(0, 600, 0, 10, 10)], { x: 0, z: 0 });
    const path = drive(garage, [car(560, 0)], 4, () => THROTTLE);
    const end = first(path.at(-1)!);
    // Stopped short of its face (x = 595) by half its length, far past the first re-centring.
    expect(Math.max(...path.map((v) => first(v).feet.x))).toBeLessThan(595 - 2);
    expect(end.feet.x).toBeGreaterThan(580);
  });
});

/** A walker standing on the ground at (x, z). */
const standingAt = (x: number, z: number): Body => ({ feet: { x, y: GROUND, z }, rise: 0, heading: 0, grounded: true });
const RUN: Intents = { ...NO_INTENTS, forward: 1, run: true };

/** Walks for so many steps as the session does: the walker moved on the garage's walls, then the garage stepped. */
function walkOn(garage: Garage, from: Body, intents: Intents, steps: number, seen?: (body: Body) => void) {
  let body = from;
  for (let i = 0; i < steps; i++) {
    body = stepWalker(body, intents, 0, DT, garage.walls);
    garage.drive([], new Map(), DT, body.feet);
    seen?.(body);
  }
  return body;
}

describe("the walker on Rapier", () => {
  it("walks the walker on the ground, its feet exactly on it, and stops it at a building's wall", async () => {
    // A building whose west wall runs along x = 10 m.
    const garage = await garageOf([square(0, 15, 0)]);
    const heights = new Set<number>();
    const body = walkOn(garage, standingAt(0, 0), RUN, 480, (b) => heights.add(b.feet.y));
    expect(body.feet.x).toBeLessThan(10);
    expect(body.feet.x).toBeGreaterThan(9.5);
    expect([...heights]).toEqual([GROUND]);
    expect(body.grounded).toBe(true);
  });

  it("slides the walker along a wall it meets at an angle", async () => {
    // A long building whose west wall runs along x = 10 m, from z = −20 to 20.
    const garage = await garageOf([square(0, 30, 0, 40)]);
    // Half right of straight at the wall: it meets it at z = 10, then runs along it, south.
    const body = walkOn(garage, standingAt(0, 0), { ...RUN, right: 1 }, 720);
    expect(body.feet.x).toBeLessThan(10);
    expect(body.feet.x).toBeGreaterThan(9.5);
    expect(body.feet.z).toBeGreaterThan(15);
  });

  it("jumps the walker and brings it back down onto the ground", async () => {
    const garage = await garageOf([square(0, 40, 0)]);
    let highest = GROUND;
    const up = walkOn(garage, standingAt(0, 0), { ...NO_INTENTS, jump: true }, 1);
    const body = walkOn(garage, up, NO_INTENTS, 240, (b) => (highest = Math.max(highest, b.feet.y)));
    expect(highest).toBeGreaterThan(GROUND + 0.5);
    expect(body.feet.y).toBe(GROUND);
    expect(body.grounded).toBe(true);
  });

  it("steps the walker up onto a plinth and walks it off the far edge down to the street", async () => {
    // A low building, 0.4 m high: stepped up onto, as a kerb.
    const garage = await garageOf([square(0, 15, 0, 10, 0.4)]);
    const on = walkOn(garage, standingAt(5, 0), RUN, 240);
    expect(on.feet.y).toBeCloseTo(0.4, 1);
    expect(on.feet.x).toBeGreaterThan(11);
    const off = walkOn(garage, on, RUN, 480);
    expect(off.feet.x).toBeGreaterThan(21);
    expect(off.feet.y).toBe(GROUND);
  });

  it("walks through cars, parked two-wheelers and its own body: the session keeps it out of vehicles", async () => {
    const garage = await garageOf([square(0, 60, 0)]);
    const parked = [car(5, 0), standing("bike", "bicycle", { x: 8, y: GROUND, z: 0 }, 0)];
    garage.follow({ x: 0, y: GROUND, z: 0 }, { x: 0, z: 0 }, parked, 5);
    garage.drive(parked, new Map(), DT, { x: 0, y: GROUND, z: 0 });
    const moved = garage.walls.move({ x: 0, y: GROUND, z: 0 }, { x: 12, y: 0, z: 0 });
    expect(moved.feet.x).toBeCloseTo(12, 6);
  });

  it("keeps the walker out of a wall it presses against as the frame re-centres round it", async () => {
    // The landing 100 m off; the building's west wall along x = 295 from z = −5 to 5.
    const garage = await garageOf([square(0, 300, 0)], { x: 100, z: 0 });
    garage.follow({ x: 290, y: GROUND, z: 0 }, { x: 0, z: 0 }, [], 1000);
    const pressed = walkOn(garage, standingAt(290, 0), RUN, 240);
    expect(pressed.feet.x).toBeGreaterThan(294.5);
    // Far enough from the frame's middle that it moves: re-centred while the walker presses on.
    garage.follow({ x: 400, y: GROUND, z: 0 }, { x: 0, z: 0 }, [], 1000);
    const after = walkOn(garage, pressed, RUN, 240);
    expect(after.feet.x).toBeLessThan(295);
    expect(after.feet.x).toBeGreaterThan(294.5);
    expect(after.feet.y).toBe(GROUND);
  });

  it("sees the camera's line stop at a building, and at the ground going down", async () => {
    const garage = await garageOf([square(0, 15, 0)]);
    garage.drive([], new Map(), DT, null);
    expect(garage.walls.clearance({ x: 0, y: 1.5, z: 0 }, { x: 20, y: 1.5, z: 0 })).toBeCloseTo(10, 1);
    expect(garage.walls.clearance({ x: 0, y: 1.25, z: 0 }, { x: 0, y: -0.75, z: 0 })).toBeCloseTo(1, 6);
    expect(garage.walls.clearance({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
    // Its walls are the garage's: freeing them leaves the world to the garage.
    garage.walls.dispose();
    expect(garage.walls.clearance({ x: 0, y: 1.5, z: 0 }, { x: 20, y: 1.5, z: 0 })).toBeCloseTo(10, 1);
  });
});

describe("the car on Rapier", () => {
  it("pulls away along its heading, changing up through its gears, and stands level on its springs", async () => {
    const garage = await garageOf([]);
    const heading = 0.7;
    const path = drive(garage, [car(0, 0, heading)], 6, () => THROTTLE);
    const end = first(path.at(-1)!);
    expect(end.speed).toBeGreaterThan(25);
    expect(new Set(path.map((v) => first(v).gear)).size).toBeGreaterThanOrEqual(3);
    const moved = Math.atan2(-end.feet.z, end.feet.x);
    expect(moved).toBeCloseTo(heading, 2);
    expect(end.feet.y).toBeCloseTo(GROUND, 1);
    expect(upOf(end.attitude)).toBeGreaterThan(0.99);
    expect(end.rpm).toBeGreaterThan(CAR_ENGINE.idle);
  });

  it("brakes, then backs up in reverse no faster than its top", async () => {
    const garage = await garageOf([]);
    const away = drive(garage, [car()], 2, () => THROTTLE);
    const braking = drive(garage, away.at(-1)!, 8, () => ({ ...NO_INTENTS, forward: -1 }));
    const speeds = braking.map((v) => first(v).speed);
    const stopped = speeds.findIndex((s) => s < 0);
    expect(stopped).toBeGreaterThan(0);
    expect(first(braking.at(-1)!).gear).toBe(-1);
    expect(Math.min(...speeds)).toBeGreaterThan(-REVERSE_TOP - 1);
  });

  it("takes a ten-metre street's corner from 50 km/h on full lock, upright, and runs straight once let go", async () => {
    const garage = await garageOf([]);
    const away = upTo(garage, 14);
    const start = first(away);
    const turning = drive(garage, away, 1.3, () => ({ ...NO_INTENTS, right: 1 }));
    const quarter = turning.findIndex((v) => Math.abs(first(v).heading - start.heading) >= Math.PI / 2);
    // A quarter turn within 1.3 s, its corner cut no wider than a street and a pavement each way.
    expect(quarter).toBeGreaterThan(0);
    const at = first(turning[quarter]!).feet;
    expect(Math.hypot(at.x - start.feet.x, at.z - start.feet.z)).toBeLessThan(14);
    expect(Math.min(...turning.map((v) => upOf(first(v).attitude)))).toBeGreaterThan(0.95);
    const after = drive(garage, turning.at(-1)!, 0.6, () => NO_INTENTS);
    expect(Math.abs(first(after.at(-1)!).turn)).toBeLessThan(0.05);
  });

  it("still turns briskly at 100 km/h: a quarter turn within two and a half seconds", async () => {
    const garage = await garageOf([]);
    const away = upTo(garage, 28);
    const start = first(away);
    const turning = drive(garage, away, 2.5, () => ({ ...NO_INTENTS, right: 1 }));
    expect(Math.abs(first(turning.at(-1)!).heading - start.heading)).toBeGreaterThan(Math.PI / 2);
    expect(Math.min(...turning.map((v) => upOf(first(v).attitude)))).toBeGreaterThan(0.9);
  });

  it("slides its back out on the handbrake, turning hard", async () => {
    const garage = await garageOf([]);
    const away = drive(garage, [car()], 3, () => THROTTLE);
    const pulled = drive(garage, away.at(-1)!, 1.2, () => ({ ...NO_INTENTS, right: 1, jump: true }));
    const slip = Math.max(
      ...pulled.slice(1).map((v, i) => {
        const now = first(v);
        const was = first(pulled[i]!);
        const way = Math.atan2(-(now.feet.z - was.feet.z), now.feet.x - was.feet.x);
        return Math.abs(Math.atan2(Math.sin(now.heading - way), Math.cos(now.heading - way)));
      }),
    );
    expect(slip).toBeGreaterThan(0.3);
  });

  it("stops at a building and says it crashed", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const garage = await garageOf([square(0, 60, 0, 20, 10)]);
    const path = drive(garage, [car()], 6, () => THROTTLE);
    expect(Math.max(...path.map((v) => first(v).feet.x))).toBeLessThan(50);
    expect(info.mock.calls.some(([line]) => String(line).startsWith("explore/crash car=car lost="))).toBe(true);
  });

  it("is set back on its wheels after lying on its roof, nearly still", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const garage = await garageOf([]);
    const upturned: Car = {
      ...car(0, 0, 0.4),
      feet: { x: 0, y: GROUND + 1.6, z: 0 },
      attitude: { x: 1, y: 0, z: 0, w: 0 },
    };
    const path = drive(garage, [upturned], RIGHTING_AFTER + 3, () => NO_INTENTS);
    expect(upOf(first(path[60]!).attitude)).toBeLessThan(0);
    const end = first(path.at(-1)!);
    expect(upOf(end.attitude)).toBeGreaterThan(0.99);
    expect(info.mock.calls.some(([line]) => String(line) === "explore/righted car=car")).toBe(true);
  });

  it("pushes a parked car it hits, and leaves one it misses as it was", async () => {
    const garage = await garageOf([]);
    const hit = car(15, 0, Math.PI / 2, "hit");
    const missed = car(15, 40, 0, "missed");
    const path = drive(garage, [car(), hit, missed], 3, () => THROTTLE);
    const end = path.at(-1)!;
    expect(Math.hypot(end[1]!.feet.x - 15, end[1]!.feet.z)).toBeGreaterThan(0.5);
    expect(end[2]).toBe(missed);
  });

  it("shoves a parked bicycle it hits and knocks it over, hardly slowed", async () => {
    const garage = await garageOf([]);
    const bike = standing("bike", "bicycle", { x: 12, y: GROUND, z: 0 }, Math.PI / 2);
    const path = drive(garage, [car(), bike], 4, () => ({ ...NO_INTENTS, forward: 0.5 }));
    const hit = asBicycle(path.at(-1)![1]);
    expect(hit.feet.x).toBeGreaterThan(14);
    expect(Math.abs(hit.cycle.lean) + Math.abs(hit.cycle.pitch)).toBeGreaterThan(0.5);
    expect(Math.max(...path.map((v) => first(v).feet.x))).toBeGreaterThan(14);
  });

  it("shoves a parked motorbike less, it being heavier", async () => {
    const garage = await garageOf([]);
    const bike = standing("bike", "motorbike", { x: 12, y: GROUND, z: 0 }, Math.PI / 2);
    const path = drive(garage, [car(), bike], 4, () => ({ ...NO_INTENTS, forward: 0.5 }));
    const hit = path.at(-1)![1]!;
    expect(hit.feet.x).toBeGreaterThan(12.5);
    expect(hit.kind).toBe("motorbike");
  });

  it("leaves a two-wheeler it never touches standing where it was, asleep", async () => {
    const garage = await garageOf([]);
    const bike = standing("bike", "bicycle", { x: 12, y: GROUND, z: 30 }, 0);
    const path = drive(garage, [car(), bike], 2, () => THROTTLE);
    const still = asBicycle(path.at(-1)![1]);
    // It settles onto the ground within a centimetre or two, then sleeps: the same vehicle, step after step.
    expect(Math.hypot(still.feet.x - 12, still.feet.z - 30)).toBeLessThan(0.02);
    expect(Math.abs(still.cycle.lean)).toBeLessThan(0.01);
    expect(path.at(-2)![1]).toBe(still);
  });

  it("shoves a two-wheeler again when the player comes back to it", async () => {
    const garage = await garageOf([]);
    const bike = standing("bike", "motorbike", { x: 12, y: GROUND, z: 0 }, Math.PI / 2);
    garage.follow({ x: 0, y: GROUND, z: 0 }, { x: 0, z: 0 }, [car(), bike], 5);
    garage.follow({ x: 3000, y: GROUND, z: 0 }, { x: 0, z: 0 }, [car(3000, 0), bike], 5);
    const path = drive(garage, [car(), bike], 4, () => ({ ...NO_INTENTS, forward: 0.5 }));
    expect(path.at(-1)![1]!.feet.x).toBeGreaterThan(12.5);
  });

  it("lets the walker push a parked bicycle over, but never a car", async () => {
    const garage = await garageOf([]);
    const bike = standing("bike", "bicycle", { x: 2, y: GROUND, z: 0 }, Math.PI / 2);
    const parked = car(0, 3, 0, "parked");
    let vehicles: readonly Vehicle[] = [parked, bike];
    // Walking east at a run through where the bicycle stands, and on along the car's side.
    for (let i = 0; i < 240; i++) {
      const walker = { x: i * DT * 4, y: GROUND, z: 0.3 };
      if (i % 4 === 0) garage.follow(walker, { x: 4, z: 0 }, vehicles, 50);
      vehicles = garage.drive(vehicles, new Map(), DT, walker);
    }
    expect(vehicles[1]!.feet.x).toBeGreaterThan(2.5);
    expect(vehicles[0]).toBe(parked);
    // Without the walker, the bicycle settles where it was pushed.
    const settled = drive(garage, vehicles, 3, () => NO_INTENTS).at(-1)![1]!;
    expect(Math.abs(settled.feet.x - vehicles[1]!.feet.x)).toBeLessThan(1);
  });

  it("keeps the walker's body at its feet when the frame re-centres round it", async () => {
    const garage = await garageOf([]);
    // A bicycle 300 m on, past the first re-centring: the walker reaches it and still shoves it.
    const bike = standing("bike", "bicycle", { x: 300, y: GROUND, z: 0 }, Math.PI / 2);
    let vehicles: readonly Vehicle[] = [bike];
    // From 200 m (inside the first frame) to past the bicycle: the frame re-centres at 256 m, mid-walk.
    for (let x = 200; x < 302; x += DT * 20) {
      const walker = { x, y: GROUND, z: 0.3 };
      garage.follow(walker, { x: 4, z: 0 }, vehicles, 50);
      vehicles = garage.drive(vehicles, new Map(), DT, walker);
    }
    expect(vehicles[0]!.feet.x).toBeGreaterThan(300.5);
  });

  it("moves a ridden two-wheeler where its own physics puts it, shoving a parked one, never shoved itself", async () => {
    const garage = await garageOf([]);
    const parked = standing("parked", "bicycle", { x: 3, y: GROUND, z: 0 }, Math.PI / 2);
    let vehicles: readonly Vehicle[] = [standing("ridden", "bicycle", { x: 0, y: GROUND, z: 0 }, 0), parked];
    for (let i = 0; i < 180; i++) {
      const ridden = { ...vehicles[0]!, feet: { x: i * DT * 5, y: GROUND, z: 0 }, speed: 5 } as Vehicle;
      vehicles = [ridden, vehicles[1]!];
      if (i % 4 === 0) garage.follow(ridden.feet, { x: 5, z: 0 }, vehicles, 50);
      const next = garage.drive(vehicles, new Map([["ridden", { ...NO_INTENTS, forward: 1 }]]), DT);
      expect(next[0]).toBe(ridden);
      vehicles = next;
    }
    expect(vehicles[1]!.feet.x).toBeGreaterThan(4);
  });

  it("stops a car at a parked helicopter, which it never moves", async () => {
    const garage = await garageOf([]);
    // Facing north, its tail 11 m long across the car's road 12 m on.
    const helicopter = standing("helicopter", "helicopter", { x: 14, y: GROUND, z: -2 }, Math.PI / 2);
    const path = drive(garage, [car(), helicopter], 4, () => ({ ...NO_INTENTS, forward: 0.5 }));
    expect(Math.max(...path.map((v) => first(v).feet.x))).toBeLessThan(14 - 0.9);
    expect(path.every((v) => v[1] === helicopter)).toBe(true);
  });

  it("moves the helicopter where its flight puts it, out of a car's way once it has lifted, and lets it go far off", async () => {
    const garage = await garageOf([]);
    const parked = standing("helicopter", "helicopter", { x: 14, y: GROUND, z: -2 }, Math.PI / 2);
    let vehicles: readonly Vehicle[] = [car(), parked];
    for (let i = 0; i < 480; i++) {
      const lifted = { ...parked, feet: { ...parked.feet, y: GROUND + Math.min(20, i * DT * 8) } };
      vehicles = [vehicles[0]!, lifted];
      if (i % 4 === 0) garage.follow(first(vehicles).feet, { x: 5, z: 0 }, vehicles, 50);
      const next = garage.drive(vehicles, new Map([["car", { ...NO_INTENTS, forward: 0.5 }]]), DT);
      expect(next[1]).toBe(lifted);
      vehicles = next;
    }
    expect(first(vehicles).feet.x).toBeGreaterThan(16);
    garage.follow({ x: 3000, y: GROUND, z: 0 }, { x: 0, z: 0 }, [car(3000, 0), parked], 5);
    garage.follow({ x: 0, y: GROUND, z: 0 }, { x: 0, z: 0 }, [car(), parked], 5);
    const back = drive(garage, [car(), parked], 4, () => ({ ...NO_INTENTS, forward: 0.5 }));
    expect(Math.max(...back.map((v) => first(v).feet.x))).toBeLessThan(14 - 0.9);
  });

  it("lets far vehicles go and brings them back as they were, and places afresh a car changed outside it", async () => {
    const garage = await garageOf([]);
    const away = car(STREETS_KEEP + 50, 0, 0, "away");
    const bike = standing("bike", "bicycle", { x: 5, y: GROUND, z: 5 }, 0);
    const [moving] = drive(garage, [car(), away, bike], 1, () => THROTTLE).slice(-1);
    garage.follow({ x: 1000, y: GROUND, z: 0 }, { x: 0, z: 0 }, moving!, 5);
    garage.follow({ x: 0, y: GROUND, z: 0 }, { x: 0, z: 0 }, moving!, 5);
    // Stopped from outside (the rider got out): it stands still where it was, its engine off.
    const stopped: Car = { ...first(moving!), speed: 0, gear: 0, rpm: 0 };
    garage.follow(stopped.feet, { x: 0, z: 0 }, [stopped, ...moving!.slice(1)], 5);
    const after = garage.drive([stopped, ...moving!.slice(1)], new Map(), DT);
    expect(Math.abs(first(after).feet.x - stopped.feet.x)).toBeLessThan(0.01);
    // A bicycle moved from outside is blocked where it now is.
    const moved = { ...bike, feet: { x: 40, y: GROUND, z: 0 } };
    garage.follow(stopped.feet, { x: 0, z: 0 }, [stopped, away, moved], 5);
    garage.follow({ x: 5000, y: GROUND, z: 0 }, { x: 0, z: 0 }, [stopped, away, moved], 5);
  });

  it("drives the measuring traffic by itself, and says how many", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const garage = await garageOf([], { x: 0, z: 0 }, { traffic: 2 });
    const others = [car(0, 20, 0, "a"), car(0, -20, 0, "b"), car(0, 60, 0, "c")];
    const path = drive(garage, [car(), ...others], 2, () => NO_INTENTS);
    const end = path.at(-1)!;
    expect(end[1]!.feet.x).toBeGreaterThan(1);
    expect(end[2]!.feet.x).toBeGreaterThan(1);
    expect(end[3]).toBe(others[2]);
    expect(info.mock.calls.filter(([line]) => String(line) === "explore/traffic cars=2")).toHaveLength(1);
  });

  it("knows when it cannot keep up: its steps taking more than half the time they cover", async () => {
    let clock = 0;
    const garage = await garageOf([], { x: 0, z: 0 }, { now: () => (clock += 6) });
    expect(garage.keepingUp()).toBe(true);
    expect(garage.load()).toBe(0);
    drive(garage, [car()], SLOW_WINDOW + 0.1, () => THROTTLE);
    expect(garage.load()).toBeGreaterThan(0.5);
    expect(garage.keepingUp()).toBe(false);
  });
});

describe("the car's pedals", () => {
  it("brake a car rolling back when W is held, and one rolling on when S is", () => {
    expect(pedalsOf(-1, -3, THROTTLE)).toMatchObject({ force: 0, brake: BRAKE, gear: -1 });
    expect(pedalsOf(2, 10, { ...NO_INTENTS, forward: -1 })).toMatchObject({ force: 0, brake: BRAKE, gear: 2 });
    expect(pedalsOf(-1, 10, { ...NO_INTENTS, forward: -0.5 })).toMatchObject({ brake: BRAKE / 2, gear: 0 });
  });

  it("back up below a creep, cut out past reverse's top", () => {
    expect(pedalsOf(0, CREEP / 2, { ...NO_INTENTS, forward: -1 }).force).toBeLessThan(0);
    // Past it, nothing pushes it further back: the engine only drags.
    expect(pedalsOf(-1, -REVERSE_TOP - 1, { ...NO_INTENTS, forward: -1 }).force).toBeGreaterThan(0);
  });

  it("pull through the gearbox, which changes up near the red line", () => {
    const fast = (CAR_GEARBOX.up / 60) * 2 * Math.PI * (0.31 / CAR_GEARBOX.ratios[0]!) + 0.5;
    expect(pedalsOf(0, fast, THROTTLE).gear).toBe(1);
    expect(pedalsOf(-1, 0, THROTTLE).gear).toBe(0);
    expect(pedalsOf(0, 0, NO_INTENTS).force).toBe(0);
  });
});

/** A turn about the upright. */
const yaw = (h: number) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });

describe("a two-wheeler's tilt", () => {
  it("reads back the heading, lean and pitch it was turned by, lying on its side too", () => {
    for (const [heading, lean, pitch] of [
      [0.4, 0.3, -0.2],
      [-2.5, Math.PI / 2, 0.1],
      [3, -1.2, 0.6],
    ] as const) {
      const turn = tiltedBy(heading, lean, pitch);
      const tilt = tiltOf(turn);
      // On its side, heading and pitch turn the same way: the turn read back is the one made, however it is named.
      const back = tiltedBy(tilt.heading, tilt.lean, tilt.pitch);
      const dot = back.x * turn.x + back.y * turn.y + back.z * turn.z + back.w * turn.w;
      expect(Math.abs(dot)).toBeCloseTo(1, 9);
      expect(tilt.lean).toBeCloseTo(lean, 9);
    }
  });

  it("reads back each angle by its name, short of lying on its side", () => {
    const tilt = tiltOf(tiltedBy(3, -1.2, 0.6));
    expect(tilt.heading).toBeCloseTo(3, 9);
    expect(tilt.pitch).toBeCloseTo(0.6, 9);
  });

  it("names a heading even pointing straight up", () => {
    const up = tiltedBy(0.7, 0, Math.PI / 2);
    expect(Number.isFinite(tiltOf(up).heading)).toBe(true);
  });
});

describe("a car's turn", () => {
  it("faces where its nose points, keeping the last heading pointing straight up", () => {
    expect(headingOf(yaw(1.2), 0)).toBeCloseTo(1.2, 9);
    const nose = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
    expect(headingOf(nose, 0.5)).toBe(0.5);
    expect(upOf(yaw(2))).toBe(1);
  });

  it("steers less the faster it goes", () => {
    expect(steerReach(0)).toBeGreaterThan(steerReach(30));
  });
});
