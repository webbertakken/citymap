// A procedural figure's walk: legs and arms swing with the distance walked, as far as the pace asks, and come to rest
// when it stops.
import type { Object3D } from "three";
import { WALK_SPEED } from "../walker";

/** One full stride (both legs forward once) covers this many metres. */
export const STRIDE = 1.5;
/** At a walk the legs swing this far either way, in radians; at a run further, up to `MAX_SWING`. */
export const WALK_SWING = 0.4;
export const MAX_SWING = 0.75;
/** Arms swing this share of the legs, the other way. */
export const ARM_SHARE = 0.8;

/** How far the legs swing now: forward and back with the distance walked, wider the faster the pace (metres a second). */
export function swingOf(walked: number, speed: number): number {
  const reach = Math.min(MAX_SWING, (WALK_SWING * speed) / WALK_SPEED);
  return Math.sin((walked / STRIDE) * 2 * Math.PI) * reach;
}

/** Sets a procedural figure's limbs to a swing: each leg against its arm, the left against the right. */
export function poseStride(model: Object3D, swing: number) {
  model.getObjectByName("leg-left")?.rotation.set(0, 0, swing);
  model.getObjectByName("leg-right")?.rotation.set(0, 0, -swing);
  model.getObjectByName("arm-left")?.rotation.set(0, 0, -swing * ARM_SHARE);
  model.getObjectByName("arm-right")?.rotation.set(0, 0, swing * ARM_SHARE);
}
