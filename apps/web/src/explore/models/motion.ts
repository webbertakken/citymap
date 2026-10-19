// How an animated figure moves: which of its clips plays for the walker's pace and footing, and how fast, so its feet
// keep pace with the ground.
import { RUN_SPEED, WALK_SPEED } from "../walker";
import { gaitAt } from "./gait";

/** What a figure does: "drive" sits a rider on a vehicle. */
export type Motion = "idle" | "walk" | "sprint" | "jump" | "fall" | "drive";

/** Each motion's clip, by its name in the Universal Animation Library, as baked onto the people. */
export const CLIP_OF: Readonly<Record<Motion, string>> = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  sprint: "Sprint_Loop",
  jump: "Jump_Loop",
  fall: "Jump_Loop",
  drive: "Driving_Loop",
};

/** Below this pace, in metres a second, a figure stands. */
export const STANDING = 0.2;
/** At normal speed the library's walk covers this many metres a second, measured by build-models.ts (0.98). */
export const WALK_CLIP_SPEED = 1;
/**
 * At normal speed the library's sprint takes this many steps a second (two in its 0.667 s). Its own steps are short
 * (2.56 m/s at that rate), so at a run the gait sets the legs and arms, and the clip keeps the gait's step rate.
 */
export const SPRINT_CLIP_CADENCE = 3;
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

/**
 * How fast a clip plays for a pace: a walk keeps pace with the ground; a run at the gait's steps a second; the rest at
 * their own speed.
 */
export function paceOf(motion: Motion, speed: number): number {
  if (motion === "sprint") return gaitAt(speed).cadence / SPRINT_CLIP_CADENCE;
  if (motion !== "walk") return 1;
  return Math.max(SLOWEST, Math.min(FASTEST, speed / WALK_CLIP_SPEED));
}
