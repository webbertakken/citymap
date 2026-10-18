// A vehicle's moving parts, posed from how it moves: wheels turned by the ground they roll over, front wheels steered,
// a bicycle's pedals turned through its gearing, and a bicycle leaning into its turns as balance asks.
import type { Object3D } from "three";
import type { VehicleKind } from "../vehicles";
import { GRAVITY } from "../walker";

/** Wheel radii, in metres: a bicycle's 700c wheel and Kenney's car wheel at the car's size. */
export const WHEEL_RADIUS: Readonly<Record<VehicleKind, number>> = { bicycle: 0.34, car: 0.33 };
/** The rear wheel turns this many times for each turn of the pedals: a city bicycle's middle gear. */
export const GEARING = 2.6;
/** A bicycle leans at most this far, in radians. */
export const MAX_LEAN = 0.7;

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

const CAR_WHEELS = ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"] as const;

/**
 * Poses a vehicle's model: Kenney's car turns its wheels about their axles (across the car, its file's x) and steers its
 * front ones; the procedural bicycle turns its wheels and crank (in the plane of its frame, about z), steers its fork,
 * and the whole bicycle leans.
 */
export function poseVehicle(model: Object3D, kind: VehicleKind, pose: Pose) {
  const turn = pose.rolled / WHEEL_RADIUS[kind];
  if (kind === "car") {
    for (const name of CAR_WHEELS) {
      const wheel = model.getObjectByName(name);
      if (!wheel) continue;
      // Steer about the upright first, then spin about the steered axle.
      wheel.rotation.order = "YXZ";
      wheel.rotation.set(turn, name.startsWith("wheel-front") ? pose.steer : 0, 0);
    }
    return;
  }
  // Rolling forward along +x turns a wheel in the x–y plane clockwise seen from +z: a negative turn about z.
  model.getObjectByName("wheel-rear")?.rotation.set(0, 0, -turn);
  model.getObjectByName("wheel-front")?.rotation.set(0, 0, -turn);
  model.getObjectByName("crank")?.rotation.set(0, 0, -turn / GEARING);
  model.getObjectByName("steering")?.rotation.set(0, pose.steer, 0);
  // Leaning left is a turn about the bicycle's forward axis that brings its top towards −z.
  model.rotation.set(-pose.lean, 0, 0);
}
