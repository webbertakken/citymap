import { CitymapError } from "../errors";
import { isqrt, roundDiv } from "./arithmetic";
import { COSINE } from "./directions";

/** Length of a direction vector. */
export const DIRECTION = 4096;
/** Angle steps per full turn. */
export const TURN = 4096;
const QUARTER = TURN / 4;

/** An integer direction (or any integer vector). */
export type Dir = readonly [number, number];

const at = (i: number): number => COSINE[i]!;
/** Negation without minus zero, which would compare and serialise differently. */
const neg = (v: number): number => 0 - v;

/** The direction at angle step a (taken modulo a turn), scaled to DIRECTION, from the committed table. */
export function dir(a: number): Dir {
  const step = ((a % TURN) + TURN) % TURN;
  const q = Math.floor(step / QUARTER);
  const r = step - q * QUARTER;
  const c = at(r);
  const s = at(QUARTER - r);
  if (q === 0) return [c, s];
  if (q === 1) return [neg(s), c];
  if (q === 2) return [neg(c), neg(s)];
  return [s, neg(c)];
}

/** The direction of an integer vector, scaled to DIRECTION. */
export function normalise(x: number, y: number): Dir {
  if (x === 0 && y === 0) throw new CitymapError("fixed/zero-direction", "cannot normalise the zero vector");
  // Scale the vector by 2^k so its length has at least 25 significant bits, keeping every product safe.
  const squared = x * x + y * y;
  let k = 0;
  while (squared * 4 ** (k + 1) < 2 ** 52) k++;
  const scale = 2 ** k;
  const length = isqrt(squared * scale * scale);
  return [roundDiv(x * DIRECTION * scale, length), roundDiv(y * DIRECTION * scale, length)];
}

/** A quarter turn anticlockwise. */
export const perp = ([x, y]: Dir): Dir => [neg(y), x];

/** The opposite direction. */
export const negate = ([x, y]: Dir): Dir => [neg(x), neg(y)];

/** A vector rotated by angle step a. */
export function rotate([x, y]: Dir, a: number): Dir {
  const [c, s] = dir(a);
  return [roundDiv(x * c - y * s, DIRECTION), roundDiv(x * s + y * c, DIRECTION)];
}
