// A vehicle's moving parts, posed from how it moves: wheels turned by the ground they roll over, front wheels steered,
// a bicycle's crank at its own angle (it freewheels), and the whole leaning and lifting a wheel as its physics says.
// Each model says which of its parts move, about which of its own axes they roll, which of its nodes mark where its
// rider sits, holds on and rests their feet, and which part is its kickstand.
import { Euler, Quaternion, Vector3, type Object3D } from "three";
import { log } from "../../log";
import { kickstandOf, leanOnStand, type Kickstand } from "./kickstand";

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
  /** A two-wheeler's rider: the nodes marking where they meet it. */
  readonly rider?: Rider;
  /** A two-wheeler's kickstand: the part that folds, its folded turn and parked lean in its extras. */
  readonly kickstand?: string;
  /**
   * A helicopter's rotors by name: the main one turns about its own upright, the tail one about its own `tailAxis`;
   * `hub` is how far ahead of the model's middle its mast stands, in metres.
   */
  readonly rotors?: {
    readonly main: string;
    readonly tail: string;
    readonly tailAxis: "x" | "z";
    readonly hub: number;
  };
}

/**
 * Where a rider meets a two-wheeler, as nodes of its model on the parts they move with: the top of its saddle or seat
 * (on the frame), its grips (on the fork, so they turn with the bars) and its pedals (on the crank, so they go round
 * with it) or its pegs (on the frame).
 */
export interface Rider {
  readonly saddle: string;
  readonly grips: Sides;
  readonly feet: Sides;
}

/** A left and a right node, by name. */
export interface Sides {
  readonly left: string;
  readonly right: string;
}

/** Nodes named `${prefix}_${what}_left` and `_right`. */
const sides = (prefix: string, what: string): Sides => ({
  left: `${prefix}_${what}_left`,
  right: `${prefix}_${what}_right`,
});

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
    // Measured from the file: wheels 1.02 m apart.
    front: 0.507,
    rider: {
      saddle: "bicycle_red_saddle",
      grips: sides("bicycle_red", "grip"),
      feet: sides("bicycle_red", "pedal"),
    },
    kickstand: "bicycle_red_kickstand",
  },
  car: { wheels: quartet("sedan_blue"), radius: 0.31, roll: { axis: "x", sign: 1 }, front: 1.3 },
  // Drawn at 4.6 m of its 5.2, so its wheels are 0.32 m.
  pickup: { wheels: quartet("pickup_red"), radius: 0.318, roll: { axis: "x", sign: 1 }, front: 1.37 },
  // Duhgless' chopper, built facing +x and rigged by the model build (its fork on a raked head, the front wheel on it,
  // its rider's contacts marked); measured from its mesh at 0.474 m a unit: axles 0.786 m ahead of its middle and 0.816 m
  // behind. It has no kickstand.
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
    rider: { saddle: "motorbike_seat", grips: sides("motorbike", "grip"), feet: sides("motorbike", "peg") },
  },
  // ArcheoteryxFr's AS350 B2, rigged by the model build (its rotors hung from their hubs), in metres: the mast 1.99 m
  // ahead of the model's middle, the tail rotor turning about the file's x.
  helicopter: {
    wheels: [],
    radius: 1,
    roll: { axis: "x", sign: 1 },
    front: 0,
    rotors: { main: "helicopter_rotor", tail: "helicopter_tail_rotor", tailAxis: "x", hub: 1.99 },
  },
} as const satisfies Record<string, Rig>;

/** The stand-ins' rider nodes, as procedural.ts names them. */
const STAND_IN_RIDER = (feet: "pedal" | "peg"): Rider => ({
  saddle: "saddle",
  grips: { left: "grip-left", right: "grip-right" },
  feet: { left: `${feet}-left`, right: `${feet}-right` },
});

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
    rider: STAND_IN_RIDER("pedal"),
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
    rider: STAND_IN_RIDER("peg"),
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
  helicopter: {
    wheels: [],
    radius: 1,
    roll: { axis: "z", sign: -1 },
    front: 0,
    rotors: { main: "rotor-main", tail: "rotor-tail", tailAxis: "z", hub: -0.1 },
  },
} as const satisfies Record<string, Rig>;

/**
 * How a vehicle is posed: how far it has rolled (metres, backwards negative), its front wheel's turn and its lean (both
 * positive to the left), a wheel lifted (radians: positive the back wheel, nose down; negative the front, nose up), its
 * crank's angle, and how far its kickstand is down (1 down, 0 folded).
 */
export interface Pose {
  readonly rolled: number;
  readonly steer: number;
  readonly lean: number;
  readonly pitch: number;
  readonly crank: number;
  readonly stand: number;
}

/** Each model's kickstand as its extras say, read once. */
const stands = new WeakMap<Object3D, Kickstand | null>();
const FOLDED_NOT = new Quaternion();

/** A model's kickstand: its part, folded and parked lean; null without one (or with extras it cannot read). */
function standOf(model: Object3D, rig: Rig) {
  const part = rig.kickstand ? model.getObjectByName(rig.kickstand) : undefined;
  if (!part) return null;
  if (!stands.has(part)) {
    const read = kickstandOf(part);
    if (!read) log.error("explore/kickstand-unreadable", { name: part.name });
    stands.set(part, read);
  }
  const stand = stands.get(part);
  return stand ? { part, ...stand } : null;
}

/**
 * Poses a vehicle's model by its rig: every wheel turns about its axle by the ground rolled, steering wheels (and a
 * fork) turn about the upright, the crank turns to its angle, and the whole model leans (positive to the left; the
 * model as drawn faces +x, so its left is −z, and leaning is a turn about x) and pitches about the contact that stays
 * down (nose down about the front, nose up about the back), moved so that contact stays where it was. A kickstand folds
 * from down by as much as it is up, and as far as it is down the machine leans onto it.
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
  const stand = standOf(model, rig);
  stand?.part.quaternion.slerpQuaternions(FOLDED_NOT, stand.folded, 1 - pose.stand);
  const lean = stand ? leanOnStand(pose.lean, pose.stand, stand.lean) : pose.lean;
  model.rotation.set(-lean, 0, -pose.pitch, "XYZ");
  const contact = new Vector3(pose.pitch < 0 ? -(rig.back ?? rig.front) : rig.front, 0, 0);
  model.position.copy(contact).sub(contact.clone().applyEuler(new Euler(-lean, 0, -pose.pitch, "XYZ")));
}

/**
 * Poses a helicopter's model by its rig: its main rotor turned to the blades' angle (clockwise from above, as the
 * Écureuil's turns), its tail rotor to its own, and the model moved so its mast stands over the group's origin. Its
 * tilt is its group's.
 */
export function poseHelicopter(
  model: Object3D,
  rig: Rig,
  { blades, tail }: { readonly blades: number; readonly tail: number },
) {
  const rotors = rig.rotors!;
  model.getObjectByName(rotors.main)?.rotation.set(0, -blades, 0);
  const spinner = model.getObjectByName(rotors.tail);
  spinner?.rotation.set(rotors.tailAxis === "x" ? tail : 0, 0, rotors.tailAxis === "z" ? tail : 0);
  model.position.set(-rotors.hub, 0, 0);
}
