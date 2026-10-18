// The rider on the bicycle: where the pedals are as the crank turns, a leg bent so its foot is on its pedal (or on the
// ground at a stop), and where a thrown rider lies. Metres, in the bicycle model's frame: +x ahead, +y up, +z right.
import { PropertyBinding, Quaternion, Vector3, type Object3D } from "three";
import { DOWN, FALLING, RISING, type Fall } from "../bicycle";

/** A rider sits this high above the bicycle's ground in its frame: its saddle, less the seated figure's hips. */
export const SADDLE = 0.38;
/** At a stop, the left foot goes down this far to the left of the crank. */
export const FOOT_OUT = 0.25;
/** Thrown, the rider lands this far ahead of the bicycle and this far to the side it falls. */
export const THROWN = 0.9;
export const THROWN_ASIDE = 0.4;
/** A knee bends ahead of the leg, a little up. */
export const KNEE_AHEAD = new Vector3(1, 0.3, 0).normalize();

type Point = { readonly x: number; readonly y: number; readonly z: number };

/**
 * Where the pedals are from the crank's middle at a crank angle (turning forwards): the right hangs down at rest, the
 * left opposite; each out to its side.
 */
export function pedalsOf(crank: number, pedals: { readonly arm: number; readonly out: number }) {
  const along = -pedals.arm * Math.sin(crank);
  const up = -pedals.arm * Math.cos(crank);
  const right: Point = { x: along, y: up, z: pedals.out };
  const left: Point = { x: -along, y: -up, z: -pedals.out };
  return { right, left };
}

/** One leg's bones: the thigh from the hip, the shin from the knee, and the foot. */
export interface Leg {
  readonly thigh: Object3D;
  readonly shin: Object3D;
  readonly foot: Object3D;
}

/** A person's legs, by their bones' names as three.js keeps them; null for a figure without them. */
export function legsOf(person: Object3D): { readonly left: Leg; readonly right: Leg } | null {
  const bone = (name: string) => person.getObjectByName(PropertyBinding.sanitizeNodeName(name));
  const side = (s: "L" | "R") => {
    const thigh = bone(`UpperLeg.${s}`);
    const shin = bone(`LowerLeg.${s}`);
    const foot = bone(`Foot.${s}`);
    return thigh && shin && foot ? { thigh, shin, foot } : null;
  };
  const left = side("L");
  const right = side("R");
  return left && right ? { left, right } : null;
}

/** Turns a bone (in the world) so that a direction from it becomes another, whatever its own axes. */
function aim(bone: Object3D, from: Vector3, to: Vector3) {
  const turn = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  const world = bone.getWorldQuaternion(new Quaternion());
  const parent = bone.parent ? bone.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  bone.quaternion.copy(parent.invert().multiply(turn.multiply(world)));
  bone.updateMatrixWorld(true);
}

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
