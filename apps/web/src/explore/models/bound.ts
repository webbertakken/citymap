// A running figure bounds: it leaps along in long, high arcs, squashing as it lands and stretching at the top, leaning
// into the run. Drawn only: the walker's feet and the walls never leave the ground for it, and the camera follows the
// ground, not the arcs.
import { RUN_SPEED, WALK_SPEED } from "../walker";

/** One leap covers this many metres of ground, and rises this high at its top. */
export const LEAP = 2.4;
export const LEAP_HEIGHT = 0.5;
/** Landing, the figure is this much shorter (and wider); at the top, this much taller (and thinner). */
export const SQUASH = 0.12;
/** At a full run the figure leans this far forward, in radians. */
export const LEAN = 0.18;
/** How long the bounding takes to ease in or out, in seconds: about a tenth of a second most of the way. */
export const SETTLE = 0.12;

/** How much of a run a pace is: nothing at a walk or slower, all of it at a run or faster. */
export const runShare = (speed: number) => Math.max(0, Math.min(1, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED)));

/** The bound after so many metres walked, at a share of a run: how high it lifts, how it stretches, how far it leans. */
export function boundOf(walked: number, share: number) {
  if (share === 0) return { lift: 0, stretch: 1, lean: 0 };
  const phase = (((walked / LEAP) % 1) + 1) % 1;
  const arc = 4 * phase * (1 - phase);
  return { lift: LEAP_HEIGHT * arc * share, stretch: 1 + SQUASH * share * (2 * arc - 1), lean: LEAN * share };
}

/** A value eased from where it is towards a target over a frame of `seconds`, by `SETTLE`. */
export const settle = (current: number, target: number, seconds: number) =>
  target + (current - target) * Math.exp(-seconds / SETTLE);
