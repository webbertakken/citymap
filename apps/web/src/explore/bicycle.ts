// A bicycle that rides like one: a single-track machine whose lean and steering follow the linearised Whipple
// equations of Meijaard et al.'s benchmark bicycle (2007), so self-stability, countersteering and turning by leaning
// come from the physics, not a script. A simulated rider balances it (assisted balance): steering asks for a turn, the
// rider leans into it by torque on the bars, and at walking pace helps with the body. A drivetrain (cadence, gears,
// freewheel), both brakes with the weight moving between the wheels, the tyres' grip, a foot at a stop, and falls.
// Pure: no walls here (vehicles.ts moves it through the city). Lean and steer positive to the left, turns
// anticlockwise, as the rest of the walk; metres, seconds, newtons. The benchmark's equations are linear, so flipping
// both its coordinates (its lean and steer are positive to the right) leaves its matrices as published.
import { GRAVITY, type Intents } from "./walker";

/** The bicycle's lean and steering: angles in radians and their rates, positive to the left. */
export interface Lean {
  readonly lean: number;
  readonly leanRate: number;
  readonly steer: number;
  readonly steerRate: number;
}

/** Why a rider came off: a hard hit, asking more of the tyres than they hold, or leaning past saving. */
export type FallCause = "hit" | "grip" | "lean";

/** A fall: seconds since the rider was thrown, the side it fell to (1 left, −1 right), why, and how fast it was going. */
export interface Fall {
  readonly time: number;
  readonly side: 1 | -1;
  readonly cause: FallCause;
  readonly speed: number;
}

/**
 * The bicycle's own state, beyond where it is: its lean and steering, the lean the rider aims at, the crank's angle and
 * its speed (zero freewheeling), the gear, the back wheel lifted under braking (about the front contact), whether a foot
 * is down, a fall under way, and the phase of the rider's searching at walking pace.
 */
export interface Cycle extends Lean {
  readonly aim: number;
  readonly crank: number;
  readonly cadence: number;
  readonly gear: number;
  readonly pitch: number;
  readonly pitchRate: number;
  readonly footDown: boolean;
  readonly fall: Fall | null;
  readonly wobble: number;
}

// The benchmark bicycle (Meijaard, Papadopoulos, Ruina and Schwab 2007, table 2): a roadster with an 85 kg rider.
const M = [
  [80.81722, 2.31941332208709],
  [2.31941332208709, 0.29784188199686],
] as const;
const C1 = [
  [0, 33.86641391492494],
  [-0.85035641456978, 1.6854039739756],
] as const;
const K0 = [
  [-80.95, -2.59951685249872],
  [-2.59951685249872, -0.80329488458618],
] as const;
const K2 = [
  [0, 76.59734589573222],
  [0, 2.65431523794604],
] as const;
const DET = M[0][0] * M[1][1] - M[0][1] * M[1][0];

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
const LOAD_ROUNDS = 26;
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
/** Fallen: it slides to a stop at this share of g, lies on its side at this lean, reached over `FALLING`, left over the
 * last `RISING` of `DOWN` seconds, when the rider is back up. */
export const SLIDE = 0.5;
export const LYING = 1.35;
export const FALLING = 0.4;
export const RISING = 0.6;
export const DOWN = 2.5;

const clamp = (value: number, most: number) => Math.max(-most, Math.min(most, value));
const towards = (value: number, target: number, step: number) =>
  value < target ? Math.min(target, value + step) : Math.max(target, value - step);

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

/** The benchmark's stiffness at a speed: gravity's pull and the speed's, on lean (row 0) and steer (row 1). */
export const stiffness = (speed: number) =>
  [
    [GRAVITY * K0[0][0] + speed * speed * K2[0][0], GRAVITY * K0[0][1] + speed * speed * K2[0][1]],
    [GRAVITY * K0[1][0] + speed * speed * K2[1][0], GRAVITY * K0[1][1] + speed * speed * K2[1][1]],
  ] as const;

/**
 * One step of the bare bicycle at a speed: M q̈ + v C1 q̇ + (g K0 + v² K2) q = T, a lean torque (the rider's body) and a
 * steering torque (the bars), by semi-implicit Euler; the bars stop at `STEER_STOP`.
 */
export function whipple(q: Lean, speed: number, leanTorque: number, steerTorque: number, dt: number): Lean {
  const k = stiffness(speed);
  const f0 =
    leanTorque - speed * (C1[0][0] * q.leanRate + C1[0][1] * q.steerRate) - (k[0][0] * q.lean + k[0][1] * q.steer);
  const f1 =
    steerTorque - speed * (C1[1][0] * q.leanRate + C1[1][1] * q.steerRate) - (k[1][0] * q.lean + k[1][1] * q.steer);
  const leanRate = q.leanRate + ((M[1][1] * f0 - M[0][1] * f1) / DET) * dt;
  let steerRate = q.steerRate + ((M[0][0] * f1 - M[1][0] * f0) / DET) * dt;
  let steer = q.steer + steerRate * dt;
  if (Math.abs(steer) >= STEER_STOP) {
    steer = Math.sign(steer) * STEER_STOP;
    steerRate = 0;
  }
  return { lean: q.lean + leanRate * dt, leanRate, steer, steerRate };
}

/** How fast it turns (anticlockwise, radians a second) at a speed, for its steer: the front wheel's path. */
export const turnOf = (q: Lean, speed: number) =>
  ((speed * q.steer + TRAIL * q.steerRate) * Math.cos(TILT)) / WHEELBASE;

/** The lean a turn asks for (right positive asks a right turn): what holds a turn of the radius asked at this speed. */
export const aimedLean = (right: number, speed: number) =>
  -clamp(Math.atan((speed * speed * right) / (TURN_RADIUS * GRAVITY)), MAX_LEAN);

/**
 * The rider's steering torque towards the lean aimed at: what holds the turn that lean makes (the steady turn's steer
 * and torque), and more for being off the lean, falling, and off that steer.
 */
function riderTorque(cycle: Cycle, speed: number): number {
  const k = stiffness(speed);
  const held = clamp((-k[0][0] * cycle.aim) / k[0][1], STEER_STOP);
  const holding = k[1][0] * cycle.aim + k[1][1] * held;
  return clamp(
    holding +
      LEAN_GAIN * (cycle.lean - cycle.aim) +
      LEAN_RATE_GAIN * cycle.leanRate +
      STEER_GAIN * (held - cycle.steer) -
      STEER_DAMPING * cycle.steerRate,
    STEER_TORQUE_MOST,
  );
}

/**
 * One step of the bicycle's balance at a speed, asked to turn `right`: on a foot, it leans onto it and the bars turn as
 * asked; riding, the rider aims at a lean and steers for it, the body helps at walking pace, and the bars search.
 */
export function balanced(cycle: Cycle, speed: number, right: number, dt: number): Cycle {
  if (cycle.footDown) {
    const steer = towards(cycle.steer, -right * FOOT_STEER, BAR_EASE * dt);
    // Pushing off, the rider comes upright, so the bicycle leaves the foot balanced and holds its line.
    const lean = towards(cycle.lean, FOOT_LEAN * Math.max(0, 1 - speed / FOOT_UP), FOOT_EASE * dt);
    return { ...cycle, lean, leanRate: 0, steer, steerRate: (steer - cycle.steer) / dt, aim: lean };
  }
  const aim = towards(cycle.aim, aimedLean(right, speed), LEAN_SLEW * dt);
  const aiming = { ...cycle, aim };
  const fade = Math.max(0, 1 - speed / ASSIST_UNTIL);
  const body = -fade * (ASSIST_LEAN * (cycle.lean - aim) + ASSIST_DAMPING * cycle.leanRate);
  const wobble = cycle.wobble + dt;
  const searching =
    WOBBLE_TORQUE * Math.max(0, 1 - speed / WOBBLE_FROM) ** 2 * Math.sin(2 * Math.PI * WOBBLE_HZ * wobble);
  return { ...aiming, ...whipple(cycle, speed, body, riderTorque(aiming, speed) + searching, dt), wobble };
}

/**
 * How the weight sits on each wheel, in newtons, accelerating at `a` (forwards positive): braking moves it forwards,
 * until all of it is on the front and the back wheel would lift.
 */
export function loadsOf(a: number): { readonly front: number; readonly back: number } {
  const weight = MASS * GRAVITY;
  const back = (MASS * (GRAVITY * (WHEELBASE - MASS_AHEAD) + a * MASS_HEIGHT)) / WHEELBASE;
  const held = Math.max(0, Math.min(weight, back));
  return { front: weight - held, back: held };
}

/** The bicycle thrown down at a speed, falling the way it leans (left when upright). */
export function thrown(cycle: Cycle, cause: FallCause, speed: number): Cycle {
  const side = cycle.lean < 0 ? -1 : 1;
  return { ...cycle, fall: { time: 0, side, cause, speed: Math.abs(speed) }, cadence: 0, pitch: 0, pitchRate: 0 };
}

/** The gear moved by `steps` (up positive), no further than its first and last. */
export const shift = (cycle: Cycle, steps: number): Cycle => ({
  ...cycle,
  gear: Math.max(0, Math.min(GEARS.length - 1, cycle.gear + steps)),
});

/** One step of a fall: it slides to a stop on its side, lies, and rises; then the rider is back up, a foot down. */
function falling(cycle: Cycle, fall: Fall, speed: number, dt: number) {
  const time = fall.time + dt;
  if (time >= DOWN) return { cycle: resting(cycle.gear, cycle.crank), speed: 0, turn: 0 };
  const down = Math.min(1, time / FALLING, (DOWN - time) / RISING);
  const lean = fall.side * LYING * down;
  const slid = towards(speed, 0, SLIDE * GRAVITY * dt);
  return {
    cycle: { ...cycle, lean, leanRate: 0, steerRate: 0, aim: lean, fall: { ...fall, time } },
    speed: slid,
    turn: 0,
  };
}

/** One step of the back wheel lifting about the front contact under a deceleration, held by the rider and the road. */
function pitched(cycle: Cycle, deceleration: number, dt: number) {
  const behind = WHEELBASE - MASS_AHEAD;
  const { pitch } = cycle;
  const height = behind * Math.sin(pitch) + MASS_HEIGHT * Math.cos(pitch);
  const arm = behind * Math.cos(pitch) - MASS_HEIGHT * Math.sin(pitch);
  const accel = (deceleration * height - GRAVITY * arm) / (behind * behind + MASS_HEIGHT * MASS_HEIGHT);
  const rate = cycle.pitchRate + accel * dt;
  const next = pitch + rate * dt;
  if (next <= 0) return { pitch: 0, pitchRate: 0 };
  if (next >= STOPPIE_MOST) return { pitch: STOPPIE_MOST, pitchRate: Math.min(0, rate) };
  return { pitch: next, pitchRate: rate };
}

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
  // What a tyre holds along its way, of its load, beside what the turn already takes of it.
  const beside = Math.sqrt(Math.max(0, GRIP * GRIP - (sideways / GRAVITY) ** 2));
  const held = (accel: number) => {
    const loads = lifted ? { front: MASS * GRAVITY, back: 0 } : loadsOf(accel);
    return { front: beside * loads.front, back: beside * loads.back };
  };
  const net = (accel: number) => {
    const tyres = held(accel);
    const braking = Math.min(asked.back, tyres.back) + Math.min(asked.front, tyres.front);
    return (Math.min(asked.drive, tyres.back) - braking - resistance) / MASS;
  };
  // The loads depend on the acceleration they allow. net(a) − a falls as a rises (a tyre's hold moves at most
  // GRIP · h / w < 1 of the acceleration), so the one acceleration that gives itself is found by halving.
  let low = -3 * GRAVITY;
  let high = 3 * GRAVITY;
  for (let i = 0; i < LOAD_ROUNDS; i++) {
    const mid = (low + high) / 2;
    if (net(mid) > mid) low = mid;
    else high = mid;
  }
  // Its own net force at that acceleration: exactly nothing when nothing pushes or holds it.
  const accel = net((low + high) / 2);
  const tyres = held(accel);
  const skidding = asked.back > tyres.back || asked.front > tyres.front;
  const next = speed + accel * dt;
  const stopped = speed > 0 && next < 0 ? 0 : next;
  const deceleration = stopped > 0 ? -accel : 0;
  return {
    ...crank,
    speed: stopped,
    ...pitched(cycle, deceleration, dt),
    slid: skidding && Math.abs(sideways) > LEANED,
  };
}

/**
 * What the tyres hold sideways in a turn, in m/s²: what a lean balances, g tan φ. Below a walking pace a lean is the
 * bicycle falling over, not turning, and asks nothing of them. (The path's own curvature, v times the turn, spikes as
 * the rider countersteers, while the tyres' load follows the lean.)
 */
const sidewaysOf = (lean: number, speed: number) => (Math.abs(speed) > FOOT_UP ? GRAVITY * Math.tan(lean) : 0);

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
  if (cycle.fall) return falling(cycle, cycle.fall, speed, dt);
  const { slid, speed: next, ...drive } = driven(cycle, speed, sidewaysOf(cycle.lean, speed), intents, dt);
  const footDown = cycle.footDown ? Math.abs(next) < FOOT_UP : Math.abs(next) < FOOT_DOWN;
  const balance = balanced({ ...cycle, ...drive, footDown }, Math.max(0, next), intents.right, dt);
  const turn = turnOf(balance, next);
  const overGrip = slid || Math.abs(sidewaysOf(balance.lean, next)) > GRIP * GRAVITY;
  const fallen =
    Math.abs(balance.lean) > FALL_LEAN
      ? thrown(balance, "lean", next)
      : overGrip
        ? thrown(balance, "grip", next)
        : balance;
  return { cycle: fallen, speed: next, turn: fallen.fall ? 0 : turn };
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
