// A vehicle's moving parts, posed from how it moves: wheels turned by the ground they roll over, front wheels steered,
// a bicycle's crank at its own angle (it freewheels), and the whole leaning and lifting its back wheel as its physics
// says. Each model says which of its parts move, about which of its own axes they roll, and where its pedals are.
import { Euler, Vector3, type Object3D } from "three";

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
  /** How far ahead of the model's middle its front wheel meets the ground, in metres: what it pitches about. */
  readonly front: number;
  /** A bicycle's pedals: the crank arm's length and how far out each pedal is (the right hangs down at rest). */
  readonly pedals?: { readonly arm: number; readonly out: number };
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
    // Measured from the file: wheels 1.02 m apart, pedals 0.133 m out on the crank and 0.165 m to the side.
    front: 0.507,
    pedals: { arm: 0.133, out: 0.165 },
  },
  car: { wheels: quartet("sedan_blue"), radius: 0.31, roll: { axis: "x", sign: 1 }, front: 1.3 },
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
    front: 0.55,
    pedals: { arm: 0.17, out: 0.13 },
  },
  car: {
    wheels: ["front-left", "front-right", "rear-left", "rear-right"].map((w) => ({
      name: `wheel-${w}`,
      steers: w.startsWith("front"),
    })),
    radius: 0.31,
    roll: { axis: "z", sign: -1 },
    front: 1.3,
  },
} as const satisfies Record<string, Rig>;

/**
 * How a vehicle is posed: how far it has rolled (metres, backwards negative), its front wheel's turn and its lean (both
 * positive to the left), its back wheel lifted (radians, nose down), and its crank's angle.
 */
export interface Pose {
  readonly rolled: number;
  readonly steer: number;
  readonly lean: number;
  readonly pitch: number;
  readonly crank: number;
}

/**
 * Poses a vehicle's model by its rig: every wheel turns about its axle by the ground rolled, steering wheels (and a
 * fork) turn about the upright, the crank turns to its angle, and the whole model leans (positive to the left; the
 * model as drawn faces +x, so its left is −z, and leaning is a turn about x) and pitches nose down about its front
 * contact, moved so that contact stays where it was.
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
  if (crank) spin(crank, rig.roll.sign * pose.crank, 0);
  const fork = rig.fork ? model.getObjectByName(rig.fork) : undefined;
  fork?.rotation.set(0, pose.steer, 0);
  model.rotation.set(-pose.lean, 0, -pose.pitch, "XYZ");
  const contact = new Vector3(rig.front, 0, 0);
  model.position.copy(contact).sub(contact.clone().applyEuler(new Euler(-pose.lean, 0, -pose.pitch, "XYZ")));
}
