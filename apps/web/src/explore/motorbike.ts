// The motorbike: a chopper on the bicycle's single-track core (singletrack.ts), its Whipple matrices worked out from
// its own build, so it leans, countersteers and falls as the bicycle does, heavier and raked out. An engine pulls it
// by its torque curve through an automatic five-speed gearbox; S brakes the back wheel and Space the front, each held to
// what its tyre holds as the weight moves (its long wheelbase slides the front tyre before the back wheel would lift);
// pulling away hard in first lifts the front wheel, which the rider holds short of going over, in first until the
// limiter lets it down. Pure: vehicles.ts moves it through the city. Metres, seconds, newtons.
import { automatic, driveOf, rpmOf, type Engine, type Gearbox } from "./engine";
import {
  besideOn,
  fallingOn,
  loadsOn,
  machineOf,
  pitchedOn,
  ridden,
  settled,
  sidewaysOn,
  thrownOn,
  towards,
  upright,
  type Build,
  type FallCause,
  type Single,
} from "./singletrack";
import { GRAVITY, type Intents } from "./walker";

/**
 * A chopper and its rider, as the core's build: a long wheelbase, a raked fork with a long trail, 312 kg in all, its
 * middle low and set back (the rider sits back on it), so a hard pull in first lifts the front wheel.
 */
export const CHOPPER: Build = {
  wheelbase: 1.6,
  trail: 0.12,
  tilt: 0.5,
  back: { radius: 0.33, mass: 14, ixx: 0.45, iyy: 0.9 },
  body: { x: 0.6, z: -0.75, mass: 270, ixx: 26, iyy: 50, izz: 26, ixz: 3 },
  fork: { x: 1.4, z: -0.85, mass: 14, ixx: 1, iyy: 0.8, izz: 0.4, ixz: -0.2 },
  front: { radius: 0.33, mass: 14, ixx: 0.45, iyy: 0.9 },
};

/** Its wheels' radius. */
export const MOTO_WHEEL = 0.33;

/** The motorbike as the core rides it: a heavier rider's gains, a bigger lean asked at speed, and road tyres. */
export const MOTORBIKE = machineOf(CHOPPER, GRAVITY, {
  steerStop: 0.7,
  grip: 1.1,
  leaned: 2,
  stoppieMost: 0.25,
  wheelieMost: 0.6,
  fallLean: 1,
  rider: {
    turnRadius: 8,
    maxLean: 0.75,
    leanSlew: 1.5,
    leanGain: 120,
    leanRateGain: 40,
    steerGain: 20,
    steerDamping: 4,
    torqueMost: 120,
    assistLean: 5000,
    assistDamping: 1000,
    assistUntil: 4,
    wobbleTorque: 0,
    wobbleHz: 1,
    wobbleFrom: 1,
    foot: { down: 0.8, up: 1.6, lean: 0.1, ease: 1, steer: 0.5, barEase: 3 },
  },
});

/** A V-twin: strongest low down, done by 5,800 rpm. */
export const MOTO_ENGINE: Engine = {
  idle: 1000,
  redline: 5800,
  curve: [
    [1000, 80],
    [2500, 100],
    [3500, 105],
    [5000, 90],
    [5800, 70],
  ],
  braking: 20,
  launch: 2500,
};

/** Five gears, each overall (primary, gear and chain); no reverse: the rider paddles it back. */
export const MOTO_GEARBOX: Gearbox = { ratios: [12.5, 8.6, 6.6, 5.4, 4.6], reverse: 0, up: 5300, down: 2200 };

/** The most each brake asks of its tyre, in newtons. */
export const MOTO_REAR_BRAKE = 1800;
export const MOTO_FRONT_BRAKE = 4000;
/** Rolling resistance (a share of the weight), and the rider and machine's drag area, in the air's density. */
export const MOTO_ROLLING = 0.015;
export const MOTO_DRAG_AREA = 0.6;
export const AIR_DENSITY = 1.2;
/** The throttle opens and closes at this rate a second: a twist of the wrist. */
export const THROTTLE_RATE = 4;
/** Stopped, the back brake paddles it backwards, up to this speed at this rate. */
export const PADDLE_BACK = 0.6;
export const PADDLE_RATE = 1.5;
/** The loads and the drive they allow are found together by halving this many times. */
const ROUNDS = 26;

/** The motorbike's own state: its single-track state, its gear, its engine's speed and its throttle. */
export interface Moto extends Single {
  readonly gear: number;
  readonly rpm: number;
  readonly throttle: number;
}

/** A motorbike standing still, upright on a foot, in first, idling. */
export const parkedMoto = (): Moto => ({ ...upright(), gear: 0, rpm: MOTO_ENGINE.idle, throttle: 0 });

/** The motorbike thrown down at a speed, falling the way it leans; the throttle shuts. */
export const thrownMoto = (moto: Moto, cause: FallCause, speed: number): Moto => ({
  ...thrownOn(moto, cause, speed),
  throttle: 0,
});

/**
 * One step of the speed, turning with a sideways acceleration: the engine through its gear (which changes by itself)
 * and both brakes, each held to what its tyre holds of its load beside the turn, rolling resistance and the air; brakes
 * never reverse it. A wheel lifted carries none of the weight: the front under power, the back under braking. Stopped
 * on a foot, the back brake paddles it back.
 */
function driven(moto: Moto, speed: number, sideways: number, intents: Intents, dt: number) {
  const throttle = towards(moto.throttle, Math.max(0, intents.forward), THROTTLE_RATE * dt);
  // With the front wheel up the rider holds the gear: the limiter at the red line lets the front down, then it shifts.
  const gear =
    moto.pitch < 0
      ? moto.gear
      : automatic(MOTO_GEARBOX, moto.gear, rpmOf(speed, MOTO_WHEEL, MOTO_GEARBOX.ratios[moto.gear]!));
  const drive = driveOf(MOTO_ENGINE, MOTO_GEARBOX.ratios[gear]!, MOTO_WHEEL, speed, throttle);
  const engine = { gear, rpm: drive.rpm, throttle };
  if (speed < 0 || (speed === 0 && moto.footDown && intents.forward < 0)) {
    const back = intents.forward < 0 && !intents.jump ? -PADDLE_BACK * -intents.forward : 0;
    return { ...engine, speed: towards(speed, back, PADDLE_RATE * dt), pitch: 0, pitchRate: 0, slid: false };
  }
  const { mass } = MOTORBIKE;
  const resistance = speed > 0 ? MOTO_ROLLING * mass * GRAVITY + 0.5 * AIR_DENSITY * MOTO_DRAG_AREA * speed * speed : 0;
  const asked = {
    back: speed > 0 && intents.forward < 0 ? -intents.forward * MOTO_REAR_BRAKE : 0,
    front: speed > 0 && intents.jump ? MOTO_FRONT_BRAKE : 0,
  };
  const beside = besideOn(MOTORBIKE, sideways);
  const held = (accel: number) => {
    const weight = mass * GRAVITY;
    const loads =
      moto.pitch > 0
        ? { front: weight, back: 0 }
        : moto.pitch < 0
          ? { front: 0, back: weight }
          : loadsOn(MOTORBIKE, accel);
    return { front: beside * loads.front, back: beside * loads.back };
  };
  const net = (accel: number) => {
    const tyres = held(accel);
    const pushed = Math.max(-tyres.back, Math.min(drive.force, tyres.back));
    const braking = Math.min(asked.back, tyres.back) + Math.min(asked.front, tyres.front);
    return (pushed - braking - resistance) / mass;
  };
  const accel = settled(net, GRAVITY, ROUNDS);
  const tyres = held(accel);
  const skidding = asked.back > tyres.back || asked.front > tyres.front;
  const next = speed + accel * dt;
  const stopped = speed > 0 && next < 0 ? 0 : next;
  return {
    ...engine,
    speed: stopped,
    ...pitchedOn(MOTORBIKE, moto, stopped > 0 ? accel : 0, dt),
    slid: skidding && Math.abs(sideways) > MOTORBIKE.leaned,
  };
}

/**
 * One step of the ridden motorbike under intents: a fall plays out; else the engine, brakes and wheels, the foot, the
 * balance and the turn, then whether the tyres held and whether it leaned past saving.
 */
export function rideMotorbike(
  moto: Moto,
  speed: number,
  intents: Intents,
  dt: number,
): { readonly moto: Moto; readonly speed: number; readonly turn: number } {
  if (moto.fall) {
    const fell = fallingOn(MOTORBIKE, moto, moto.fall, speed, dt, (m) => ({ ...parkedMoto(), gear: 0, rpm: m.rpm }));
    return { moto: { ...fell.state, rpm: MOTO_ENGINE.idle }, speed: fell.speed, turn: fell.turn };
  }
  const { slid, speed: next, ...drive } = driven(moto, speed, sidewaysOn(MOTORBIKE, moto.lean, speed), intents, dt);
  const rode = ridden(MOTORBIKE, { ...moto, ...drive }, next, intents.right, slid, dt);
  return { moto: rode.state.fall ? { ...rode.state, throttle: 0 } : rode.state, speed: next, turn: rode.turn };
}

/** What an engine's HUD shows: speed in km/h, the gear (counted from one, or R), of so many, and the engine's rpm. */
export interface EngineHud {
  readonly speed: number;
  readonly gear: string;
  readonly gears: number;
  readonly rpm: number;
}

/** The engine's speed is shown to the nearest hundred, so it reads rather than flickers. */
export const RPM_SHOWN = 100;

export const motoHud = (moto: Moto, speed: number): EngineHud => ({
  speed: Math.round(Math.abs(speed) * 3.6),
  gear: String(moto.gear + 1),
  gears: MOTO_GEARBOX.ratios.length,
  rpm: Math.round(moto.rpm / RPM_SHOWN) * RPM_SHOWN,
});
