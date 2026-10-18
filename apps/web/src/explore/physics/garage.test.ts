import { GROUND, type Footprint } from "@citymap/world";
import { ColliderDesc } from "@dimforge/rapier3d-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Step } from "../../load/step";
import { standing, type Car, type Vehicle } from "../vehicles";
import { NO_INTENTS, type Intents } from "../walker";
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
    expect(steps[0]).toEqual({ phase: "engine" });
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
    // With time, the window is raised round where the player will be: ahead of it at its speed.
    const spare = vi.fn<() => number>(() => clock++);
    const roomy = await garageOf(row, { x: 0, z: 0 }, { now: spare });
    const ahead = roomy.follow({ x: 1000, y: GROUND, z: 0 }, { x: 100, z: 0 }, [], 1e9);
    expect(ahead.waiting).toBe(0);
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

  it("is stopped by a parked bicycle or motorbike, which stays where it stands", async () => {
    const garage = await garageOf([]);
    const bike = standing("bike", "motorbike", { x: 12, y: GROUND, z: 0 }, Math.PI / 2);
    const path = drive(garage, [car(), bike], 4, () => ({ ...NO_INTENTS, forward: 0.3 }));
    expect(Math.max(...path.map((v) => first(v).feet.x))).toBeLessThan(12);
    expect(path.at(-1)![1]).toBe(bike);
  });

  it("blocks a two-wheeler again when the player comes back to it", async () => {
    const garage = await garageOf([]);
    const bike = standing("bike", "motorbike", { x: 12, y: GROUND, z: 0 }, Math.PI / 2);
    garage.follow({ x: 0, y: GROUND, z: 0 }, { x: 0, z: 0 }, [car(), bike], 5);
    garage.follow({ x: 3000, y: GROUND, z: 0 }, { x: 0, z: 0 }, [car(3000, 0), bike], 5);
    const path = drive(garage, [car(), bike], 4, () => ({ ...NO_INTENTS, forward: 0.3 }));
    expect(Math.max(...path.map((v) => first(v).feet.x))).toBeLessThan(12);
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

  it("drives the measuring traffic by itself", async () => {
    const garage = await garageOf([], { x: 0, z: 0 }, { traffic: 2 });
    const others = [car(0, 20, 0, "a"), car(0, -20, 0, "b"), car(0, 60, 0, "c")];
    const path = drive(garage, [car(), ...others], 2, () => NO_INTENTS);
    const end = path.at(-1)!;
    expect(end[1]!.feet.x).toBeGreaterThan(1);
    expect(end[2]!.feet.x).toBeGreaterThan(1);
    expect(end[3]).toBe(others[2]);
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
