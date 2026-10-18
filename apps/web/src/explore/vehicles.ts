// Vehicles parked in the city, to walk up to and ride: where they stand, when a person can reach one, and how one moves
// under its rider through the walls. The bicycle rides on its own physics (bicycle.ts); the car on an arcade handling:
// power that tapers towards top speed, and steering that asks for a rate of turn (tight when slow, wider when fast)
// which the car follows quickly. Both bump off walls; a hard knock throws a bicycle's rider. Metres and seconds;
// headings as the walker's.
import { GROUND, PERSON_RADIUS, type Vec3, type Walls } from "@citymap/world";
import { HARD_HIT, resting, rideCycle, thrown, type Cycle } from "./bicycle";
import type { Landing } from "./landing";
import { METRE } from "./street";
import { GRAVITY, facing, type Intents } from "./walker";

export type VehicleKind = "bicycle" | "car";

/** What a kind of vehicle is: its words, its size, and where the camera follows it from. */
export interface VehicleSpec {
  /** "the bicycle": what the prompt names. */
  readonly name: string;
  /** "get on" or "get in", and "get off" or "get out of", before its name. */
  readonly enter: string;
  readonly leave: string;
  /** "On the bicycle": the card's title while riding it. */
  readonly riding: string;
  /** What the keys do while riding it. */
  readonly keys: string;
  /** Its outline on the ground, and the circle that stands for it against walls. */
  readonly length: number;
  readonly width: number;
  readonly radius: number;
  /** Where the camera follows from: how far back and how high above the ground it looks. */
  readonly follow: { readonly distance: number; readonly height: number };
}

/** An arcade handling: how a car speeds up, brakes, coasts and turns. */
export interface Handling {
  /** Between its axles, for its front wheels' angle. */
  readonly wheelbase: number;
  /**
   * Top speeds forward and in reverse; how fast it gains speed from a standstill (tapering to nothing at top speed),
   * sheds it braking, and loses it coasting.
   */
  readonly topSpeed: number;
  readonly reverseSpeed: number;
  readonly accelerate: number;
  readonly brake: number;
  readonly coast: number;
  /** Its tightest turn's radius, and its fastest turn, in radians a second: slow, the radius limits; fast, the rate. */
  readonly turnRadius: number;
  readonly turnRate: number;
  /** How quickly its turn follows the steering, in radians a second, each second. */
  readonly turnResponse: number;
}

/** The car: GTA's arcade cars, 0 to 100 km/h in about five seconds. */
export const CAR: Handling = {
  wheelbase: 2.6,
  topSpeed: 32,
  reverseSpeed: 6,
  accelerate: 9,
  brake: 14,
  coast: 1.2,
  turnRadius: 5.5,
  turnRate: 1.5,
  turnResponse: 7,
};

export const VEHICLES: Readonly<Record<VehicleKind, VehicleSpec>> = {
  bicycle: {
    name: "the bicycle",
    enter: "get on",
    leave: "get off",
    riding: "On the bicycle",
    keys: "W pedals · S back brake · Space front brake · A D steer · Q R gears · B rings · E gets off · click to look · Esc leaves",
    length: 1.75,
    width: 0.6,
    radius: 0.35,
    follow: { distance: 4.5, height: 1.8 },
  },
  car: {
    name: "the car",
    enter: "get in",
    leave: "get out of",
    riding: "In the car",
    keys: "W accelerates · S brakes, then reverses · A D steer · Space brakes · E gets out · click to look · Esc leaves",
    length: 4.2,
    width: 1.8,
    radius: 0.95,
    follow: { distance: 7, height: 2.2 },
  },
};

/**
 * A vehicle in the city: which it is, where it stands, which way it faces, its speed, its rate of turn (radians a
 * second, anticlockwise from above) and its front wheel's angle (positive to the left).
 */
interface Placed {
  readonly id: string;
  readonly feet: Vec3;
  readonly heading: number;
  readonly speed: number;
  readonly turn: number;
  readonly steer: number;
}

export interface Car extends Placed {
  readonly kind: "car";
}

/** A bicycle carries its own state: its lean, steering, drivetrain, foot and falls. */
export interface Bicycle extends Placed {
  readonly kind: "bicycle";
  readonly cycle: Cycle;
}

export type Vehicle = Car | Bicycle;

/** A vehicle of a kind standing still, facing a heading; a bicycle at rest, its crank at an angle. */
export function standing(id: string, kind: VehicleKind, feet: Vec3, heading: number, crank = 0): Vehicle {
  const placed = { id, feet, heading, speed: 0, turn: 0, steer: 0 };
  return kind === "bicycle" ? { ...placed, kind, cycle: resting(undefined, crank) } : { ...placed, kind };
}

/** A person can reach a vehicle from this far from its outline. */
export const REACH = 1.2;
/** A rider gets off only below this speed. */
export const LEAVE_SPEED = 1.5;
/** Hitting a wall keeps this share of the speed. */
export const BUMP = 0.2;
/**
 * Where they park: metres in from the kerb; and by the landing, metres ahead of it, and which kerb (1 the right, −1 the
 * far one across the street, facing back), so the bicycle's line along its kerb is clear of the car.
 */
export const PARKING: Readonly<
  Record<VehicleKind, { readonly inset: number; readonly ahead: number; readonly side: 1 | -1 }>
> = {
  bicycle: { inset: 0.8, ahead: 4, side: 1 },
  car: { inset: 1.4, ahead: 10, side: -1 },
};

const towards = (value: number, target: number, step: number) =>
  value < target ? Math.min(target, value + step) : Math.max(target, value - step);

/**
 * A bicycle and a car parked a little ahead of the landing: the bicycle at the kerb on the right facing along the road,
 * the car across the street facing back; each kept clear of buildings by moving it from the road's middle to its place.
 */
export function parkedBy(landing: Landing, walls: Walls): Vehicle[] {
  const { road } = landing;
  const along = road.along;
  const right = { x: -along.z, z: along.x };
  const half = road.width / METRE / 2;
  return (["bicycle", "car"] as const).map((kind) => {
    const { ahead, inset, side } = PARKING[kind];
    const middle = { x: road.at.x / METRE + along.x * ahead, y: GROUND, z: road.at.z / METRE + along.z * ahead };
    const out = Math.max(0, half - inset) * side;
    const placed = walls.move(middle, { x: right.x * out, y: 0, z: right.z * out }, VEHICLES[kind].radius);
    return standing(kind, kind, placed.feet, Math.atan2(-along.z * side, along.x * side));
  });
}

/** Whether a point is further than `reach` from a vehicle's outline for certain: outside the square round its circle. */
function beyond(point: Vec3, vehicle: Vehicle, reach: number) {
  const { length, width } = VEHICLES[vehicle.kind];
  const far = Math.hypot(length, width) / 2 + reach;
  return Math.abs(point.x - vehicle.feet.x) > far || Math.abs(point.z - vehicle.feet.z) > far;
}

/** How far a point on the ground is from a vehicle's outline: zero inside it. */
export function distanceTo(point: Vec3, vehicle: Vehicle): number {
  const { length, width } = VEHICLES[vehicle.kind];
  const ahead = facing(vehicle.heading);
  const dx = point.x - vehicle.feet.x;
  const dz = point.z - vehicle.feet.z;
  const along = dx * ahead.x + dz * ahead.z;
  const across = dx * -ahead.z + dz * ahead.x;
  return Math.hypot(Math.max(0, Math.abs(along) - length / 2), Math.max(0, Math.abs(across) - width / 2));
}

/** The nearest vehicle within reach of a person's feet, or null. */
export function reachable(feet: Vec3, vehicles: readonly Vehicle[]): Vehicle | null {
  let best: { vehicle: Vehicle; distance: number } | null = null;
  for (const vehicle of vehicles) {
    if (beyond(feet, vehicle, REACH)) continue;
    const distance = distanceTo(feet, vehicle);
    if (distance <= REACH && (!best || distance < best.distance)) best = { vehicle, distance };
  }
  return best?.vehicle ?? null;
}

/** The widest a front wheel turns, in radians: what the steering angle shown is held to. */
export const MAX_STEER = 0.6;

/** A vehicle after a knock: it keeps a little of its speed, and a hard one throws a bicycle's rider. */
export function bumped(vehicle: Vehicle): Vehicle {
  const speed = vehicle.speed * BUMP;
  if (vehicle.kind === "car" || vehicle.cycle.fall || Math.abs(vehicle.speed) < HARD_HIT) return { ...vehicle, speed };
  return { ...vehicle, speed, cycle: thrown(vehicle.cycle, "hit", vehicle.speed) };
}

/** A vehicle left where it is: stopped, a bicycle upright on its stand with its gear and crank as they were. */
export function parkedNow(vehicle: Vehicle): Vehicle {
  const stopped = { ...vehicle, speed: 0, turn: 0, steer: 0 };
  return stopped.kind === "bicycle" ? { ...stopped, cycle: resting(stopped.cycle.gear, stopped.cycle.crank) } : stopped;
}

/**
 * A vehicle moved along its new heading at its new speed, as far as the walls let it: a move that gets less than half
 * its way is a knock.
 */
function moved<V extends Vehicle>(vehicle: V, next: V, dt: number, walls: Walls): Vehicle {
  const ahead = facing(next.heading);
  const want = Math.abs(next.speed) * dt;
  const { feet } = walls.move(
    vehicle.feet,
    { x: ahead.x * next.speed * dt, y: -GRAVITY * dt * dt, z: ahead.z * next.speed * dt },
    VEHICLES[vehicle.kind].radius,
  );
  const got = Math.hypot(feet.x - vehicle.feet.x, feet.z - vehicle.feet.z);
  return want > 0 && got < want / 2 ? bumped({ ...next, feet }) : { ...next, feet };
}

/**
 * One step of `dt` seconds under a rider. A bicycle rides on its own physics. A car: forward throttles (and, once
 * stopped, a held back reverses), back brakes, jump brakes hard; power tapers towards top speed. Right asks for a right
 * turn, as fast as the car turns at this speed (reversing, the other way, as a car's does), and its turn follows
 * quickly; the front wheels' angle is what that turn takes. The walls take what they allow.
 */
export function stepVehicle(vehicle: Vehicle, intents: Intents, dt: number, walls: Walls): Vehicle {
  if (vehicle.kind === "bicycle") {
    const { cycle, speed, turn } = rideCycle(vehicle.cycle, vehicle.speed, intents, dt);
    const next = { ...vehicle, heading: vehicle.heading + turn * dt, speed, turn, steer: cycle.steer, cycle };
    return moved(vehicle, next, dt, walls);
  }
  const spec = CAR;
  const throttle = intents.forward;
  let speed = vehicle.speed;
  // Power tapers to nothing at top speed (or reverse speed), so speed rises smoothly to it.
  const power = (top: number) => spec.accelerate * Math.max(0, 1 - (speed / top) ** 2);
  if (intents.jump) speed = towards(speed, 0, spec.brake * dt);
  else if (throttle > 0)
    speed = speed < 0 ? towards(speed, 0, spec.brake * dt) : speed + power(spec.topSpeed) * throttle * dt;
  else if (throttle < 0)
    speed =
      speed > 0 ? towards(speed, 0, spec.brake * -throttle * dt) : speed + power(spec.reverseSpeed) * throttle * dt;
  else speed = towards(speed, 0, spec.coast * dt);
  speed = Math.max(-spec.reverseSpeed, Math.min(spec.topSpeed, speed));
  // Right turns the heading clockwise from above: a negative turn; reversing turns the other way.
  const fastest = Math.min(Math.abs(speed) / spec.turnRadius, spec.turnRate);
  const aim = speed === 0 ? 0 : (0 - intents.right) * fastest * Math.sign(speed);
  const turn = towards(vehicle.turn, aim, spec.turnResponse * dt);
  const steer = speed === 0 ? 0 : Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan((turn * spec.wheelbase) / speed)));
  return moved(vehicle, { ...vehicle, heading: vehicle.heading + turn * dt, speed, turn, steer }, dt, walls);
}

/**
 * The ids of the `most` vehicles of each kind nearest a point, cars first, nearest first; and before them the one
 * ridden, which is always drawn.
 */
export function nearestOf(
  vehicles: readonly Vehicle[],
  at: { readonly x: number; readonly z: number },
  most: number,
  keep: string | null,
): string[] {
  const near = (kind: VehicleKind) =>
    vehicles
      .filter((v) => v.kind === kind && v.id !== keep)
      .map((v) => ({ id: v.id, distance: Math.hypot(v.feet.x - at.x, v.feet.z - at.z) }))
      .toSorted((a, b) => a.distance - b.distance)
      .slice(0, most)
      .map((v) => v.id);
  return [...(keep === null ? [] : [keep]), ...near("car"), ...near("bicycle")];
}

/**
 * Where a rider steps down: beside the vehicle on its left, or its right where the left is walled; as far out as the
 * walls let a person go from the vehicle's middle.
 */
export function alightFrom(vehicle: Vehicle, walls: Walls): Vec3 {
  const { width } = VEHICLES[vehicle.kind];
  const ahead = facing(vehicle.heading);
  const out = width / 2 + PERSON_RADIUS + 0.2;
  const side = (sign: number) =>
    walls.move(vehicle.feet, { x: -ahead.z * out * sign, y: 0, z: ahead.x * out * sign }).feet;
  const left = side(-1);
  const reached = (p: Vec3) => Math.hypot(p.x - vehicle.feet.x, p.z - vehicle.feet.z);
  if (reached(left) >= out - 1e-6) return left;
  const right = side(1);
  return reached(right) > reached(left) ? right : left;
}

/** Which side of a vehicle's middle line a point lies: dead on it counts as the positive side. */
const sideOf = (offset: number) => (offset < 0 ? -1 : 1);

/**
 * Feet pushed out of every vehicle's outline but one (the vehicle that moves, or the one ridden), for a mover `radius`
 * wide, the shortest way; and whether any vehicle was in the way.
 */
export function clearOfVehicles(
  feet: Vec3,
  radius: number,
  vehicles: readonly Vehicle[],
  except: string | null,
): { readonly feet: Vec3; readonly hit: boolean } {
  let { x, z } = feet;
  let hit = false;
  for (const vehicle of vehicles) {
    if (vehicle.id === except || beyond({ x, y: feet.y, z }, vehicle, radius)) continue;
    const { length, width } = VEHICLES[vehicle.kind];
    const ahead = facing(vehicle.heading);
    const dx = x - vehicle.feet.x;
    const dz = z - vehicle.feet.z;
    const along = dx * ahead.x + dz * ahead.z;
    const across = dx * -ahead.z + dz * ahead.x;
    // The nearest point of the outline, in the vehicle's own frame; from inside, out through the nearer side.
    const outAlong = length / 2 - Math.abs(along);
    const outAcross = width / 2 - Math.abs(across);
    let pushAlong = 0;
    let pushAcross = 0;
    if (outAlong > 0 && outAcross > 0) {
      if (outAlong < outAcross) pushAlong = sideOf(along) * (outAlong + radius);
      else pushAcross = sideOf(across) * (outAcross + radius);
    } else {
      const gapAlong = Math.max(0, -outAlong) * Math.sign(along);
      const gapAcross = Math.max(0, -outAcross) * Math.sign(across);
      const gap = Math.hypot(gapAlong, gapAcross);
      if (gap >= radius) continue;
      pushAlong = (gapAlong / gap) * (radius - gap);
      pushAcross = (gapAcross / gap) * (radius - gap);
    }
    x += ahead.x * pushAlong - ahead.z * pushAcross;
    z += ahead.z * pushAlong + ahead.x * pushAcross;
    hit = true;
  }
  return { feet: { x, y: feet.y, z }, hit };
}
