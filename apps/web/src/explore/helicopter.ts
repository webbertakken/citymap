// The helicopter, as pure flight: a main rotor whose thrust the collective sets and the cyclic tilts, a tail rotor that
// turns it against the main rotor's torque, more lift near the ground under its disc, and a rotor that spins up and down
// with the engine. Assisted, as GTA's: let go, it levels itself, holds its height and slows to a hover; Up and Down ask
// for a climb, which the collective makes, and a turn at speed banks as far as it needs; sinking near a marked roof, it
// sets itself down on its middle. Metres, seconds, newtons;
// headings as the walker's; pitch positive nose down, roll positive the right side down.
import type { Vec3 } from "@citymap/world";
import type { Flight } from "./flyer";
import { GRAVITY, facing } from "./walker";

/**
 * A helicopter's own state: its velocity in the world; its tilt (pitch and roll) and how fast they change; how fast it
 * turns (anticlockwise from above positive, as headings grow); its rotor's speed as a share of its flying speed, and
 * whether the engine drives it; the collective (a share of the most thrust) as last set; whether it stands on its
 * skids; the height it holds (null while climbing, sinking or on the ground); the blades' and the tail rotor's angles,
 * to draw them turning; and its hard hits, how many and the speed the last one lost.
 */
export interface Heli {
  readonly velocity: Vec3;
  readonly pitch: number;
  readonly roll: number;
  readonly pitchRate: number;
  readonly rollRate: number;
  readonly yawRate: number;
  readonly rotor: number;
  readonly engine: boolean;
  readonly collective: number;
  readonly grounded: boolean;
  readonly hold: number | null;
  readonly blades: number;
  readonly tail: number;
  readonly hits: number;
  readonly hit: number;
}

/** ArcheoteryxFr's AS350 B2 (the Écureuil): its most at take-off, its main rotor's radius, its hub above the skids. */
export const HELI_MASS = 2250;
export const ROTOR_RADIUS = 5.35;
export const MAST = 3.06;
/** The cabin and skids, against anything lower than the rotor: a circle this wide about the mast. */
export const BODY_RADIUS = 1.4;
/** The most the main rotor lifts at full speed, out of ground effect: 1.5 of its weight, to climb briskly. */
export const THRUST_MOST = 1.5 * HELI_MASS * GRAVITY;
/** The rotor spins up this share of its flying speed a second with the engine on, and down this share with it off. */
export const SPIN_UP = 0.2;
export const SPIN_DOWN = 0.08;
/** Up climbs at most this fast and Down sinks this fast, in metres a second, and no faster than `LAND_SINK` once the
 * ground is nearer than `FLARE` seconds at that rate; the helicopter climbs no higher than `CEILING` metres. */
export const CLIMB_MOST = 8;
export const SINK_MOST = 6;
export const LAND_SINK = 1.5;
export const FLARE = 1.5;
export const CEILING = 500;
/**
 * The assist: a climb asked for is reached at `CLIMB_GAIN` a second; a height held is returned to at `HOLD_GAIN` a
 * second. `HEAVE` is the rotor's own damping of a climb or a fall, a second.
 */
export const CLIMB_GAIN = 2;
export const HOLD_GAIN = 1;
export const HEAVE = 0.3;
/** The disc tilts at most this far nose down (or up) as forward (or back) asks, and banks at most this far. */
export const PITCH_MOST = 0.3;
export const ROLL_MOST = 0.6;
/** Let go, the disc tilts against any drift, this much per metre a second, at most `HOVER_TILT`: it slows to a hover. */
export const HOVER_GAIN = 0.04;
export const HOVER_TILT = 0.2;
/**
 * Sinking with nothing else asked within `PAD_PULL` metres of a marked roof's middle, the cyclic's assist steers over
 * it: an acceleration of `PAD_GAIN` per metre off, less `PAD_DAMPING` per metre a second, as a tilt within the hover's.
 */
export const PAD_PULL = 10;
/** Until it is this many metres from the mark's middle, it sinks no faster than a landing: it centres, then sinks. */
export const PAD_CENTRED = 0.4;
export const PAD_GAIN = 2;
export const PAD_DAMPING = 2.8;
/** The disc follows the tilt asked for as a spring this stiff (radians a second), critically damped. */
export const TILT_RATE = 5;
/**
 * In a hover the tail rotor turns it at most `YAW_MOST` radians a second; at speed, no faster than its most bank turns
 * it. The yaw rate asked for is reached at `YAW_GAIN` a second, within `TAIL_MOST` radians a second each second; the
 * main rotor's torque turns it `TORQUE` radians a second each second at full collective, which the tail rotor holds.
 */
export const YAW_MOST = 1.2;
export const YAW_GAIN = 5;
export const TAIL_MOST = 4;
export const TORQUE = 1.5;
/** The air's density, and the fuselage's drag areas ahead and to the side, in square metres: about 200 km/h flat out. */
export const AIR_DENSITY = 1.2;
export const DRAG_AHEAD = 3.5;
export const DRAG_SIDE = 12;
/** On the ground, the skids stop a slide at this many metres a second, each second. */
export const SKID_GRIP = 6;
/**
 * Losing this many metres a second at once is a hard hit: the rotor strikes, losing `STRIKE` of its speed per metre a
 * second lost (at most `STRIKE_MOST`), and the disc is jolted by `KICK` radians a second.
 */
export const HARD_HIT = 5;
export const STRIKE = 0.04;
export const STRIKE_MOST = 0.5;
export const KICK = 1.5;
/** The blades and the tail rotor are drawn turning this many radians a second at full rotor speed. */
export const BLADE_SPIN = 20;
export const TAIL_SPIN = 36;

/** A helicopter standing on its skids, its engine off and its rotor still. */
export const parkedHeli = (): Heli => ({
  velocity: { x: 0, y: 0, z: 0 },
  pitch: 0,
  roll: 0,
  pitchRate: 0,
  rollRate: 0,
  yawRate: 0,
  rotor: 0,
  engine: false,
  collective: 0,
  grounded: true,
  hold: null,
  blades: 0,
  tail: 0,
  hits: 0,
  hit: 0,
});

/** The engine started: the rotor spins up. */
export const started = (heli: Heli): Heli => ({ ...heli, engine: true });

/** The engine stopped, the helicopter still on its skids: the rotor spins down. */
export const stopped = (heli: Heli): Heli => ({
  ...heli,
  engine: false,
  collective: 0,
  velocity: { x: 0, y: 0, z: 0 },
  yawRate: 0,
});

/**
 * How much more the rotor lifts with its skids this many metres above what lies below (Cheeseman and Bennett, 1955):
 * `1 / (1 − (R / 4z)²)`, `z` the hub's height above it; nothing past a rotor's breadth or two.
 */
export function groundEffect(below: number): number {
  if (!Number.isFinite(below)) return 1;
  const z = below + MAST;
  return 1 / (1 - (ROTOR_RADIUS / (4 * z)) ** 2);
}

/** The rotor's share of its flying speed that lifts the helicopter at full collective, so far above what lies below. */
export const hoverShare = (below: number) => Math.sqrt((HELI_MASS * GRAVITY) / (THRUST_MOST * groundEffect(below)));

/** The way the rotor's thrust points, its axis tilted by the pitch ahead and the roll to the right of a heading. */
export function thrustDirection(heading: number, pitch: number, roll: number): Vec3 {
  const ahead = facing(heading);
  const right = { x: -ahead.z, z: ahead.x };
  const forward = Math.sin(pitch) * Math.cos(roll);
  const aside = Math.sin(roll);
  return {
    x: ahead.x * forward + right.x * aside,
    y: Math.cos(pitch) * Math.cos(roll),
    z: ahead.z * forward + right.z * aside,
  };
}

const clamp = (value: number, most: number) => Math.max(-most, Math.min(most, value));
const TURN = 2 * Math.PI;

/** The disc's tilt one step on, as a critically damped spring towards its aim, as strong as the rotor turns. */
function tilted(angle: number, rate: number, aim: number, power: number, dt: number) {
  const accel = power * (TILT_RATE ** 2 * (aim - angle) - 2 * TILT_RATE * rate);
  const next = rate + accel * dt;
  return { angle: angle + next * dt, rate: next };
}

/**
 * The climb the assist asks for, in metres a second: Up's or Down's (Down's gentler near what lies `below`), else back
 * to the height held; never past the ceiling.
 */
function climbAimed(flight: Flight, hold: number, y: number, below: number) {
  const asked =
    flight.up > 0
      ? flight.up * CLIMB_MOST
      : flight.up < 0
        ? flight.up * Math.min(SINK_MOST, Math.max(LAND_SINK, below / FLARE))
        : clamp((hold - y) * HOLD_GAIN, Math.max(CLIMB_MOST, SINK_MOST));
  return Math.min(asked, (CEILING - y) * HOLD_GAIN);
}

/**
 * One step of `dt` seconds: the rotor spins up or down with the engine; the assist sets the collective for the climb
 * asked for (knowing the tilt, the rotor's speed and its own damping, not the ground's help), the cyclic's tilt for
 * forward and the turn, and the tail rotor for the yaw rate; then thrust (with ground effect, `below` the skids'
 * height above what lies under them), drag and gravity move it. On its skids it neither tilts nor turns, and lifts once
 * its thrust outweighs it. `pad` is where a marked roof's middle lies from it (metres), to be set down on. The walls take
 * the move after (`touched`).
 */
export function flyHeli(
  heli: Heli,
  at: { readonly y: number; readonly heading: number },
  flight: Flight,
  below: number,
  dt: number,
  pad: { readonly x: number; readonly z: number } | null = null,
): { readonly heli: Heli; readonly heading: number } {
  // The rotor's power is its speed squared, from the speed it turned at over the step.
  const power = heli.rotor ** 2;
  const rotor = heli.engine ? Math.min(1, heli.rotor + SPIN_UP * dt) : Math.max(0, heli.rotor - SPIN_DOWN * dt);
  const blades = (heli.blades + rotor * BLADE_SPIN * dt) % TURN;
  const tail = (heli.tail + rotor * TAIL_SPIN * dt) % TURN;
  const weight = HELI_MASS * GRAVITY;
  const lift = THRUST_MOST * power;
  const { velocity: v } = heli;
  /** The collective that gives the thrust the climb asks for, along an axis this far from upright. */
  const collectiveFor = (climb: number, upright: number) => {
    const needed = (HELI_MASS * (GRAVITY + CLIMB_GAIN * (climb - v.y) + HEAVE * v.y)) / Math.max(0.5, upright);
    // With the rotor still, any thrust asked for is all of it (none).
    return Math.max(0, Math.min(1, needed / Math.max(lift, Number.MIN_VALUE)));
  };
  if (heli.grounded) {
    // On its skids: level and still but for a slide; Up raises the collective until it lifts.
    const collective = flight.up > 0 ? collectiveFor(flight.up * CLIMB_MOST, 1) : 0;
    const thrust = collective * lift * groundEffect(0);
    const rise = Math.max(0, (thrust - weight) / HELI_MASS) * dt;
    const sliding = Math.hypot(v.x, v.z);
    const slowed = Math.max(0, sliding - SKID_GRIP * dt);
    const share = sliding > 0 ? slowed / sliding : 0;
    return {
      heli: {
        ...heli,
        velocity: { x: v.x * share, y: rise, z: v.z * share },
        pitch: 0,
        roll: 0,
        pitchRate: 0,
        rollRate: 0,
        yawRate: 0,
        rotor,
        collective,
        hold: null,
        blades,
        tail,
      },
      heading: at.heading,
    };
  }
  const ahead = facing(at.heading);
  const right = { x: -ahead.z, z: ahead.x };
  const vAhead = v.x * ahead.x + v.z * ahead.z;
  const vSide = v.x * right.x + v.z * right.z;
  // The tail rotor: a yaw rate asked for, in a hover its most, at speed what its most bank holds; the main rotor's
  // torque cancelled, within what the tail rotor can push.
  const fastest = Math.min(YAW_MOST, (GRAVITY * Math.tan(ROLL_MOST)) / Math.max(1e-9, Math.abs(vAhead)));
  const yawAim = -flight.right * fastest;
  const torque = TORQUE * heli.collective * power;
  const push = clamp(-torque + YAW_GAIN * (yawAim - heli.yawRate), TAIL_MOST * power);
  const yawRate = heli.yawRate + (torque + push) * dt;
  const heading = at.heading + yawRate * dt;
  // The cyclic: forward tilts the nose down; a turn at speed banks as a coordinated turn needs; let go, it tilts
  // against any drift, to a hover; sinking near a marked roof, it steers over its middle.
  const setting =
    pad && flight.up < 0 && flight.forward === 0 && flight.right === 0 && Math.hypot(pad.x, pad.z) <= PAD_PULL;
  const toward = (offset: number, rate: number) =>
    clamp((PAD_GAIN * offset - PAD_DAMPING * rate) / GRAVITY, HOVER_TILT);
  const pitchAim = setting
    ? toward(pad.x * ahead.x + pad.z * ahead.z, vAhead)
    : flight.forward !== 0
      ? flight.forward * PITCH_MOST
      : clamp(-HOVER_GAIN * vAhead, HOVER_TILT);
  const bank = Math.atan((vAhead * -yawAim) / GRAVITY);
  const rollAim = setting
    ? toward(pad.x * right.x + pad.z * right.z, vSide)
    : clamp(bank - HOVER_GAIN * vSide, flight.right !== 0 ? ROLL_MOST : HOVER_TILT);
  const pitched = tilted(heli.pitch, heli.pitchRate, pitchAim, power, dt);
  const rolled = tilted(heli.roll, heli.rollRate, rollAim, power, dt);
  // The collective: the climb asked for, Up and Down, or the height held.
  const hold = flight.up === 0 ? (heli.hold ?? at.y) : null;
  const axis = thrustDirection(heading, pitched.angle, rolled.angle);
  const aimed = climbAimed(flight, hold ?? at.y, at.y, below);
  const centring = setting && Math.hypot(pad.x, pad.z) > PAD_CENTRED;
  const collective = collectiveFor(centring ? Math.max(aimed, -LAND_SINK) : aimed, axis.y);
  const thrust = (collective * lift * groundEffect(below)) / HELI_MASS;
  // The fuselage's drag, ahead and to the side; the rotor's own damping of a climb.
  const dragAhead = (-0.5 * AIR_DENSITY * DRAG_AHEAD * Math.abs(vAhead) * vAhead) / HELI_MASS;
  const dragSide = (-0.5 * AIR_DENSITY * DRAG_SIDE * Math.abs(vSide) * vSide) / HELI_MASS;
  const velocity = {
    x: v.x + (thrust * axis.x + dragAhead * ahead.x + dragSide * right.x) * dt,
    y: v.y + (thrust * axis.y - GRAVITY - HEAVE * v.y) * dt,
    z: v.z + (thrust * axis.z + dragAhead * ahead.z + dragSide * right.z) * dt,
  };
  return {
    heli: {
      ...heli,
      velocity,
      pitch: pitched.angle,
      roll: rolled.angle,
      pitchRate: pitched.rate,
      rollRate: rolled.rate,
      yawRate,
      rotor,
      collective,
      hold,
      blades,
      tail,
    },
    heading,
  };
}

/**
 * The helicopter after the walls took its move of a step (`moved`, metres): the speed a wall or the ground took is lost
 * (a wall slid along keeps the rest); on its skids it settles level and still; a hard hit strikes the rotor, which
 * loses speed, and jolts the disc away from what it hit. Returns the speed lost.
 */
export function touched(
  heli: Heli,
  moved: Vec3,
  dt: number,
  grounded: boolean,
  heading: number,
): { readonly heli: Heli; readonly lost: number } {
  const v = heli.velocity;
  const want = Math.hypot(v.x, v.z) * dt;
  const got = Math.hypot(moved.x, moved.z);
  const blocked = got < want - 1e-9;
  const x = blocked ? moved.x / dt : v.x;
  const z = blocked ? moved.z / dt : v.z;
  // Down on what lies below, or held up short of the move asked for (the rotor on a building's top beside it).
  const y = grounded ? 0 : Math.abs(moved.y) < Math.abs(v.y * dt) - 1e-9 ? moved.y / dt : v.y;
  const fell = grounded ? Math.max(0, -v.y) : Math.abs(v.y - y);
  const lost = Math.hypot(v.x - x, fell, v.z - z);
  if (lost === 0 && grounded === heli.grounded) return { heli, lost };
  const ahead = facing(heading);
  const settled: Heli = grounded
    ? { ...heli, velocity: { x, y, z }, grounded, pitch: 0, roll: 0, pitchRate: 0, rollRate: 0, yawRate: 0, hold: null }
    : { ...heli, velocity: { x, y, z }, grounded };
  if (lost < HARD_HIT) return { heli: settled, lost };
  // Jolted away from the hit: nose up from a wall ahead, banked away from one beside.
  const along = ((x - v.x) * ahead.x + (z - v.z) * ahead.z) / lost;
  const across = ((x - v.x) * -ahead.z + (z - v.z) * ahead.x) / lost;
  return {
    heli: {
      ...settled,
      rotor: settled.rotor * (1 - Math.min(STRIKE_MOST, lost * STRIKE)),
      pitchRate: settled.pitchRate + KICK * along,
      rollRate: settled.rollRate + KICK * across,
      hits: heli.hits + 1,
      hit: lost,
    },
    lost,
  };
}

/** What the HUD shows of a helicopter at a height: metres, a climb in tenths of a metre a second, km/h, per cent. */
export function heliHud(heli: Heli, altitude: number) {
  const { velocity: v } = heli;
  return {
    altitude: Math.round(altitude),
    climb: Math.round(v.y * 10) / 10 || 0,
    speed: Math.round(Math.hypot(v.x, v.z) * 3.6),
    rotor: Math.round(heli.rotor * 100),
  };
}
