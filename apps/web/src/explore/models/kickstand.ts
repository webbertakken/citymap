// A two-wheeler's kickstand: down while it stands parked, leaning it onto the stand; folded up as its rider gets on and
// while it is ridden. It swings over STAND_SWING, at once where motion is unwelcome. The model build gives the stand its
// own part, pivoted at its hinge, with its folded turn and the lean it holds the machine at as extras.
import { Quaternion, type Object3D } from "three";

/** A kickstand swings down or up in this many seconds. */
export const STAND_SWING = 0.3;

/**
 * How far down a stand is after a frame of `seconds` (1 down, 0 folded): towards down while parked and folded while
 * ridden, over STAND_SWING; at once under reduced motion (`still`).
 */
export function standAfter(down: number, parked: boolean, seconds: number, still: boolean): number {
  const wanted = parked ? 1 : 0;
  if (still) return wanted;
  const step = seconds / STAND_SWING;
  return parked ? Math.min(wanted, down + step) : Math.max(wanted, down - step);
}

/**
 * The lean a two-wheeler is drawn at (positive to its left): its own, and the stand's as far as the stand is down, less
 * as its own lean nears the stand's and nothing past it, so one knocked over lies as it lies.
 */
export function leanOnStand(lean: number, down: number, standLean: number): number {
  return lean + standLean * down * Math.max(0, 1 - Math.abs(lean) / Math.abs(standLean));
}

/** A model's kickstand, as its extras give it: its turn folded (from down) and the lean it holds the machine at. */
export interface Kickstand {
  readonly folded: Quaternion;
  readonly lean: number;
}

const isNumber = (value: unknown): value is number => typeof value === "number";

/** A stand's folded turn and lean from its node's extras; null where they are missing or unreadable. */
export function kickstandOf(node: Object3D): Kickstand | null {
  const { folded, lean } = node.userData;
  if (!Array.isArray(folded) || folded.length !== 4 || !folded.every(isNumber) || !isNumber(lean)) return null;
  const [x, y, z, w] = folded;
  return { folded: new Quaternion(x, y, z, w), lean };
}
