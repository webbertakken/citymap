// A rider's limbs on a two-wheeler: an arm or a leg bent so its hand or foot is on a target (a grip, a pedal, a peg, or
// the ground at a stop), how far the body leans forward to reach the bars, and where a thrown rider lies. Metres, in the
// machine model's frame: +x ahead, +y up, +z right.
import { PropertyBinding, Quaternion, Vector3, type Object3D } from "three";
import { DOWN, FALLING, RISING, type Fall } from "../bicycle";

/** At a stop, the left foot goes down to the ground this far ahead of the saddle and this far to its left. */
export const FOOT_AHEAD = 0.15;
export const FOOT_OUT = 0.25;
/** Thrown, the rider lands this far ahead of the bicycle and this far to the side it falls. */
export const THROWN = 0.9;
export const THROWN_ASIDE = 0.4;
/** A knee bends ahead of the leg, a little up; an elbow down, back and out to its side (+z right). */
export const KNEE_AHEAD = new Vector3(1, 0.3, 0).normalize();
export const ELBOW_OUT = { left: new Vector3(-0.3, -1, -1).normalize(), right: new Vector3(-0.3, -1, 1).normalize() };

/** A point in the machine's frame. */
type Point = { readonly x: number; readonly y: number; readonly z: number };

/**
 * How far a rider leans their body about its base (`pivot`) so a shoulder comes within `reach` of its grip, all in the
 * machine's frame: radians about its +z (positive back, negative forward), turning the shoulder in the upright plane
 * along the machine (the shoulder's and grip's distance across it kept). The shoulder ends above the line from the base
 * to the grip; a grip it cannot come within reach of, it leans as near to as it can.
 */
export function tiltToReach(pivot: Point, shoulder: Point, grip: Point, reach: number): number {
  const across = shoulder.z - grip.z;
  const along = Math.sqrt(Math.max(0, reach * reach - across * across));
  const sx = shoulder.x - pivot.x;
  const sy = shoulder.y - pivot.y;
  const gx = grip.x - pivot.x;
  const gy = grip.y - pivot.y;
  const body = Math.hypot(sx, sy);
  const toGrip = Math.hypot(gx, gy);
  const cos = (body * body + toGrip * toGrip - along * along) / (2 * body * toGrip);
  const wanted = Math.atan2(gy, gx) + Math.acos(Math.max(-1, Math.min(1, cos)));
  const turn = wanted - Math.atan2(sy, sx);
  // The nearest way round.
  return Math.atan2(Math.sin(turn), Math.cos(turn));
}

/** One leg's bones: the thigh from the hip, the shin from the knee, and the foot. */
export interface Leg {
  readonly thigh: Object3D;
  readonly shin: Object3D;
  readonly foot: Object3D;
}

/** One arm's bones: the upper arm from the shoulder, the forearm from the elbow, and the hand. */
export interface Arm {
  readonly upper: Object3D;
  readonly fore: Object3D;
  readonly hand: Object3D;
}

/** A limb's three bones on each side, by their names as the rig gives them (".L" and ".R"), as three.js keeps them. */
function limbs(person: Object3D, names: readonly [string, string, string]) {
  const bone = (name: string) => person.getObjectByName(PropertyBinding.sanitizeNodeName(name));
  const side = (s: "L" | "R") => {
    const [a, b, c] = names.map((name) => bone(`${name}.${s}`));
    return a && b && c ? ([a, b, c] as const) : null;
  };
  const left = side("L");
  const right = side("R");
  return left && right ? { left, right } : null;
}

type Bones = readonly [Object3D, Object3D, Object3D];
const leg = ([thigh, shin, foot]: Bones): Leg => ({ thigh, shin, foot });
const arm = ([upper, fore, hand]: Bones): Arm => ({ upper, fore, hand });

/** A person's legs; null for a figure without them. */
export function legsOf(person: Object3D): { readonly left: Leg; readonly right: Leg } | null {
  const found = limbs(person, ["UpperLeg", "LowerLeg", "Foot"]);
  return found ? { left: leg(found.left), right: leg(found.right) } : null;
}

/** A person's arms; null for a figure without them. */
export function armsOf(person: Object3D): { readonly left: Arm; readonly right: Arm } | null {
  const found = limbs(person, ["UpperArm", "ForeArm", "Hand"]);
  return found ? { left: arm(found.left), right: arm(found.right) } : null;
}

/** Turns a bone by a turn given in the world, whatever its own axes. */
export function turnInWorld(bone: Object3D, turn: Quaternion) {
  const world = bone.getWorldQuaternion(new Quaternion());
  const parent = bone.parent ? bone.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  bone.quaternion.copy(parent.invert().multiply(turn.clone().multiply(world)));
  bone.updateMatrixWorld(true);
}

/** Turns a bone (in the world) so that a direction from it becomes another, whatever its own axes. */
const aim = (bone: Object3D, from: Vector3, to: Vector3) =>
  turnInWorld(bone, new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()));

const worldOf = (part: Object3D) => part.getWorldPosition(new Vector3());

/**
 * Bends a leg so its foot is on a target (in the world), the knee towards `bend`: the knee where the thigh's and the
 * shin's lengths meet, then each bone turned to point at the next. Out of reach, the leg points straight at it.
 */
export function reachFor(thigh: Object3D, shin: Object3D, foot: Object3D, target: Vector3, bend: Vector3) {
  const hip = worldOf(thigh);
  const knee = worldOf(shin);
  const thighLength = knee.distanceTo(hip);
  const shinLength = worldOf(foot).distanceTo(knee);
  const toward = target.clone().sub(hip);
  const reach = Math.min(toward.length(), thighLength + shinLength);
  const along = toward.normalize();
  // The knee's distance along the hip-to-foot line, and out from it (the triangle of the three lengths).
  const a = (thighLength ** 2 - shinLength ** 2 + reach ** 2) / (2 * reach);
  const out = Math.sqrt(Math.max(0, thighLength ** 2 - a * a));
  const side = bend.clone().sub(along.clone().multiplyScalar(bend.dot(along)));
  // Asked to bend along the leg itself, it bends any way across it.
  if (side.lengthSq() < 1e-12) side.set(along.y, -along.x, 0);
  if (side.lengthSq() < 1e-12) side.set(0, along.z, -along.y);
  const kneeAt = hip.clone().addScaledVector(along, a).addScaledVector(side.normalize(), out);
  aim(thigh, knee.clone().sub(hip), kneeAt.clone().sub(hip));
  const footAt = hip.clone().addScaledVector(along, reach);
  const kneeNow = worldOf(shin);
  aim(shin, worldOf(foot).sub(kneeNow), footAt.sub(kneeNow));
}

/**
 * Where a thrown rider is, from the fall: how far down (0 in the saddle, 1 lying), how far ahead of the bicycle and to
 * its side (positive left), and how far rolled onto that side.
 */
export function thrownPose(fall: Fall) {
  const down = Math.max(0, Math.min(1, fall.time / FALLING, (DOWN - fall.time) / RISING));
  return { down, ahead: THROWN * down, aside: fall.side * THROWN_ASIDE * down, roll: fall.side * (Math.PI / 2) * down };
}
