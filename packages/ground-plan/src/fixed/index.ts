export { floorDiv, isqrt, mulDiv, roundDiv, type Rounding } from "./arithmetic";
export { DIRECTION, TURN, dir, negate, normalise, perp, rotate, type Dir } from "./direction";
export { compareKeys, fnv1a, seedOf, unitMille } from "./hash";
export {
  area2,
  centroid,
  chord,
  clip,
  extent,
  inset,
  longestEdge,
  offsetFor,
  reach,
  side,
  type Poly,
  type Pt,
} from "./polygon";
export { densify, lattice, noise, warper, type Octave } from "./warp";

/** Fixed units per u, one local street width. */
export const UNIT = 64;
