// A walk through the city, frame by frame: what the devices hold, the walker and the vehicles they move, and the camera.
// Everything steps at a fixed rate, whatever the screen's, so a walk is the same on every device. Metres.
import { PERSON_RADIUS, type Vec3, type Walls } from "@citymap/world";
import { ON_FOOT, behind, turned, type Follow, type Orbit } from "./camera";
import { intentsOf, type Stick } from "./input";
import {
  BUMP,
  LEAVE_SPEED,
  VEHICLES,
  alightFrom,
  clearOfVehicles,
  reachable,
  stepVehicle,
  type Vehicle,
  type VehicleKind,
} from "./vehicles";
import { facing, stepWalker, turnBetween, type Body } from "./walker";

/** What the devices hold now: the view's listeners write it, each frame reads it. */
export interface Controls {
  readonly keys: Set<string>;
  stick: Stick | null;
  jump: boolean;
  /** Pixels dragged since the last frame. */
  look: { dx: number; dy: number };
  /** Getting on or off was asked for since the last frame. */
  use: boolean;
}

export const newControls = (): Controls => ({
  keys: new Set(),
  stick: null,
  jump: false,
  look: { dx: 0, dy: 0 },
  use: false,
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
}

/** Everything steps 120 times a second. */
export const STEP = 1 / 120;
/** A frame longer than this (a tab in the background, a pause) counts as this long, so nobody leaps through a wall. */
export const LONGEST_FRAME = 0.1;
/** Riding faster than this, the camera swings round behind the vehicle, by this many seconds to most of the way. */
export const CHASE_FROM = 1;
export const CHASE = 0.25;

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
  };
};

/** The vehicle being ridden, or null on foot. */
export const ridden = (session: Session): Vehicle | null =>
  session.vehicles.find((v) => v.id === session.riding) ?? null;

/** Getting on the vehicle within reach, or off the one ridden once it has nearly stopped; else nothing changes. */
function use(session: Session, walls: Walls): Session {
  const vehicle = ridden(session);
  if (vehicle) {
    if (Math.abs(vehicle.speed) >= LEAVE_SPEED) return session;
    const body: Body = { feet: alightFrom(vehicle, walls), rise: 0, heading: vehicle.heading, grounded: true };
    const parked = session.vehicles.map((v) => (v === vehicle ? { ...v, speed: 0, turn: 0, steer: 0 } : v));
    return { ...session, body, previous: body, vehicles: parked, previousVehicles: parked, riding: null, speed: 0 };
  }
  if (!session.body.grounded) return session;
  const near = reachable(session.body.feet, session.vehicles);
  return near ? { ...session, riding: near.id } : session;
}

/**
 * The walk after a frame of `seconds`: the drag turns the camera; getting on or off, if asked; then every whole step
 * due, of the walker or of what it rides, the walker going with it; and the camera swinging round behind a ride.
 */
export function advanceSession(session: Session, controls: Readonly<Controls>, seconds: number, walls: Walls): Session {
  let orbit = turned(session.orbit, controls.look.dx, controls.look.dy);
  const intents = intentsOf(controls.keys, controls.stick, controls.jump);
  const used = controls.use ? use(session, walls) : session;
  let { body, previous, vehicles, previousVehicles, speed, walked } = used;
  let spare = used.spare + Math.min(seconds, LONGEST_FRAME);
  while (spare >= STEP) {
    let next: Body;
    const vehicle = vehicles.find((v) => v.id === used.riding);
    previousVehicles = vehicles;
    if (vehicle) {
      // Other vehicles are in the way of the one ridden: a bump costs most of its speed.
      const stepped = stepVehicle(vehicle, intents, STEP, walls);
      const clear = clearOfVehicles(stepped.feet, VEHICLES[vehicle.kind].radius, vehicles, vehicle.id);
      const moved = { ...stepped, feet: clear.feet, speed: clear.hit ? stepped.speed * BUMP : stepped.speed };
      vehicles = vehicles.map((v) => (v === vehicle ? moved : v));
      next = { feet: moved.feet, rise: 0, heading: moved.heading, grounded: true };
    } else {
      // Vehicles are in a walker's way, as walls are.
      const stepped = stepWalker(body, intents, orbit.yaw, STEP, walls);
      next = { ...stepped, feet: clearOfVehicles(stepped.feet, PERSON_RADIUS, vehicles, null).feet };
    }
    const stride = Math.hypot(next.feet.x - body.feet.x, next.feet.z - body.feet.z);
    walked += stride;
    speed = stride / STEP;
    previous = body;
    body = next;
    spare -= STEP;
  }
  const dragged = controls.look.dx !== 0 || controls.look.dy !== 0;
  if (used.riding && speed > CHASE_FROM && !dragged)
    orbit = {
      ...orbit,
      yaw: orbit.yaw + turnBetween(orbit.yaw, body.heading) * (1 - Math.exp(-Math.min(seconds, LONGEST_FRAME) / CHASE)),
    };
  return { ...used, body, previous, vehicles, previousVehicles, speed, orbit, spare, walked };
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

/** Where to draw each vehicle this frame, between its last two steps as the walker is. */
export function shownVehicles(session: Session): Vehicle[] {
  const share = session.spare / STEP;
  return session.vehicles.map((v) => {
    const before = session.previousVehicles.find((p) => p.id === v.id) ?? v;
    return {
      ...v,
      feet: betweenFeet(before.feet, v.feet, share),
      heading: before.heading + turnBetween(before.heading, v.heading) * share,
    };
  });
}

/** How the camera follows: a ride from further back and higher; on foot, over the shoulder. */
export const followOf = (session: Session): Follow => {
  const vehicle = ridden(session);
  return vehicle ? VEHICLES[vehicle.kind].follow : ON_FOOT;
};

/** What pressing E would do now: get on or in a vehicle within reach, or off or out of the one ridden (ready once it
 * has nearly stopped); null when there is nothing to do. */
export interface Prompt {
  readonly action: "enter" | "leave";
  readonly kind: VehicleKind;
  readonly ready: boolean;
}

export function promptOf(session: Session): Prompt | null {
  const vehicle = ridden(session);
  if (vehicle) return { action: "leave", kind: vehicle.kind, ready: Math.abs(vehicle.speed) < LEAVE_SPEED };
  if (!session.body.grounded) return null;
  const near = reachable(session.body.feet, session.vehicles);
  return near ? { action: "enter", kind: near.kind, ready: true } : null;
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** A prompt in words: "Get in the car", "Get off the bicycle", or "Slow down to get out of the car". */
export function promptWords(prompt: Prompt): string {
  const spec = VEHICLES[prompt.kind];
  if (prompt.action === "enter") return capital(`${spec.enter} ${spec.name}`);
  return prompt.ready ? capital(`${spec.leave} ${spec.name}`) : `Slow down to ${spec.leave} ${spec.name}`;
}

/** Where the walker stands and faces, on the ground: for the map to come back to. */
export const placeOf = (session: Session) => ({ feet: session.body.feet, ahead: facing(session.body.heading) });
