// A vehicle's moving parts, posed from how it moves: wheels turned by the ground they roll over, front wheels steered,
// a bicycle's pedals turned through its gearing, and a bicycle leaning into its turns as balance asks. Each model says
// which of its parts move, and about which of its own axes they roll.
import type { Object3D } from "three";
import { GRAVITY } from "../walker";

/** The rear wheel turns this many times for each turn of the pedals: a city bicycle's middle gear. */
export const GEARING = 2.6;
/** A bicycle leans at most this far, in radians. */
export const MAX_LEAN = 0.7;

/**
 * A model's moving parts by name: its wheels (and which steer), its crank, and the fork that steers a bicycle's front
 * wheel; the wheels' radius in metres; and the axis a rolling part turns about, with the turn's sign for rolling
 * forwards (a model built facing +z rolls its wheels about +x; one facing +x about −z).
 */
export interface Rig {
  readonly wheels: readonly { readonly name: string; readonly steers: boolean }[];
  readonly crank?: string;
  readonly fork?: string;
  readonly radius: number;
  readonly roll: { readonly axis: "x" | "z"; readonly sign: 1 | -1 };
}

const quartet = (prefix: string, rear = "rear") =>
  ["front_left", "front_right", `${rear}_left`, `${rear}_right`].map((w) => ({
    name: `${prefix}_wheel_${w}`,
    steers: w.startsWith("front"),
  }));

/** heyheythere's PSX vehicles, as the walk ships them: built facing +z. */
export const RIGS = {
  bicycle: {
    wheels: [
      { name: "bicycle_red_wheel_front", steers: false },
      { name: "bicycle_red_wheel_rear", steers: false },
    ],
    crank: "bicycle_red_crank",
    fork: "bicycle_red_fork",
    radius: 0.337,
    roll: { axis: "x", sign: 1 },
  },
  car: { wheels: quartet("sedan_blue"), radius: 0.31, roll: { axis: "x", sign: 1 } },
} as const satisfies Record<string, Rig>;

/** The procedural stand-ins, built facing +x, drawn when a model cannot load. */
export const PROCEDURAL_RIGS = {
  bicycle: {
    wheels: [
      { name: "wheel-front", steers: false },
      { name: "wheel-rear", steers: false },
    ],
    crank: "crank",
    fork: "steering",
    radius: 0.34,
    roll: { axis: "z", sign: -1 },
  },
  car: {
    wheels: ["front-left", "front-right", "rear-left", "rear-right"].map((w) => ({
      name: `wheel-${w}`,
      steers: w.startsWith("front"),
    })),
    radius: 0.31,
    roll: { axis: "z", sign: -1 },
  },
} as const satisfies Record<string, Rig>;

/**
 * How far a bicycle leans into a turn to stay balanced (positive to the left), at a speed and rate of turn: the lean
 * whose tilt matches the turn's pull, atan(v ω / g).
 */
export function leanOf(speed: number, turn: number): number {
  const lean = Math.atan((speed * turn) / GRAVITY);
  return Math.max(-MAX_LEAN, Math.min(MAX_LEAN, lean));
}

/** How a vehicle is posed: how far it has rolled (metres, backwards negative), its front wheel's turn, its lean. */
export interface Pose {
  readonly rolled: number;
  readonly steer: number;
  readonly lean: number;
}

/**
 * Poses a vehicle's model by its rig: every wheel turns about its axle by the ground rolled, steering wheels (and a
 * fork) turn about the upright, the crank turns through the gearing, and the whole model leans (positive to the left;
 * the model as drawn faces +x, so its left is −z, and leaning is a turn about x).
 */
export function poseVehicle(model: Object3D, rig: Rig, pose: Pose) {
  const turn = (rig.roll.sign * pose.rolled) / rig.radius;
  const spin = (part: Object3D, angle: number, steer: number) => {
    // Steer about the upright first, then roll about the steered axle.
    part.rotation.order = rig.roll.axis === "x" ? "YXZ" : "YZX";
    part.rotation.set(rig.roll.axis === "x" ? angle : 0, steer, rig.roll.axis === "z" ? angle : 0);
  };
  for (const { name, steers } of rig.wheels) {
    const wheel = model.getObjectByName(name);
    if (wheel) spin(wheel, turn, steers ? pose.steer : 0);
  }
  const crank = rig.crank ? model.getObjectByName(rig.crank) : undefined;
  if (crank) spin(crank, turn / GEARING, 0);
  const fork = rig.fork ? model.getObjectByName(rig.fork) : undefined;
  fork?.rotation.set(0, pose.steer, 0);
  model.rotation.set(-pose.lean, 0, 0);
}
