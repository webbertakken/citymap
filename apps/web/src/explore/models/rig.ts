// A vehicle's moving parts, posed from how it moves: wheels turned by the ground they roll over, front wheels steered,
// a bicycle's crank at its own angle (it freewheels), and the whole leaning and lifting a wheel as its physics says.
// Each model says which of its parts move, about which of its own axes they roll, and where its rider sits, reaches
// and rests its feet.
import { Euler, Vector3, type Object3D } from "three";
import { SADDLE } from "./pedalling";

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
  /** How far behind the middle its back wheel meets the ground, in metres: what a wheelie lifts about. */
  readonly back?: number;
  /** A two-wheeler's rider: where it sits in the model's frame (+x ahead, +y up, +z right), less its seated hips. */
  readonly saddle?: Grip;
  /** A motorbike's footpegs, in the model's frame. */
  readonly pegs?: { readonly left: Grip; readonly right: Grip };
  /** A bicycle's pedals: the crank arm's length and how far out each pedal is (the right hangs down at rest). */
  readonly pedals?: { readonly arm: number; readonly out: number };
  /** A bicycle's grips, in its fork's own frame, so they turn with the bars: where a rider's hands go. */
  readonly grips?: { readonly left: Grip; readonly right: Grip };
}

/** A point in a part's own frame. */
export type Grip = readonly [number, number, number];

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
    // In the fork's frame as the file has it (x to the rider's left, z ahead): the bars' two ends, behind the stem.
    grips: { left: [0.35, 0.61, -0.14], right: [-0.15, 0.69, -0.14] },
    saddle: [0, SADDLE, 0],
  },
  car: { wheels: quartet("sedan_blue"), radius: 0.31, roll: { axis: "x", sign: 1 }, front: 1.3 },
  // Drawn at 4.6 m of its 5.2, so its wheels are 0.32 m.
  pickup: { wheels: quartet("pickup_red"), radius: 0.318, roll: { axis: "x", sign: 1 }, front: 1.37 },
  // Duhgless' chopper, built facing +x and rigged by the model build (its fork on a raked head, the front wheel on it);
  // measured from its mesh at 0.474 m a unit: axles 0.786 m ahead of its middle and 0.816 m behind, the seat's top 0.725
  // m up and 0.436 m back, forward pegs 0.2 m ahead and 0.22 m out, the bars' ends in the fork's raked frame (file units,
  // z to the right).
  motorbike: {
    wheels: [
      { name: "motorbike_wheel_front", steers: false },
      { name: "motorbike_wheel_back", steers: false },
    ],
    fork: "motorbike_fork",
    radius: 0.38,
    roll: { axis: "z", sign: -1 },
    front: 0.786,
    back: 0.816,
    saddle: [-0.436, 0.2, 0],
    pegs: { left: [0.204, 0.171, -0.223], right: [0.204, 0.171, 0.223] },
    grips: { left: [-0.145, 0.652, -0.48], right: [-0.145, 0.652, 0.48] },
  },
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
    grips: { left: [0.02, 0.3, -0.25], right: [0.02, 0.3, 0.25] },
    saddle: [0, SADDLE, 0],
  },
  motorbike: {
    wheels: [
      { name: "wheel-front", steers: false },
      { name: "wheel-rear", steers: false },
    ],
    fork: "steering",
    radius: 0.31,
    roll: { axis: "z", sign: -1 },
    front: 0.74,
    back: 0.7,
    saddle: [-0.25, 0.32, 0],
    pegs: { left: [0, 0.3, -0.2], right: [0, 0.3, 0.2] },
    grips: { left: [-0.06, 0.1, -0.33], right: [-0.06, 0.1, 0.33] },
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
 * positive to the left), a wheel lifted (radians: positive the back wheel, nose down; negative the front, nose up), and
 * its crank's angle.
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
 * model as drawn faces +x, so its left is −z, and leaning is a turn about x) and pitches about the contact that stays
 * down (nose down about the front, nose up about the back), moved so that contact stays where it was.
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
  const contact = new Vector3(pose.pitch < 0 ? -(rig.back ?? rig.front) : rig.front, 0, 0);
  model.position.copy(contact).sub(contact.clone().applyEuler(new Euler(-pose.lean, 0, -pose.pitch, "XYZ")));
}
