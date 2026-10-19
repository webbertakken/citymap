// The rider on a two-wheeler and the vehicles the walk draws: each pool model posed by its vehicle (a two-wheeler's
// kickstand down while it stands parked, the helicopter tilted with its rotors turning), and the rider seated in a ridden one by the nodes its model marks: hips on the saddle or
// seat, the body leant forward to reach the bars, both hands closed round the grips, the feet on the pedals (going round
// with the crank) or the pegs, the knees bent ahead. All of it in the machine's own frame, so it holds as the bars turn
// and the machine leans.
import type { Theme } from "@citymap/themes";
import { PropertyBinding, Quaternion, Vector3, type Object3D } from "three";
import { log } from "../../log";
import { METRE } from "../street";
import { tiltedOf, type ModelKind, type Vehicle } from "../vehicles";
import type { Loaded } from "./gltf";
import {
  ELBOW_OUT,
  FOOT_AHEAD,
  FOOT_OUT,
  KNEE_AHEAD,
  armsOf,
  legsOf,
  reachFor,
  thrownPose,
  tiltToReach,
  turnInWorld,
  type Arm,
  type Leg,
} from "./pedalling";
import { bicycle, car, helicopter, motorbike, paletteOf } from "./procedural";
import { PROCEDURAL_RIGS, RIGS, poseHelicopter, poseVehicle, type Rig, type Rider } from "./rig";

/** A rider holds the bars at this share of their arms' full reach: the elbows a little bent. */
export const REACH = 0.9;
/** A grip sits across the palm this share of the way from the wrist to the knuckles. */
export const PALM = 0.6;
/** Each finger joint closes this far round a grip, the thumb's less, in radians: the fingers wrap over and under. */
export const CURL = 0.9;
export const THUMB_CURL = 0.5;
/** Leaning to the bars, the body tilts at most this far forward and this far back from the clip's sitting, in radians. */
export const TILT_FORWARD = 1;
export const TILT_BACK = 0.4;
/** The head turns back this share of the body's lean, to look ahead. */
export const HEAD_LEVEL = 0.7;
/** Short of the bars, a rider comes at most this far forward along the saddle, in metres. */
export const SLIDE_MOST = 0.12;
/** A hand or a foot is set again this many times, each time aimed by where its palm or ball landed the last. */
export const PASSES = 8;

/** One model of the pool: what it draws, and the model with its rig. */
export interface Slot {
  readonly kind: ModelKind;
  readonly model: Object3D;
  readonly rig: Rig;
}

/** A pool's model of a kind: its loaded file with its rig, or the procedural stand-in with its own. */
export function slotOf(kind: ModelKind, loaded: Loaded | null, theme: Theme): Slot {
  const palette = paletteOf(theme);
  if (loaded) return { kind, model: loaded.make(), rig: kind === "saloon" ? RIGS.car : RIGS[kind] };
  if (kind === "bicycle") return { kind, model: bicycle(palette), rig: PROCEDURAL_RIGS.bicycle };
  if (kind === "motorbike") return { kind, model: motorbike(palette), rig: PROCEDURAL_RIGS.motorbike };
  if (kind === "helicopter") return { kind, model: helicopter(palette), rig: PROCEDURAL_RIGS.helicopter };
  return { kind, model: car(palette), rig: PROCEDURAL_RIGS.car };
}

/** Where a vehicle has rolled to, for its wheels: from where it was drawn last. */
export type Rolled = Map<string, { x: number; z: number; rolled: number }>;

/**
 * Poses a vehicle's model, placed by its group: rolled by how far it moved since it was last drawn, its kickstand as far
 * down as `stand` (1 down, 0 folded).
 */
export function placeVehicle(slot: Slot, group: Object3D, vehicle: Vehicle, rolled: Rolled, stand: number) {
  const was = rolled.get(vehicle.id) ?? { x: vehicle.feet.x, z: vehicle.feet.z, rolled: 0 };
  const step = Math.hypot(vehicle.feet.x - was.x, vehicle.feet.z - was.z) * Math.sign(vehicle.speed);
  const now = { x: vehicle.feet.x, z: vehicle.feet.z, rolled: was.rolled + step };
  rolled.set(vehicle.id, now);
  group.visible = true;
  group.position.set(vehicle.feet.x * METRE, vehicle.feet.y * METRE, vehicle.feet.z * METRE);
  if (vehicle.kind === "helicopter") {
    const { heli } = vehicle;
    const turn = tiltedOf(vehicle.heading, heli.pitch, heli.roll);
    group.quaternion.set(turn.x, turn.y, turn.z, turn.w);
    poseHelicopter(slot.model, slot.rig, heli);
    return;
  }
  if (vehicle.kind === "car")
    group.quaternion.set(vehicle.attitude.x, vehicle.attitude.y, vehicle.attitude.z, vehicle.attitude.w);
  else group.rotation.set(0, vehicle.heading, 0);
  const single = vehicle.kind === "bicycle" ? vehicle.cycle : vehicle.kind === "motorbike" ? vehicle.moto : null;
  poseVehicle(slot.model, slot.rig, {
    rolled: now.rolled,
    steer: vehicle.steer,
    lean: single?.lean ?? 0,
    pitch: single?.pitch ?? 0,
    crank: vehicle.kind === "bicycle" ? vehicle.cycle.crank : 0,
    stand,
  });
}

/** A finger's three joints, base first. */
type Finger = readonly [Object3D, Object3D, Object3D];

/** One side of a rider: the arm and the leg, the knuckles a grip is measured to, the ball of the foot, the fingers. */
export interface Side {
  readonly arm: Arm;
  readonly leg: Leg;
  readonly knuckles: Object3D;
  readonly ball: Object3D;
  readonly fingers: readonly Finger[];
  readonly thumb: Finger;
}

/**
 * What a rigged figure is measured by, once, to sit it on a machine: its hips and spine, each side's limbs, its
 * fingers' rest (no clip moves them), how far its hips are above what it sits on and its foot's ball above its sole, and
 * its hips' height standing (metres in its own frame).
 */
export interface Figure {
  readonly hips: Object3D;
  readonly spine: Object3D;
  readonly head: Object3D;
  readonly left: Side;
  readonly right: Side;
  readonly rest: ReadonlyMap<Object3D, Quaternion>;
  readonly seat: number;
  readonly sole: number;
  readonly standing: number;
  /** Its ankle's height standing, and the way from its ankle to the ball of its foot (metres, its own frame). */
  readonly ankle: number;
  readonly toe: Vector3;
}

/** The bones a figure needs to ride, beyond its limbs. */
const BONES = ["Hips", "Spine", "Head", "Middle1", "ToeBase", "Thumb", "Index", "Middle"] as const;

const position = (part: Object3D) => part.getWorldPosition(new Vector3());

/**
 * A rigged figure measured to ride (null for one without the bones), as made, before any clip moves it: in that rest
 * pose, the hips' height above
 * the lowest point of its pelvis (the thighs' tops beside it, where it sits), the ball of its foot above its sole (it
 * stands on y = 0), its hips' height, and its ankle's height and the way from it to the ball of the foot.
 */
export function figureOf(person: Object3D): Figure | null {
  const arms = armsOf(person);
  const legs = legsOf(person);
  const bone = (name: string) => person.getObjectByName(PropertyBinding.sanitizeNodeName(name));
  const [hips, spine, head] = [bone(BONES[0]), bone(BONES[1]), bone(BONES[2])];
  if (!arms || !legs || !hips || !spine || !head) {
    log.info("explore/rider-unrigged", { reason: "limbs-or-body" });
    return null;
  }
  const side = (s: "L" | "R", arm: Arm, leg: Leg): Side | null => {
    const finger = (name: string) => {
      const joints = [1, 2, 3].map((i) => bone(`${name}${i}.${s}`));
      const [a, b, c] = joints;
      return a && b && c ? ([a, b, c] as const) : null;
    };
    const knuckles = bone(`Middle1.${s}`);
    const ball = bone(`ToeBase.${s}`);
    const [thumb, index, middle] = [finger("Thumb"), finger("Index"), finger("Middle")];
    if (!knuckles || !ball || !thumb || !index || !middle) return null;
    return { arm, leg, knuckles, ball, fingers: [index, middle], thumb };
  };
  const left = side("L", arms.left, legs.left);
  const right = side("R", arms.right, legs.right);
  if (!left || !right) {
    log.info("explore/rider-unrigged", { reason: "hands-or-feet" });
    return null;
  }
  person.updateMatrixWorld(true);
  const local = (part: Object3D) => person.worldToLocal(position(part));
  const hipsAt = local(hips);
  // The pelvis rests on the thighs' tops where they leave it: the lower of the two hip joints, less their bones' girth
  // (the thigh's own length from hip to knee, a tenth of it, as the figure is drawn).
  const thigh = local(legs.left.thigh);
  const girth = thigh.distanceTo(local(legs.left.shin)) / 10;
  const fingers = [left, right].flatMap((s) => [...s.fingers, s.thumb].flat());
  const seated = hipsAt.y - Math.min(thigh.y, local(legs.right.thigh).y) + girth;
  const sole = local(left.ball).y;
  log.info("explore/rider-measured", { seat: seated.toFixed(3), sole: sole.toFixed(3), standing: hipsAt.y.toFixed(3) });
  return {
    hips,
    spine,
    head,
    left,
    right,
    rest: new Map(fingers.map((f) => [f, f.quaternion.clone()])),
    seat: seated,
    sole,
    standing: hipsAt.y,
    ankle: local(left.leg.foot).y,
    toe: local(left.ball).sub(local(left.leg.foot)),
  };
}

/** Puts a figure's fingers back as they rest: open, off the bars. */
export function release(figure: Figure) {
  for (const [finger, rest] of figure.rest) finger.quaternion.copy(rest);
}

/** Turns a bone in the world about an axis there, whatever its own axes. */
const turnAbout = (bone: Object3D, axis: Vector3, angle: number) =>
  turnInWorld(bone, new Quaternion().setFromAxisAngle(axis, angle));

/** The contacts already said to be missing, by model: each said once. */
const missing = new WeakMap<Object3D, Set<string>>();

/**
 * The rider's contacts on a machine, in the world: its saddle, its grips and its pedals or pegs; null for a model built
 * without one of them, said once a model and contact (`explore/no-contact`).
 */
function contactsOf(machine: Object3D, rider: Rider) {
  const names = [rider.saddle, rider.grips.left, rider.grips.right, rider.feet.left, rider.feet.right];
  const nodes = names.map((name) => machine.getObjectByName(name));
  const lost = names.filter((_, i) => !nodes[i]);
  if (lost.length > 0) {
    const said = missing.get(machine) ?? new Set<string>();
    missing.set(machine, said);
    for (const name of lost.filter((n) => !said.has(n))) {
      said.add(name);
      log.error("explore/no-contact", { name });
    }
    return null;
  }
  const [saddle, left, right, footLeft, footRight] = nodes.map((n) => position(n!));
  return {
    saddle: saddle!,
    grips: { left: left!, right: right! },
    feet: { left: footLeft!, right: footRight! },
  };
}

/**
 * Bends a limb so a point it carries (a palm, a foot's ball: `carried`, below its end bone) is on a target: its end bone
 * aimed at the target, then again at the target less how far the carried point landed from the end, a few passes over.
 */
function reachWith(
  limb: readonly [Object3D, Object3D, Object3D],
  carried: () => Vector3,
  target: Vector3,
  bend: Vector3,
) {
  const [root, middle, end] = limb;
  let aim = target.clone();
  for (let pass = 0; pass < PASSES; pass++) {
    reachFor(root, middle, end, aim, bend);
    aim = target.clone().sub(carried().sub(position(end)));
  }
}

/**
 * Closes a hand's fingers about a line `across` (a unit direction to the figure's right), base joints first, by
 * `share` of the full curl: round a bar, or into a runner's loose fist.
 */
export function grip(side: Side, across: Vector3, share = 1) {
  for (const finger of side.fingers) for (const joint of finger) turnAbout(joint, across, -CURL * share);
  for (const joint of side.thumb) turnAbout(joint, across, -THUMB_CURL * share);
}

/**
 * The rider on a bicycle or a motorbike: thrown, beside it on the ground, rolled onto the side it fell; else seated by
 * its rig's contacts when the figure is rigged (`figure`), or, without bones, with its legs' tops (the stand-in's
 * `leg-left`) on the saddle.
 */
export function seat(
  walker: Object3D,
  figure: Figure | null,
  slot: Slot,
  group: Object3D,
  vehicle: Vehicle & { kind: "bicycle" | "motorbike" },
) {
  const single = vehicle.kind === "bicycle" ? vehicle.cycle : vehicle.moto;
  const machine = slot.model;
  const { rider } = slot.rig;
  if (!rider) return;
  machine.updateMatrixWorld(true);
  const contacts = contactsOf(machine, rider);
  if (!contacts) return;
  const saddle = machine.worldToLocal(contacts.saddle.clone());
  // How far below the saddle a seated figure's feet would be, were it standing straight.
  const below = figure ? figure.standing - figure.seat : (walker.getObjectByName("leg-left")?.position.y ?? 0);
  if (single.fall) {
    if (figure) release(figure);
    const { ahead, aside, roll, down } = thrownPose(single.fall);
    const sitting = Math.max(0, saddle.y - below);
    walker.position.copy(group.localToWorld(new Vector3(ahead, sitting * (1 - down), -aside)));
    walker.rotation.order = "YXZ";
    walker.rotation.set(-roll, vehicle.heading, 0);
    return;
  }
  const turn = machine.getWorldQuaternion(new Quaternion());
  walker.quaternion.copy(turn);
  walker.position.copy(machine.localToWorld(saddle.clone().setY(saddle.y - below)));
  walker.updateMatrixWorld(true);
  const grounded = (at: Vector3) => group.localToWorld(group.worldToLocal(at.clone()).setY(0));
  if (figure) seatFigure({ walker, figure, machine, contacts, turn, grounded }, single.footDown);
}

/** A rider being seated: the figure, the machine and its contacts in the world, its turn there, and its ground. */
interface Seating {
  readonly walker: Object3D;
  readonly figure: Figure;
  readonly machine: Object3D;
  readonly contacts: NonNullable<ReturnType<typeof contactsOf>>;
  readonly turn: Quaternion;
  /** A point in the world brought down onto the ground the machine stands on. */
  readonly grounded: (at: Vector3) => Vector3;
}

/**
 * A rigged rider seated: hips on the saddle, shoulders turned with the bars, the body leant to them, forward along the
 * saddle as far as the arms still fall short, hands round the grips, feet on the pedals or pegs (the left on the ground
 * at a stop).
 */
function seatFigure(seating: Seating, footDown: boolean) {
  sitOn(seating);
  faceBars(seating);
  leanToBars(seating);
  slideToBars(seating);
  holdBars(seating);
  restFeet(seating, footDown);
}

/** A point of the world in the machine's frame (metres), and back. */
const inMachine = (machine: Object3D, at: Vector3) => machine.worldToLocal(at.clone());
const fromMachine = (machine: Object3D, at: Vector3) => machine.localToWorld(at.clone());

/** The whole figure moved by a step in the machine's frame. */
function shift({ walker, machine }: Seating, step: Vector3) {
  walker.position.add(fromMachine(machine, step).sub(fromMachine(machine, new Vector3())));
  walker.updateMatrixWorld(true);
}

/** Hips onto the saddle: the whole figure moved so they are their seat's height above it. */
function sitOn(seating: Seating) {
  const { figure, machine, contacts } = seating;
  const saddle = inMachine(machine, contacts.saddle);
  shift(seating, saddle.setY(saddle.y + figure.seat).sub(inMachine(machine, position(figure.hips))));
}

/** The shoulders turned about the upright with the bars' line, as far as the bars are steered. */
function faceBars({ figure, machine, contacts, turn }: Seating) {
  const bar = inMachine(machine, contacts.grips.right).sub(inMachine(machine, contacts.grips.left));
  turnAbout(figure.spine, new Vector3(0, 1, 0).applyQuaternion(turn), Math.atan2(bar.x, bar.z));
}

/** How far a side's arm reaches in the machine's frame: shoulder to elbow to wrist to palm. */
function reachOf({ machine }: Seating, side: Side) {
  const [shoulder, elbow, wrist, palm] = [
    position(side.arm.upper),
    position(side.arm.fore),
    position(side.arm.hand),
    palmOf(side),
  ].map((at) => inMachine(machine, at));
  return shoulder!.distanceTo(elbow!) + elbow!.distanceTo(wrist!) + wrist!.distanceTo(palm!);
}

/** The body leant about its spine's base until the shoulders are within `REACH` of the grips (the sides' mean). */
function leanToBars(seating: Seating) {
  const { figure, machine, contacts, turn } = seating;
  const tiltOf = (side: Side, at: Vector3) =>
    tiltToReach(
      inMachine(machine, position(figure.spine)),
      inMachine(machine, position(side.arm.upper)),
      inMachine(machine, at),
      REACH * reachOf(seating, side),
    );
  const mean = (tiltOf(figure.left, contacts.grips.left) + tiltOf(figure.right, contacts.grips.right)) / 2;
  const tilt = Math.max(-TILT_FORWARD, Math.min(TILT_BACK, mean));
  const across = new Vector3(0, 0, 1).applyQuaternion(turn);
  turnAbout(figure.spine, across, tilt);
  turnAbout(figure.head, across, -HEAD_LEVEL * tilt);
}

/** Forward along the saddle, at most `SLIDE_MOST`, by as far as the farther arm still falls short of its grip. */
function slideToBars(seating: Seating) {
  const { figure, machine, contacts } = seating;
  const short = (side: Side, at: Vector3) =>
    inMachine(machine, position(side.arm.upper)).distanceTo(inMachine(machine, at)) - reachOf(seating, side);
  const most = Math.max(short(figure.left, contacts.grips.left), short(figure.right, contacts.grips.right));
  if (most > 0) shift(seating, new Vector3(Math.min(most, SLIDE_MOST), 0, 0));
}

/** Hands round the grips, the elbows down, back and out, the fingers closed round the bar's line. */
function holdBars({ figure, contacts, turn }: Seating) {
  release(figure);
  const bar = contacts.grips.right.clone().sub(contacts.grips.left).normalize();
  for (const [side, at, elbow] of [
    [figure.left, contacts.grips.left, ELBOW_OUT.left],
    [figure.right, contacts.grips.right, ELBOW_OUT.right],
  ] as const) {
    const arm = [side.arm.upper, side.arm.fore, side.arm.hand] as const;
    reachWith(arm, () => palmOf(side), at, elbow.clone().applyQuaternion(turn));
    grip(side, bar);
  }
}

/**
 * Feet on the pedals or pegs, the ball of each foot its sole's height above; at a stop the left on the ground,
 * `FOOT_AHEAD` ahead of the saddle and `FOOT_OUT` to its left. The knees bend ahead.
 */
function restFeet({ figure, machine, contacts, turn, grounded }: Seating, footDown: boolean) {
  const knee = KNEE_AHEAD.clone().applyQuaternion(turn);
  const ball = (at: Vector3) => {
    const local = inMachine(machine, at);
    return fromMachine(machine, local.setY(local.y + figure.sole));
  };
  const saddle = inMachine(machine, contacts.saddle);
  const ground = grounded(fromMachine(machine, new Vector3(saddle.x + FOOT_AHEAD, 0, -FOOT_OUT)));
  const sole = fromMachine(machine, new Vector3(0, figure.sole, 0))
    .sub(fromMachine(machine, new Vector3()))
    .length();
  const left = footDown ? ground.setY(ground.y + sole) : ball(contacts.feet.left);
  for (const [side, at] of [
    [figure.left, left],
    [figure.right, ball(contacts.feet.right)],
  ] as const)
    reachWith([side.leg.thigh, side.leg.shin, side.leg.foot], () => position(side.ball), at, knee);
}

/** Where a grip sits in a hand: across the palm, between the wrist and the knuckles. */
const palmOf = (side: Side) => position(side.arm.hand).lerp(position(side.knuckles), PALM);
