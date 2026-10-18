// The cars on Rapier: a small world of the nearby streets (only the buildings round the player, raised ahead of it
// within a frame's budget and lowered behind), a ground under it, and every car near the player as a body on four
// wheels by Rapier's ray-cast vehicle controller, with an engine, an automatic gearbox, brakes and a handbrake. The world
// is placed round the player and re-centred as it goes, each building from its own middle in 64-bit numbers, so nothing
// drifts however far the walk goes. The walker and the two-wheelers move on the walls; here they are only in the way.
// Metres, seconds, newtons; headings as the walk's.
import { GROUND, solid, type Footprint, type Vec3 } from "@citymap/world";
import { log } from "../../log";
import { automatic, driveOf, rpmOf, type Engine, type Gearbox } from "../engine";
import { VEHICLES, type Car, type Quat, type Vehicle } from "../vehicles";
import { GRAVITY, type Intents } from "../walker";
import { breathe, type WallOptions } from "./raise";
import { loadRapier, type Rapier } from "./rapier";
import {
  RECHOOSE,
  STREETS_KEEP,
  aheadOf,
  planStreets,
  rebased,
  streetGrid,
  type Spot,
  type StreetGrid,
} from "./streets";

type World = InstanceType<Rapier["World"]>;
type Body = InstanceType<Rapier["RigidBody"]>;
type Collider = InstanceType<Rapier["Collider"]>;
type Controller = ReturnType<World["createVehicleController"]>;

/** The car's build: 1,300 kg, its weight low; four wheels on springs, the back two driven. */
export const CAR_MASS = 1300;
export const CAR_MIDDLE_UP = 0.55;
export const WHEEL_RADIUS = 0.31;
/** Wheels this far ahead and behind the middle, and out from it. */
export const AXLE_AHEAD = 1.3;
export const TRACK_HALF = 0.78;
/** The springs: their length at rest, how far they travel, their stiffness (per kilogram of car), damping, strongest. */
export const SPRING_REST = 0.3;
export const SPRING_TRAVEL = 0.2;
export const SPRING_STIFFNESS = 35;
export const SPRING_COMPRESSION = 3.5;
export const SPRING_RELAXATION = 5;
export const SPRING_MOST = 40_000;
/** How far the springs sag under the car's own weight: the hard points sit so the car's feet rest on the ground. */
export const SAG = GRAVITY / (4 * SPRING_STIFFNESS);
/** The tyres' grip, and the back tyres' sideways stiffness with the handbrake on (of their own). */
export const TYRE_GRIP = 1.2;
export const HANDBRAKE_SIDE = 0.4;
/** Brakes, as Rapier's impulse a step at 120 Hz: the footbrake on every wheel, the handbrake on the back two. */
export const BRAKE = 30;
export const HANDBRAKE = 60;
/** A car standing parked holds itself on this much brake. */
export const PARKED_BRAKE = 10;
/** The air and the road: drag area (with the air's density) and rolling resistance (a share of the weight). */
export const CAR_DRAG_AREA = 0.75;
export const CAR_ROLLING = 0.015;
const AIR_DENSITY = 1.2;
/** The front wheels turn this far at a standstill, less the faster it goes (half by `STEER_FALL`), at this rate. */
export const CAR_STEER = 0.6;
export const STEER_FALL = 14;
export const STEER_RATE = 3;
/** Below this speed a held S backs up and a held W pulls away; above it, each brakes the other way's motion. */
export const CREEP = 0.5;
/** Reversing, it goes no faster than this. */
export const REVERSE_TOP = 8;
/** Lying tipped (its roof further than this from up) and nearly still for `RIGHTING_AFTER` s, it is set on its wheels. */
export const TIPPED = 0.5;
export const RIGHTING_AFTER = 2;
/** Losing this much speed in a step is a crash, said in the log. */
export const CRASH = 4;
/** The ground under the streets: a slab this far each way from the frame's origin. */
export const GROUND_HALF = 1000;
/** Rapier keeping up: its steps may take this share of the time they cover, over this many seconds of driving. */
export const SLOW_SHARE = 0.5;
export const SLOW_WINDOW = 2;
/** The streets raised behind the loading card are counted in steps of this many buildings. */
export const STREETS_SLICE = 200;

/** The car's engine: strongest in its middle, done by 6,500 rpm. */
export const CAR_ENGINE: Engine = {
  idle: 900,
  redline: 6500,
  curve: [
    [900, 190],
    [2000, 260],
    [4000, 300],
    [5500, 280],
    [6500, 220],
  ],
  braking: 40,
  launch: 2200,
};

/** Five gears and reverse, each with the final drive. */
export const CAR_GEARBOX: Gearbox = {
  ratios: [3.2, 2.1, 1.45, 1.1, 0.87].map((g) => g * 3.9),
  reverse: 3.4 * 3.9,
  up: 6000,
  down: 2500,
};

/** The wheels: front left, front right, back left, back right, in the car's own frame (x ahead, z to its right). */
const WHEELS: readonly Spot[] = [
  { x: AXLE_AHEAD, z: -TRACK_HALF },
  { x: AXLE_AHEAD, z: TRACK_HALF },
  { x: -AXLE_AHEAD, z: -TRACK_HALF },
  { x: -AXLE_AHEAD, z: TRACK_HALF },
];
const FRONT = [0, 1];
const BACK = [2, 3];

/** The steering's reach at a speed: all of it standing, less the faster. */
export const steerReach = (speed: number) => CAR_STEER / (1 + (speed / STEER_FALL) ** 2);

/** What a car's engine and brakes do this step: the push at each driven wheel, the brakes, the gear and the engine. */
export interface Pedals {
  readonly force: number;
  readonly brake: number;
  readonly gear: number;
  readonly rpm: number;
}

/**
 * The pedals under intents at a forward speed: W pulls (or brakes a car rolling back), S brakes (or, below a creep,
 * backs up in reverse, no faster than its top); the gearbox changes by itself; off both, the engine drags.
 */
export function pedalsOf(gear: number, speed: number, intents: Intents): Pedals {
  const throttle = intents.forward;
  if (throttle > 0 && speed < -CREEP) return { force: 0, brake: BRAKE * throttle, gear: -1, rpm: CAR_ENGINE.idle };
  if (throttle < 0 && speed > CREEP) {
    const box = Math.max(0, gear);
    const rpm = driveOf(CAR_ENGINE, CAR_GEARBOX.ratios[box]!, WHEEL_RADIUS, speed, 0).rpm;
    return { force: 0, brake: BRAKE * -throttle, gear: box, rpm };
  }
  if (throttle < 0) {
    const open = speed < -REVERSE_TOP ? 0 : -throttle;
    const drive = driveOf(CAR_ENGINE, CAR_GEARBOX.reverse, WHEEL_RADIUS, speed, open);
    return { force: -drive.force, brake: 0, gear: -1, rpm: drive.rpm };
  }
  const box = automatic(
    CAR_GEARBOX,
    Math.max(0, gear),
    rpmOf(speed, WHEEL_RADIUS, CAR_GEARBOX.ratios[Math.max(0, gear)]!),
  );
  const drive = driveOf(CAR_ENGINE, CAR_GEARBOX.ratios[box]!, WHEEL_RADIUS, Math.max(0, speed), Math.max(0, throttle));
  return { force: drive.force, brake: 0, gear: box, rpm: drive.rpm };
}

/** The heading a turn faces: its nose (+x) turned, seen from above. */
export function headingOf(q: Quat, fallback: number): number {
  // The car's +x in the world: the first column of the turn's matrix.
  const x = 1 - 2 * (q.y * q.y + q.z * q.z);
  const z = 2 * (q.x * q.z - q.w * q.y);
  return Math.hypot(x, z) < 1e-6 ? fallback : Math.atan2(-z, x);
}

/** How far up a turn's roof points: 1 upright, 0 on its side, −1 on its roof. */
export const upOf = (q: Quat) => 1 - 2 * (q.x * q.x + q.z * q.z);

/** A car in Rapier: its body and its controller, and how long it has lain tipped. */
interface Wheeled {
  readonly body: Body;
  readonly controller: Controller;
  tipped: number;
}

/** A two-wheeler in Rapier: a block in the cars' way. */
interface Block {
  readonly body: Body;
}

/** What the garage does with a car this step: drive it by intents, or hold it parked. */
export type Drivers = ReadonlyMap<string, Intents>;

/** The cars on Rapier, in the nearby streets. */
export interface Garage {
  /**
   * Moves the window round the player (where it is and how fast it goes): re-centres the frame when far from it, brings
   * the vehicles near it in and lets far ones go, lowers buildings left behind and raises those ahead, nearest first,
   * until `budget` milliseconds are spent. Says how many buildings stand and how many wait.
   */
  readonly follow: (
    at: Vec3,
    velocity: Spot,
    vehicles: readonly Vehicle[],
    budget: number,
  ) => { readonly standing: number; readonly waiting: number };
  /** One step of the cars near the player, each driven car by its intents; the vehicles after it, in their order. */
  readonly drive: (vehicles: readonly Vehicle[], drivers: Drivers, dt: number) => readonly Vehicle[];
  /** Whether Rapier keeps up: its steps take no more than `SLOW_SHARE` of the time they cover, over `SLOW_WINDOW`. */
  readonly keepingUp: () => boolean;
  /** The share of the time its steps cover that they take, over the last window. */
  readonly load: () => number;
  readonly dispose: () => void;
}

/** What the garage needs at the start: the city's buildings and where the walk lands. */
export interface GarageOptions extends WallOptions {
  readonly at: Spot;
  /** A measuring aid: this many parked cars nearest the landing drive themselves in slow circles. */
  readonly traffic?: number;
  /** Milliseconds now: the page's clock, a stand-in in tests. */
  readonly now?: () => number;
}

/** A building's hull, about its own middle, from the ground to its roof. */
function hullOf(rapier: Rapier, footprint: Footprint, middle: Spot) {
  const points = new Float32Array(footprint.corners.length * 6);
  footprint.corners.forEach((c, i) => {
    points.set([c.x - middle.x, 0, c.z - middle.z, c.x - middle.x, footprint.top, c.z - middle.z], i * 6);
  });
  return rapier.ColliderDesc.convexHull(points);
}

/**
 * The garage for a city: Rapier loaded (once a page), its world with a ground round the landing, and the streets round
 * it raised, counted to the loading card.
 */
export async function openGarage(footprints: readonly Footprint[], options: GarageOptions): Promise<Garage> {
  const { onStep, signal, at } = options;
  const now = options.now ?? (() => performance.now());
  const started = now();
  onStep?.({ phase: "engine" });
  const rapier = await loadRapier();
  signal?.throwIfAborted();
  const engineMs = Math.round(now() - started);
  const world = new rapier.World({ x: 0, y: -GRAVITY, z: 0 });
  const garage = garageIn(rapier, world, footprints, at, now, options.traffic ?? 0);
  try {
    // The streets round the landing, all of them, behind the card: slice by slice, so it can count them.
    const first = garage.waiting(at);
    const raiseFrom = async (done: number): Promise<void> => {
      if (done >= first) return;
      onStep?.({ phase: "streets", done, of: first });
      garage.raise(at, STREETS_SLICE);
      await breathe();
      signal?.throwIfAborted();
      await raiseFrom(done + STREETS_SLICE);
    };
    await raiseFrom(0);
    onStep?.({ phase: "streets", done: first, of: first });
    log.info("explore/streets", {
      buildings: garage.standing(),
      engineMs,
      ms: Math.round(now() - started),
    });
    return garage.garage;
  } catch (failure) {
    garage.garage.dispose();
    throw failure;
  }
}

/** The garage's workings over a world: the window, the cars, the steps. */
function garageIn(
  rapier: Rapier,
  world: World,
  footprints: readonly Footprint[],
  start: Spot,
  now: () => number,
  traffic: number,
) {
  world.timestep = 1 / 120;
  const grid: StreetGrid = streetGrid(footprints);
  const byLot = new Map(footprints.filter(solid).map((f) => [f.lot, f]));
  let origin: Spot = { x: Math.round(start.x), z: Math.round(start.z) };
  // Each building raised, by its lot: its collider, or null where Rapier could make no hull of it (never tried again).
  const raised = new Map<number, Collider | null>();
  const cars = new Map<string, Wheeled>();
  const blocks = new Map<string, Block>();
  const last = new Map<string, Vehicle>();
  let chosen: { at: Spot; raise: readonly number[]; lower: readonly number[] } | null = null;
  // The cars that drive themselves (a measuring aid), chosen the first time the vehicles are seen.
  let autopilot: ReadonlyMap<string, Intents> | null = null;
  // Rapier's own cost against the time it covers, second by second, for keeping up.
  const spent: { ms: number; covered: number }[] = [];
  world.createCollider(
    rapier.ColliderDesc.cuboid(GROUND_HALF, 0.5, GROUND_HALF)
      .setTranslation(0, GROUND - 0.5, 0)
      .setFriction(1),
  );

  const local = (p: { x: number; y: number; z: number }) => ({ x: p.x - origin.x, y: p.y, z: p.z - origin.z });
  const placeBuilding = (lot: number, collider: Collider) => {
    const middle = grid.standing.get(lot)!.middle;
    collider.setTranslation({ x: middle.x - origin.x, y: 0, z: middle.z - origin.z });
  };
  const raiseOne = (lot: number) => {
    const footprint = byLot.get(lot)!;
    const hull = hullOf(rapier, footprint, grid.standing.get(lot)!.middle);
    const collider = hull ? world.createCollider(hull.setFriction(0.3)) : null;
    if (collider) placeBuilding(lot, collider);
    else log.info("explore/no-hull", { lot });
    raised.set(lot, collider);
  };
  const lowerOne = (lot: number) => {
    const collider = raised.get(lot);
    if (collider) world.removeCollider(collider, false);
    raised.delete(lot);
  };
  /** The window's plan round a point, worked out afresh once the point has moved far enough. */
  const planAt = (at: Spot) => {
    if (!chosen || Math.hypot(at.x - chosen.at.x, at.z - chosen.at.z) > RECHOOSE) {
      const plan = planStreets(grid, new Set(raised.keys()), at);
      chosen = { at, ...plan };
    }
    return chosen;
  };
  /** At the opening, with nothing yet raised (so nothing to lower), up to `most` of the buildings round a point. */
  const raise = (at: Spot, most: number) => {
    const plan = planAt(at);
    const next = plan.raise.filter((lot) => !raised.has(lot)).slice(0, most);
    for (const lot of next) raiseOne(lot);
    chosen = { ...plan, lower: [], raise: plan.raise.filter((lot) => !raised.has(lot)) };
  };
  const rebase = (to: Spot) => {
    const dx = origin.x - to.x;
    const dz = origin.z - to.z;
    origin = to;
    for (const [lot, collider] of raised) if (collider) placeBuilding(lot, collider);
    for (const { body } of [...cars.values(), ...blocks.values()]) {
      const t = body.translation();
      body.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, false);
    }
  };

  /** A car's body on four wheels, placed as the vehicle stands; asleep until something wakes it. */
  const carBody = (car: Car): Wheeled => {
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(car.feet.x - origin.x, car.feet.y, car.feet.z - origin.z)
        .setRotation(car.attitude)
        .setSleeping(true),
    );
    const { length, width } = VEHICLES.car;
    world.createCollider(
      rapier.ColliderDesc.cuboid(length / 2, 0.32, width / 2 - 0.02)
        .setTranslation(0, 0.72, 0)
        .setFriction(0.3)
        .setMassProperties(
          CAR_MASS,
          { x: 0, y: CAR_MIDDLE_UP, z: 0 },
          { x: 534, y: 2255, z: 2088 },
          { x: 0, y: 0, z: 0, w: 1 },
        ),
      body,
    );
    // The cabin, so it rolls onto its roof rather than through it.
    world.createCollider(
      rapier.ColliderDesc.cuboid(1.1, 0.28, width / 2 - 0.12)
        .setTranslation(-0.2, 1.3, 0)
        .setFriction(0.3)
        .setDensity(0),
      body,
    );
    const controller = world.createVehicleController(body);
    for (const wheel of WHEELS) {
      controller.addWheel(
        { x: wheel.x, y: WHEEL_RADIUS + SPRING_REST - SAG, z: wheel.z },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 },
        SPRING_REST,
        WHEEL_RADIUS,
      );
    }
    WHEELS.forEach((_, i) => {
      controller.setWheelSuspensionStiffness(i, SPRING_STIFFNESS);
      controller.setWheelMaxSuspensionTravel(i, SPRING_TRAVEL);
      controller.setWheelSuspensionCompression(i, SPRING_COMPRESSION);
      controller.setWheelSuspensionRelaxation(i, SPRING_RELAXATION);
      controller.setWheelMaxSuspensionForce(i, SPRING_MOST);
      controller.setWheelFrictionSlip(i, TYRE_GRIP);
      controller.setWheelBrake(i, PARKED_BRAKE);
    });
    return { body, controller, tipped: 0 };
  };
  /** A two-wheeler's block, fixed where it stands. */
  const block = (vehicle: Vehicle): Block => {
    const { length, width } = VEHICLES[vehicle.kind];
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.fixed()
        .setTranslation(vehicle.feet.x - origin.x, vehicle.feet.y, vehicle.feet.z - origin.z)
        .setRotation({ x: 0, y: Math.sin(vehicle.heading / 2), z: 0, w: Math.cos(vehicle.heading / 2) }),
    );
    world.createCollider(rapier.ColliderDesc.cuboid(length / 2, 0.55, width / 2).setTranslation(0, 0.55, 0), body);
    return { body };
  };
  const dropCar = (id: string) => {
    const car = cars.get(id)!;
    world.removeVehicleController(car.controller);
    world.removeRigidBody(car.body);
    cars.delete(id);
  };
  const dropBlock = (id: string) => {
    world.removeRigidBody(blocks.get(id)!.body);
    blocks.delete(id);
  };
  /** A car's body placed afresh as the vehicle says it stands, still. */
  const replace = (wheeled: Wheeled, car: Car) => {
    wheeled.body.setTranslation(local(car.feet), false);
    wheeled.body.setRotation(car.attitude, false);
    wheeled.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    wheeled.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
  };
  /** The vehicles near the player brought in, far ones let go; a car changed outside the garage placed afresh. */
  const gather = (vehicles: readonly Vehicle[], at: Spot) => {
    autopilot ??= new Map(
      vehicles
        .filter((v) => v.kind === "car")
        .map((v) => ({ id: v.id, gap: Math.hypot(v.feet.x - at.x, v.feet.z - at.z) }))
        .toSorted((a, b) => a.gap - b.gap)
        .slice(1, 1 + traffic)
        .map(({ id }, i) => [id, { forward: 0.35, right: i % 2 === 0 ? 0.4 : -0.4, run: false, jump: false }]),
    );
    for (const vehicle of vehicles) {
      const near = Math.hypot(vehicle.feet.x - at.x, vehicle.feet.z - at.z) <= STREETS_KEEP;
      if (vehicle.kind === "car") {
        const wheeled = cars.get(vehicle.id);
        if (near && !wheeled) cars.set(vehicle.id, carBody(vehicle));
        else if (!near && wheeled) dropCar(vehicle.id);
        else if (wheeled && last.get(vehicle.id) !== vehicle) replace(wheeled, vehicle);
      } else {
        const blocked = blocks.get(vehicle.id);
        if (near && !blocked) blocks.set(vehicle.id, block(vehicle));
        else if (blocked && !near) dropBlock(vehicle.id);
        else if (blocked && last.get(vehicle.id) !== vehicle) {
          dropBlock(vehicle.id);
          blocks.set(vehicle.id, block(vehicle));
        }
      }
      last.set(vehicle.id, vehicle);
    }
  };

  /** A driven car's controls this step: its pedals and its steering. */
  const steer = (wheeled: Wheeled, car: Car, intents: Intents, speed: number, dt: number) => {
    const { controller } = wheeled;
    const pedals = pedalsOf(car.gear, speed, intents);
    const handbrake = intents.jump;
    const aim = -intents.right * steerReach(Math.abs(speed));
    const was = controller.wheelSteering(0)!;
    const turned = was + Math.max(-STEER_RATE * dt, Math.min(STEER_RATE * dt, aim - was));
    for (const i of FRONT) {
      controller.setWheelSteering(i, turned);
      controller.setWheelBrake(i, pedals.brake);
      controller.setWheelEngineForce(i, 0);
    }
    // A wheel with power on it ignores its brake: the handbrake takes the drive off the back wheels it locks.
    for (const i of BACK) {
      controller.setWheelEngineForce(i, handbrake ? 0 : pedals.force / 2);
      controller.setWheelBrake(i, handbrake ? HANDBRAKE : pedals.brake);
      controller.setWheelSideFrictionStiffness(i, handbrake ? HANDBRAKE_SIDE : 1);
    }
    return pedals;
  };
  /** A car left alone: no power, brakes on, wheels straight. */
  const hold = ({ controller }: Wheeled) => {
    WHEELS.forEach((_, i) => {
      controller.setWheelEngineForce(i, 0);
      controller.setWheelBrake(i, PARKED_BRAKE);
      controller.setWheelSideFrictionStiffness(i, 1);
    });
  };
  /** The air and the road against a car's motion, as a force on its body. */
  const resist = ({ body }: Wheeled) => {
    const v = body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    body.resetForces(false);
    if (speed < 1e-3) return;
    const drag = CAR_ROLLING * CAR_MASS * GRAVITY + 0.5 * AIR_DENSITY * CAR_DRAG_AREA * speed * speed;
    body.addForce({ x: (-v.x / speed) * drag, y: (-v.y / speed) * drag, z: (-v.z / speed) * drag }, true);
  };
  /** A car lying tipped and nearly still for long enough is set back on its wheels, where it lies. */
  const right = (id: string, wheeled: Wheeled, heading: number, dt: number) => {
    const { body } = wheeled;
    const v = body.linvel();
    const w = body.angvel();
    const still = Math.hypot(v.x, v.y, v.z) < 1 && Math.hypot(w.x, w.y, w.z) < 1;
    wheeled.tipped = upOf(body.rotation()) < TIPPED && still ? wheeled.tipped + dt : 0;
    if (wheeled.tipped < RIGHTING_AFTER) return;
    wheeled.tipped = 0;
    const t = body.translation();
    body.setTranslation({ x: t.x, y: GROUND + 0.5, z: t.z }, true);
    body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    log.info("explore/righted", { car: id });
  };
  /** A car as its body now stands. */
  const read = (car: Car, wheeled: Wheeled, gear: number, rpm: number): Car => {
    const { body, controller } = wheeled;
    const t = body.translation();
    const q = body.rotation();
    const attitude = { x: q.x, y: q.y, z: q.z, w: q.w };
    const heading = headingOf(attitude, car.heading);
    const v = body.linvel();
    const speed = v.x * Math.cos(heading) - v.z * Math.sin(heading);
    return {
      ...car,
      feet: { x: t.x + origin.x, y: t.y, z: t.z + origin.z },
      attitude,
      heading,
      speed,
      turn: body.angvel().y,
      steer: controller.wheelSteering(0)!,
      gear,
      rpm,
    };
  };

  const garage: Garage = {
    follow: (at, velocity, vehicles, budget) => {
      const ahead = aheadOf(at, velocity);
      const moved = rebased(origin, at);
      if (moved) rebase(moved);
      gather(vehicles, at);
      const until = now() + budget;
      const plan = planAt(ahead);
      for (const lot of plan.lower) lowerOne(lot);
      let left = plan.raise.filter((lot) => !raised.has(lot));
      while (left.length > 0 && now() < until) {
        raiseOne(left[0]!);
        left = left.slice(1);
      }
      chosen = { ...plan, lower: [], raise: left };
      return { standing: raised.size, waiting: left.length };
    },
    drive: (vehicles, drivers, dt) => {
      const started = now();
      const driven = new Map<string, Pedals>();
      for (const vehicle of vehicles) {
        const wheeled = vehicle.kind === "car" ? cars.get(vehicle.id) : undefined;
        if (!wheeled || vehicle.kind !== "car") continue;
        const intents = drivers.get(vehicle.id) ?? autopilot?.get(vehicle.id);
        if (intents) {
          wheeled.body.wakeUp();
          driven.set(vehicle.id, steer(wheeled, vehicle, intents, vehicle.speed, dt));
        } else hold(wheeled);
        if (wheeled.body.isSleeping()) continue;
        resist(wheeled);
        wheeled.controller.updateVehicle(dt);
      }
      world.step();
      const next = vehicles.map((vehicle) => {
        const wheeled = vehicle.kind === "car" ? cars.get(vehicle.id) : undefined;
        if (!wheeled || vehicle.kind !== "car" || (wheeled.body.isSleeping() && !driven.has(vehicle.id)))
          return vehicle;
        const pedals = driven.get(vehicle.id);
        const car = read(vehicle, wheeled, pedals?.gear ?? vehicle.gear, pedals?.rpm ?? 0);
        right(vehicle.id, wheeled, car.heading, dt);
        if (drivers.has(vehicle.id) && Math.abs(vehicle.speed) - Math.abs(car.speed) > CRASH)
          log.info("explore/crash", {
            car: vehicle.id,
            lost: (Math.abs(vehicle.speed) - Math.abs(car.speed)).toFixed(1),
          });
        last.set(vehicle.id, car);
        return car;
      });
      spent.push({ ms: now() - started, covered: dt * 1000 });
      while (spent.length > SLOW_WINDOW * 120) spent.shift();
      return next;
    },
    load: () => {
      const covered = spent.reduce((sum, s) => sum + s.covered, 0);
      return covered === 0 ? 0 : spent.reduce((sum, s) => sum + s.ms, 0) / covered;
    },
    keepingUp: () => spent.length < SLOW_WINDOW * 120 || garage.load() <= SLOW_SHARE,
    dispose: () => world.free(),
  };
  return {
    garage,
    /** How many buildings wait to be raised round a point. */
    waiting: (at: Spot) => planAt(at).raise.length,
    /** Raises up to `most` of them, nearest first. */
    raise,
    standing: () => raised.size,
  };
}
