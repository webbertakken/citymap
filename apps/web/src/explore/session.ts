// A walk through the city, frame by frame: what the devices hold, the walker and the vehicles they move, and the camera.
// Everything steps at a fixed rate, whatever the screen's, so a walk is the same on every device. Metres.
import { PERSON_RADIUS, type Vec3, type Walls } from "@citymap/world";
import { shift } from "./bicycle";
import { ON_FOOT, behind, cameraOf, turned, type Follow, type Orbit } from "./camera";
import { FLY_SPEED, geared as gearedFlight, stepFlyer, type Flyer } from "./flyer";
import { started } from "./helicopter";
import { intentsOf, type Pad, type Stick } from "./input";
import type { Garage } from "./physics/garage";
import {
  VEHICLES,
  alightFrom,
  bumped,
  canLeave,
  clearOfVehicles,
  idleHeli,
  parkedNow,
  reachable,
  stepVehicle,
  type Helicopter,
  type Quat,
  type Vehicle,
  type VehicleKind,
} from "./vehicles";
import { NO_INTENTS, facing, stepWalker, turnBetween, type Body } from "./walker";

/** What the devices hold now: the view's listeners write it, each frame reads it. */
export interface Controls {
  readonly keys: Set<string>;
  stick: Stick | null;
  jump: boolean;
  /** Pixels dragged since the last frame. */
  look: { dx: number; dy: number };
  /** Getting on or off was asked for since the last frame. */
  use: boolean;
  /** Flying freely, or landing again, was asked for since the last frame. */
  fly: boolean;
  /**
   * Gear steps since the last frame (the wheel, the gear keys, the gear buttons): up positive. They shift the bicycle,
   * or set the free camera's speed while it flies.
   */
  gears: number;
  /** Sinking, while flying the free camera or the helicopter, is held (a touch button). */
  sink: boolean;
  /** A gamepad's stick and A button, read each frame; null with no pad. */
  pad: Pad | null;
}

export const newControls = (): Controls => ({
  keys: new Set(),
  stick: null,
  jump: false,
  look: { dx: 0, dy: 0 },
  use: false,
  fly: false,
  gears: 0,
  sink: false,
  pad: null,
});

/**
 * The walker after its last step and before it; the vehicles likewise; the one being ridden, if any; the camera's
 * orbit; the time not yet stepped; how far the walker (or what it rides) has gone, and its pace over the last step.
 */
export interface Session {
  readonly body: Body;
  readonly previous: Body;
  readonly vehicles: readonly Vehicle[];
  readonly previousVehicles: readonly Vehicle[];
  readonly riding: string | null;
  readonly speed: number;
  readonly orbit: Orbit;
  readonly spare: number;
  readonly walked: number;
  /** The free camera, while it flies; null while it follows the walker. */
  readonly flyer: Flyer | null;
  /** Seconds since the person last turned the camera (infinite when never). */
  readonly sinceLook: number;
}

/** Everything steps 120 times a second. */
export const STEP = 1 / 120;
/** A frame longer than this (a tab in the background, a pause) counts as this long, so nobody leaps through a wall. */
export const LONGEST_FRAME = 0.1;
/** Riding faster than this, the camera swings round behind the vehicle, by this many seconds to most of the way. */
export const CHASE_FROM = 1;
export const CHASE = 0.25;
/** A look round holds this long after the last drag, then the chase comes back to full over `LOOK_EASE`. */
export const LOOK_HOLD = 1.5;
export const LOOK_EASE = 1;

/** A walk starting with feet at a point, facing a heading, the camera behind, with vehicles parked about. */
export const startSession = (feet: Vec3, heading: number, vehicles: readonly Vehicle[] = []): Session => {
  const body: Body = { feet, rise: 0, heading, grounded: true };
  return {
    body,
    previous: body,
    vehicles,
    previousVehicles: vehicles,
    riding: null,
    speed: 0,
    orbit: behind(heading),
    spare: 0,
    walked: 0,
    flyer: null,
    sinceLook: Infinity,
  };
};

/** The free camera lifted from where the follow camera is, or landed back on the walker. */
function toggleFlight(session: Session, walls: Walls): Session {
  if (session.flyer) return { ...session, flyer: null };
  const shown = shownOf(session);
  const { eye } = cameraOf(shown.feet, session.orbit, walls, followOf(session));
  return { ...session, flyer: { at: eye, speed: FLY_SPEED } };
}

/** The vehicle being ridden, or null on foot. */
export const ridden = (session: Session): Vehicle | null =>
  session.vehicles.find((v) => v.id === session.riding) ?? null;

/**
 * Getting on the vehicle within reach (a helicopter's engine starting), or off the one ridden once it has nearly
 * stopped (a helicopter once landed); else nothing changes.
 */
function use(session: Session, walls: Walls): Session {
  const vehicle = ridden(session);
  if (vehicle) {
    if (!canLeave(vehicle)) return session;
    const body: Body = { feet: alightFrom(vehicle, walls), rise: 0, heading: vehicle.heading, grounded: true };
    const parked = session.vehicles.map((v) => (v === vehicle ? parkedNow(v) : v));
    return { ...session, body, previous: body, vehicles: parked, previousVehicles: parked, riding: null, speed: 0 };
  }
  if (!session.body.grounded) return session;
  const near = reachable(session.body.feet, session.vehicles);
  if (!near) return session;
  // A two-wheeler shoved over is stood up again, on the walker's ground, to be got on; a helicopter's engine starts.
  const up = (v: Vehicle): Vehicle => {
    if (v !== near || v.kind === "car") return v;
    if (v.kind === "helicopter") return { ...v, heli: started(v.heli) };
    return { ...parkedNow(v), feet: { ...v.feet, y: session.body.feet.y } };
  };
  const vehicles = session.vehicles.map(up);
  return { ...session, vehicles, previousVehicles: session.previousVehicles.map(up), riding: near.id };
}

/**
 * What stops a mover on the walls: every vehicle, or with Rapier's garage the cars and the helicopter (it shoves the
 * two-wheelers aside).
 */
const inTheWay = (vehicles: readonly Vehicle[], garage: Garage | null) =>
  garage ? vehicles.filter((v) => v.kind === "car" || v.kind === "helicopter") : vehicles;

/** The ridden bicycle shifted by the gear steps asked for; anything else as it is. */
function geared(session: Session, steps: number): Session {
  const vehicle = ridden(session);
  if (steps === 0 || vehicle?.kind !== "bicycle") return session;
  const vehicles = session.vehicles.map((v) =>
    v === vehicle ? { ...vehicle, cycle: shift(vehicle.cycle, steps) } : v,
  );
  return { ...session, vehicles };
}

/**
 * Which way a ride moves over its last step: its heading, or the way it went when moving forwards (a car sliding); a
 * helicopter's heading, as it flies any way.
 */
function travelOf(session: Session, previous: Body, body: Body, speed: number): number {
  const vehicle = ridden(session);
  const dx = body.feet.x - previous.feet.x;
  const dz = body.feet.z - previous.feet.z;
  if (!vehicle || vehicle.kind === "helicopter" || vehicle.speed <= 0 || speed <= CHASE_FROM) return body.heading;
  return Math.atan2(-dz, dx);
}

/** A helicopter left with its rotor turning, each step: it spins down. */
const spinning = (vehicle: Vehicle, riding: string | null): vehicle is Helicopter =>
  vehicle.kind === "helicopter" && vehicle.id !== riding && vehicle.heli.rotor > 0;

/**
 * The walk after a frame of `seconds`: the drag turns the camera; getting on or off, if asked; the ridden bicycle's
 * gears; then every whole step due, of the walker or of what it rides, the walker going with it (a car on Rapier's
 * `garage` where there is one, else on its arcade handling); and the camera swinging round behind a ride, the way it
 * moves.
 */
export function advanceSession(
  session: Session,
  controls: Readonly<Controls>,
  seconds: number,
  walls: Walls,
  garage: Garage | null = null,
): Session {
  let orbit = turned(session.orbit, controls.look.dx, controls.look.dy);
  const intents = intentsOf(controls.keys, controls.stick, controls.jump, controls.pad, controls.sink);
  const toggled = controls.fly ? toggleFlight(session, walls) : session;
  const used = controls.use && !toggled.flyer ? use(toggled, walls) : toggled;
  // While the camera flies, the walker and any ride are left alone, and the keys fly the camera.
  const flight = used.flyer
    ? { forward: intents.forward, right: intents.right, up: (intents.jump ? 1 : 0) - (intents.sink ? 1 : 0) }
    : null;
  const steering = flight ? NO_INTENTS : intents;
  let flyer = used.flyer && controls.gears !== 0 ? gearedFlight(used.flyer, controls.gears) : used.flyer;
  let { body, previous, vehicles, previousVehicles, speed, walked } = used.flyer ? used : geared(used, controls.gears);
  let spare = used.spare + Math.min(seconds, LONGEST_FRAME);
  while (spare >= STEP) {
    let next: Body;
    const vehicle = vehicles.find((v) => v.id === used.riding);
    previousVehicles = vehicles;
    if (vehicle?.kind === "car" && garage) {
      // Rapier keeps the car out of the buildings and the other vehicles itself.
      vehicles = garage.drive(vehicles, new Map([[vehicle.id, steering]]), STEP);
      const moved = vehicles.find((v) => v.id === vehicle.id)!;
      next = { feet: moved.feet, rise: 0, heading: moved.heading, grounded: true };
    } else if (vehicle) {
      // Other vehicles are in the way of the one ridden: a bump costs most of its speed, a hard one a rider. With the
      // garage, the parked two-wheelers are shoved by the ridden one's body instead.
      const stepped = stepVehicle(vehicle, steering, STEP, walls);
      const clear = clearOfVehicles(
        stepped.feet,
        VEHICLES[vehicle.kind].radius,
        inTheWay(vehicles, garage),
        vehicle.id,
      );
      const moved = clear.hit ? bumped({ ...stepped, feet: clear.feet }) : stepped;
      vehicles = vehicles.map((v) => (v === vehicle ? moved : v));
      if (garage) vehicles = garage.drive(vehicles, new Map([[vehicle.id, steering]]), STEP);
      next = { feet: moved.feet, rise: 0, heading: moved.heading, grounded: true };
    } else {
      // Vehicles are in a walker's way, as walls are; with the garage, the walker's body shoves two-wheelers aside.
      const stepped = stepWalker(body, steering, orbit.yaw, STEP, walls);
      next = { ...stepped, feet: clearOfVehicles(stepped.feet, PERSON_RADIUS, inTheWay(vehicles, garage), null).feet };
      if (garage) vehicles = garage.drive(vehicles, new Map(), STEP, used.flyer ? null : next.feet);
    }
    if (vehicles.some((v) => spinning(v, used.riding)))
      vehicles = vehicles.map((v) => (spinning(v, used.riding) ? idleHeli(v, STEP) : v));
    const stride = Math.hypot(next.feet.x - body.feet.x, next.feet.z - body.feet.z);
    walked += stride;
    speed = stride / STEP;
    previous = body;
    body = next;
    if (flyer && flight) flyer = stepFlyer(flyer, flight, orbit, STEP);
    spare -= STEP;
  }
  const dragged = controls.look.dx !== 0 || controls.look.dy !== 0;
  const sinceLook = dragged ? 0 : used.sinceLook + seconds;
  const after = { ...used, body, previous, vehicles, previousVehicles, speed, spare, walked, flyer, sinceLook };
  const riding = ridden(after);
  // A helicopter turns on the spot, so the camera comes back behind it at any speed.
  if (riding && (speed > CHASE_FROM || riding.kind === "helicopter") && sinceLook > LOOK_HOLD) {
    // A look round is left alone a while; then the camera comes back behind, gently at first.
    const ease = Math.min(1, (sinceLook - LOOK_HOLD) / LOOK_EASE);
    const chase = VEHICLES[riding.kind].follow.chase ?? CHASE;
    const way = travelOf(after, previous, body, speed);
    const share = (1 - Math.exp(-Math.min(seconds, LONGEST_FRAME) / chase)) * ease * ease;
    orbit = { ...orbit, yaw: orbit.yaw + turnBetween(orbit.yaw, way) * share };
  }
  return { ...after, orbit };
}

const between = (a: number, b: number, share: number) => a + (b - a) * share;
const betweenFeet = (a: Vec3, b: Vec3, share: number): Vec3 => ({
  x: between(a.x, b.x, share),
  y: between(a.y, b.y, share),
  z: between(a.z, b.z, share),
});

/**
 * Where to draw the walker this frame: between its last two steps, as far as the time not yet stepped reaches into the
 * next. Steps come at a fixed rate and frames do not, so drawing the last step itself would jolt it by a step whenever a
 * frame holds one step more or less than the one before; drawn between, it moves exactly as far as each frame lasts.
 */
export function shownOf(session: Session): { readonly feet: Vec3; readonly heading: number; readonly walked: number } {
  const share = session.spare / STEP;
  const { previous: a, body: b } = session;
  return {
    feet: betweenFeet(a.feet, b.feet, share),
    heading: a.heading + turnBetween(a.heading, b.heading) * share,
    // The last step's length is its pace for a step's time.
    walked: session.walked - session.speed * STEP * (1 - share),
  };
}

/** A turn between two others, the short way round (normalised linear interpolation: close enough over one step). */
export function turnBetweenQuats(a: Quat, b: Quat, share: number): Quat {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const q = {
    x: between(a.x, b.x * sign, share),
    y: between(a.y, b.y * sign, share),
    z: between(a.z, b.z * sign, share),
    w: between(a.w, b.w * sign, share),
  };
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

/**
 * Where to draw each vehicle this frame, between its last two steps as the walker is (a car's whole turn, a
 * two-wheeler's lean and pitch, a bicycle's crank too); one that has not moved, as it is. A step keeps the vehicles in
 * their order and kinds, so each is found by its place.
 */
export function shownVehicles(session: Session): Vehicle[] {
  const share = session.spare / STEP;
  return session.vehicles.map((v, i) => {
    const before = session.previousVehicles[i];
    if (!before || before === v) return v;
    const placed = {
      feet: betweenFeet(before.feet, v.feet, share),
      heading: before.heading + turnBetween(before.heading, v.heading) * share,
      steer: between(before.steer, v.steer, share),
    };
    // A vehicle that changed its kind (none does) is shown as it is now.
    if (v.kind === "car")
      return before.kind === "car"
        ? { ...v, ...placed, attitude: turnBetweenQuats(before.attitude, v.attitude, share) }
        : v;
    if (v.kind === "helicopter") {
      if (before.kind !== "helicopter") return v;
      const heli = {
        ...v.heli,
        pitch: between(before.heli.pitch, v.heli.pitch, share),
        roll: between(before.heli.roll, v.heli.roll, share),
        blades: before.heli.blades + turnBetween(before.heli.blades, v.heli.blades) * share,
        tail: before.heli.tail + turnBetween(before.heli.tail, v.heli.tail) * share,
      };
      return { ...v, ...placed, heli };
    }
    if (v.kind === "motorbike") {
      if (before.kind !== "motorbike") return v;
      const moto = {
        ...v.moto,
        lean: between(before.moto.lean, v.moto.lean, share),
        pitch: between(before.moto.pitch, v.moto.pitch, share),
      };
      return { ...v, ...placed, moto };
    }
    if (before.kind !== "bicycle") return v;
    const cycle = {
      ...v.cycle,
      lean: between(before.cycle.lean, v.cycle.lean, share),
      pitch: between(before.cycle.pitch, v.cycle.pitch, share),
      crank: between(before.cycle.crank, v.cycle.crank, share),
    };
    return { ...v, ...placed, cycle };
  });
}

/** How the camera follows: a ride from further back and higher (a car further still the faster it goes); on foot, over
 * the shoulder. */
export const followOf = (session: Session): Follow => {
  const vehicle = ridden(session);
  if (!vehicle) return ON_FOOT;
  const { follow } = VEHICLES[vehicle.kind];
  const stretched = follow.distance + (follow.stretch ?? 0) * Math.abs(vehicle.speed);
  return { ...follow, distance: Math.min(follow.farthest ?? follow.distance, stretched) };
};

/** What pressing E would do now: get on or in a vehicle within reach, or off or out of the one ridden (ready once it
 * has nearly stopped, a helicopter once landed); null when there is nothing to do. */
export interface Prompt {
  readonly action: "enter" | "leave";
  readonly kind: VehicleKind;
  readonly ready: boolean;
}

export function promptOf(session: Session): Prompt | null {
  if (session.flyer) return null;
  const vehicle = ridden(session);
  if (vehicle) return { action: "leave", kind: vehicle.kind, ready: canLeave(vehicle) };
  if (!session.body.grounded) return null;
  const near = reachable(session.body.feet, session.vehicles);
  return near ? { action: "enter", kind: near.kind, ready: true } : null;
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * A prompt in words: "Get in the car", "Get off the bicycle", "Slow down to get out of the car" or "Land to get out of
 * the helicopter".
 */
export function promptWords(prompt: Prompt): string {
  const spec = VEHICLES[prompt.kind];
  if (prompt.action === "enter") return capital(`${spec.enter} ${spec.name}`);
  return prompt.ready ? capital(`${spec.leave} ${spec.name}`) : `${spec.until} ${spec.leave} ${spec.name}`;
}

/** Where the walker stands and faces, on the ground: for the map to come back to. */
export const placeOf = (session: Session) => ({ feet: session.body.feet, ahead: facing(session.body.heading) });
