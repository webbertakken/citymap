// A bicycle that rides like one: a single-track machine whose lean and steering follow the linearised Whipple
// equations of Meijaard et al.'s benchmark bicycle (2007), so self-stability, countersteering and turning by leaning
// come from the physics, not a script. It rides on the single-track core (singletrack.ts) with the benchmark's build,
// a simulated rider balancing it (assisted balance); here is its drivetrain (cadence, gears, freewheel) and both
// brakes, each held to what its tyre holds as the weight moves between the wheels. Pure: no walls here (vehicles.ts
// moves it through the city). Lean and steer positive to the left, turns anticlockwise, as the rest of the walk;
// metres, seconds, newtons.
import {
  balanceOn,
  besideOn,
  fallingOn,
  leanAsked,
  loadsOn,
  matricesOf,
  pitchedOn,
  ridden,
  settled,
  sidewaysOn,
  thrownOn,
  towards,
  turnOn,
  whippleOf,
  type Build,
  type FallCause,
  type Lean,
  type Machine,
  type Single,
} from "./singletrack";
import { GRAVITY, type Intents } from "./walker";

export { DOWN, FALLING, RISING, LYING, SLIDE } from "./singletrack";
export type { Fall, FallCause, Lean } from "./singletrack";

/**
 * The bicycle's own state, beyond where it is: its single-track state (lean, steering, aim, the back wheel lifted under
 * braking, a foot, a fall, the searching), the crank's angle and its speed (zero freewheeling), and the gear.
 */
export interface Cycle extends Single {
  readonly crank: number;
  readonly cadence: number;
  readonly gear: number;
}

/** The benchmark bicycle (Meijaard, Papadopoulos, Ruina and Schwab 2007, table 1): a roadster with an 85 kg rider. */
export const BENCHMARK: Build = {
  wheelbase: 1.02,
  trail: 0.08,
  tilt: Math.PI / 10,
  back: { radius: 0.3, mass: 2, ixx: 0.0603, iyy: 0.12 },
  body: { x: 0.3, z: -0.9, mass: 85, ixx: 9.2, iyy: 11, izz: 2.8, ixz: 2.4 },
  fork: { x: 0.9, z: -0.7, mass: 4, ixx: 0.05892, iyy: 0.06, izz: 0.00708, ixz: -0.00756 },
  front: { radius: 0.35, mass: 3, ixx: 0.1405, iyy: 0.28 },
};

/** Between the wheels' contacts, the front wheel's trail behind the steering axis, and that axis' tilt from upright. */
export const WHEELBASE = 1.02;
export const TRAIL = 0.08;
export const TILT = Math.PI / 10;
/** The bicycle and rider together, and where their middle is: ahead of the back contact, and up (the benchmark's). */
export const MASS = 94;
export const MASS_AHEAD = 0.342;
export const MASS_HEIGHT = 0.861;
/** The bars turn this far either way, and stop. */
export const STEER_STOP = 1;

/** The tightest turn asked for, the most lean asked for (0.68 g, short of grip), and how fast the aim moves. */
export const TURN_RADIUS = 3;
export const MAX_LEAN = 0.6;
export const LEAN_SLEW = 1.5;
/** The rider's balance: steering torque per radian of lean off the aim, per radian a second of lean, per radian off
 * the steer that holds the turn, per radian a second of steer; and the most a rider puts through the bars. */
export const LEAN_GAIN = 30;
export const LEAN_RATE_GAIN = 10;
export const STEER_GAIN = 5;
export const STEER_DAMPING = 1;
export const STEER_TORQUE_MOST = 25;
/** At walking pace the rider's body helps, by this torque per radian off the aim and per radian a second, fading out by
 * `ASSIST_UNTIL`: no steering holds a bicycle up below about 1.5 m/s. */
export const ASSIST_LEAN = 1500;
export const ASSIST_DAMPING = 300;
export const ASSIST_UNTIL = 4;
/** The rider's searching at walking pace: a steering torque this strong at a standstill, at this rate, gone by
 * `WOBBLE_FROM`. */
export const WOBBLE_TORQUE = 6;
export const WOBBLE_HZ = 1.2;
export const WOBBLE_FROM = 3;

/** Wheel turns per crank turn, a city bicycle's seven, the third to start; the wheels' radius. */
export const GEARS = [1.2, 1.5, 1.8, 2.2, 2.6, 3.1, 3.6] as const;
export const START_GEAR = 2;
export const WHEEL_RADIUS = 0.337;
/** The rider's push on the crank: this torque from a standstill, falling to none at this crank speed (140 rpm). */
export const TORQUE_MOST = 150;
export const CADENCE_MOST = (140 * 2 * Math.PI) / 60;
/** Rolling resistance (a share of the weight), the air's density and the rider's drag area. */
export const ROLLING = 0.006;
export const AIR_DENSITY = 1.2;
export const DRAG_AREA = 0.5;
/** The most each brake asks of its tyre, in newtons, and how much of the load a tyre holds. */
export const REAR_BRAKE = 600;
export const FRONT_BRAKE = 850;
export const GRIP = 0.9;
/** Turning harder than this (m/s² sideways), a skidding tyre slides the bicycle from under its rider. */
export const LEANED = 2;
/** The loads and the braking they allow are found together by halving this many times (to a micrometre a second²). */
export const LOAD_ROUNDS = 26;
/** Lifted under braking, the rider holds the back wheel at this pitch, short of going over the bars (0.67 rad). */
export const STOPPIE_MOST = 0.3;

/**
 * A foot goes down below this speed and comes up above that; down, the bicycle leans onto it at a stop (less as it gets
 * going), the bars as asked.
 */
export const FOOT_DOWN = 0.6;
export const FOOT_UP = 1.2;
export const FOOT_LEAN = 0.12;
export const FOOT_EASE = 1;
export const FOOT_STEER = 0.6;
export const BAR_EASE = 4;
/** Stopped, the back brake walks the bicycle backwards, up to this speed at this rate. */
export const WALK_BACK = 0.8;
export const WALK_BACK_RATE = 2;

/** Leaned past this, it falls; a hit this fast throws the rider. */
export const FALL_LEAN = 0.9;
export const HARD_HIT = 3;

/** The benchmark bicycle as the core rides it, with its rider; its middle as the paper rounds it. */
export const BICYCLE: Machine = {
  matrices: matricesOf(BENCHMARK, GRAVITY),
  wheelbase: WHEELBASE,
  trail: TRAIL,
  tilt: TILT,
  steerStop: STEER_STOP,
  mass: MASS,
  massAhead: MASS_AHEAD,
  massHeight: MASS_HEIGHT,
  grip: GRIP,
  leaned: LEANED,
  stoppieMost: STOPPIE_MOST,
  // Pedalled, it never lifts its front wheel.
  wheelieMost: 0,
  fallLean: FALL_LEAN,
  rider: {
    turnRadius: TURN_RADIUS,
    maxLean: MAX_LEAN,
    leanSlew: LEAN_SLEW,
    leanGain: LEAN_GAIN,
    leanRateGain: LEAN_RATE_GAIN,
    steerGain: STEER_GAIN,
    steerDamping: STEER_DAMPING,
    torqueMost: STEER_TORQUE_MOST,
    assistLean: ASSIST_LEAN,
    assistDamping: ASSIST_DAMPING,
    assistUntil: ASSIST_UNTIL,
    wobbleTorque: WOBBLE_TORQUE,
    wobbleHz: WOBBLE_HZ,
    wobbleFrom: WOBBLE_FROM,
    foot: { down: FOOT_DOWN, up: FOOT_UP, lean: FOOT_LEAN, ease: FOOT_EASE, steer: FOOT_STEER, barEase: BAR_EASE },
  },
};

/** A bicycle standing still, upright, on a foot, in a gear, its crank at an angle. */
export const resting = (gear = START_GEAR, crank = 0): Cycle => ({
  lean: 0,
  leanRate: 0,
  steer: 0,
  steerRate: 0,
  aim: 0,
  crank,
  cadence: 0,
  gear,
  pitch: 0,
  pitchRate: 0,
  footDown: true,
  fall: null,
  wobble: 0,
});

/** One step of the bare bicycle at a speed, a lean torque (the rider's body) and a steering torque (the bars). */
export const whipple = (q: Lean, speed: number, leanTorque: number, steerTorque: number, dt: number): Lean =>
  whippleOf(BICYCLE, q, speed, leanTorque, steerTorque, dt);

/** How fast it turns (anticlockwise, radians a second) at a speed, for its steer: the front wheel's path. */
export const turnOf = (q: Lean, speed: number) => turnOn(BICYCLE, q, speed);

/** The lean a turn asks for (right positive asks a right turn): what holds a turn of the radius asked at this speed. */
export const aimedLean = (right: number, speed: number) => leanAsked(BICYCLE, right, speed);

/** One step of the bicycle's balance at a speed, asked to turn `right`. */
export const balanced = (cycle: Cycle, speed: number, right: number, dt: number): Cycle =>
  balanceOn(BICYCLE, cycle, speed, right, dt);

/** How the weight sits on each wheel, in newtons, accelerating at `a` (forwards positive). */
export const loadsOf = (a: number) => loadsOn(BICYCLE, a);

/** The bicycle thrown down at a speed, falling the way it leans (left when upright); the crank stops. */
export const thrown = (cycle: Cycle, cause: FallCause, speed: number): Cycle => ({
  ...thrownOn(cycle, cause, speed),
  cadence: 0,
});

/** The gear moved by `steps` (up positive), no further than its first and last. */
export const shift = (cycle: Cycle, steps: number): Cycle => ({
  ...cycle,
  gear: Math.max(0, Math.min(GEARS.length - 1, cycle.gear + steps)),
});

/**
 * One step of the speed, turning with a sideways acceleration `sideways`: pedalling through the gear and both brakes,
 * each held to what its tyre holds of its load beside the turn (its friction circle), rolling resistance and the air;
 * brakes never reverse it. A brake asking more than its tyre holds skids upright, and slides the bicycle from under
 * its rider leaned over. Stopped on a foot, the back brake walks it back. The crank turns with the back wheel while
 * pedalling and holds while freewheeling; the back wheel lifts under hard braking.
 */
function driven(cycle: Cycle, speed: number, sideways: number, intents: Intents, dt: number) {
  const ratio = GEARS[cycle.gear]! * WHEEL_RADIUS;
  const pedalling = intents.forward > 0;
  const crankSpeed = Math.max(0, speed) / ratio;
  const torque = pedalling ? intents.forward * TORQUE_MOST * Math.max(0, 1 - crankSpeed / CADENCE_MOST) : 0;
  const crank = pedalling ? { crank: cycle.crank + crankSpeed * dt, cadence: crankSpeed } : { cadence: 0 };
  if (speed < 0 || (speed === 0 && cycle.footDown && intents.forward < 0)) {
    const back = intents.forward < 0 && !intents.jump ? -WALK_BACK * -intents.forward : 0;
    return { ...crank, speed: towards(speed, back, WALK_BACK_RATE * dt), pitch: 0, pitchRate: 0, slid: false };
  }
  const lifted = cycle.pitch > 0;
  const resistance = speed > 0 ? ROLLING * MASS * GRAVITY + 0.5 * AIR_DENSITY * DRAG_AREA * speed * speed : 0;
  const asked = {
    drive: torque / ratio,
    back: speed > 0 && intents.forward < 0 ? -intents.forward * REAR_BRAKE : 0,
    front: speed > 0 && intents.jump ? FRONT_BRAKE : 0,
  };
  const beside = besideOn(BICYCLE, sideways);
  const held = (accel: number) => {
    const loads = lifted ? { front: MASS * GRAVITY, back: 0 } : loadsOf(accel);
    return { front: beside * loads.front, back: beside * loads.back };
  };
  const net = (accel: number) => {
    const tyres = held(accel);
    const braking = Math.min(asked.back, tyres.back) + Math.min(asked.front, tyres.front);
    return (Math.min(asked.drive, tyres.back) - braking - resistance) / MASS;
  };
  const accel = settled(net, GRAVITY, LOAD_ROUNDS);
  const tyres = held(accel);
  const skidding = asked.back > tyres.back || asked.front > tyres.front;
  const next = speed + accel * dt;
  const stopped = speed > 0 && next < 0 ? 0 : next;
  return {
    ...crank,
    speed: stopped,
    ...pitchedOn(BICYCLE, cycle, stopped > 0 ? accel : 0, dt),
    slid: skidding && Math.abs(sideways) > LEANED,
  };
}

/**
 * One step of the ridden bicycle under intents: a fall plays out; else the speed, the foot, the balance and the turn,
 * then whether the tyres held the turn and the brakes together, and whether it leaned past saving.
 */
export function rideCycle(
  cycle: Cycle,
  speed: number,
  intents: Intents,
  dt: number,
): { readonly cycle: Cycle; readonly speed: number; readonly turn: number } {
  if (cycle.fall) {
    const fell = fallingOn(BICYCLE, cycle, cycle.fall, speed, dt, (c) => resting(c.gear, c.crank));
    return { cycle: fell.state, speed: fell.speed, turn: fell.turn };
  }
  const { slid, speed: next, ...drive } = driven(cycle, speed, sidewaysOn(BICYCLE, cycle.lean, speed), intents, dt);
  const rode = ridden(BICYCLE, { ...cycle, ...drive }, next, intents.right, slid, dt);
  return {
    cycle: rode.state.fall && !cycle.fall ? { ...rode.state, cadence: 0 } : rode.state,
    speed: next,
    turn: rode.turn,
  };
}

/** What the HUD shows: speed in km/h, the gear counted from one of so many, and the cadence in turns a minute. */
export interface Hud {
  readonly speed: number;
  readonly gear: number;
  readonly gears: number;
  readonly cadence: number;
}

export const hudOf = (cycle: Cycle, speed: number): Hud => ({
  speed: Math.round(Math.abs(speed) * 3.6),
  gear: cycle.gear + 1,
  gears: GEARS.length,
  cadence: Math.round((cycle.cadence * 60) / (2 * Math.PI)),
});
