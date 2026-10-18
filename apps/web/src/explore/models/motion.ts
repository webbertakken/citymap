// How an animated figure moves: which of its clips plays for the walker's pace and footing, and how fast, so its feet
// keep pace with the ground.
import { RUN_SPEED, WALK_SPEED } from "../walker";
import { LEAP } from "./bound";

/** The clips a figure plays, by their names in Kenney's characters. */
export type Motion = "idle" | "walk" | "sprint" | "jump" | "fall";

/** Below this pace, in metres a second, a figure stands. */
export const STANDING = 0.2;
/** Kenney's sprint takes this long for a stride: both legs forward once. */
export const SPRINT_CLIP_SECONDS = 0.5;
/** At normal speed, Kenney's walk covers this many metres a second; a bounding run strides once every two leaps. */
export const WALK_CLIP_SPEED = 1.5;
export const SPRINT_CLIP_SPEED = (2 * LEAP) / SPRINT_CLIP_SECONDS;
/** A clip plays no slower than this share of its speed and no faster than twice it. */
export const SLOWEST = 0.4;
export const FASTEST = 2;
/** Clips blend into one another over this many seconds. */
export const BLEND = 0.15;

/** The clip for a pace (metres a second along the ground), standing on something or not, and rising or falling. */
export function motionOf(speed: number, grounded: boolean, rise: number): Motion {
  if (!grounded) return rise > 0 ? "jump" : "fall";
  if (speed < STANDING) return "idle";
  return speed > (WALK_SPEED + RUN_SPEED) / 2 ? "sprint" : "walk";
}

/** How fast a clip plays for a pace: walking and sprinting keep pace with the ground; the rest at their own speed. */
export function paceOf(motion: Motion, speed: number): number {
  const natural = motion === "walk" ? WALK_CLIP_SPEED : motion === "sprint" ? SPRINT_CLIP_SPEED : 0;
  if (natural === 0) return 1;
  return Math.max(SLOWEST, Math.min(FASTEST, speed / natural));
}
