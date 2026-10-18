// The city as solid ground for people and vehicles: what a building is to them, and what a physics engine must answer.
// Metres; x east, y up, z south.

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One building as a solid: its lot's index, its corners on the ground (x, z, a convex polygon) and its roof's height. */
export interface Footprint {
  readonly lot: number;
  readonly corners: readonly { readonly x: number; readonly z: number }[];
  readonly top: number;
}

/** The city's walls, as a physics engine answers for them: how far a person moves, and how far a line runs clear. */
export interface Walls {
  /** The feet moved as far along `delta` as the walls allow, stepping up kerbs, and whether they then stand on ground. */
  readonly move: (feet: Vec3, delta: Vec3) => { readonly feet: Vec3; readonly grounded: boolean };
  /** How far from `from` towards `to` is clear, up to their distance. */
  readonly clearance: (from: Vec3, to: Vec3) => number;
  readonly dispose: () => void;
}

/** A person as a capsule: 1.7 m tall, 0.6 m across. */
export const PERSON_RADIUS = 0.3;
export const PERSON_HEIGHT = 1.7;
/** Steps up to this high (a kerb, a plinth) are climbed without a jump. */
export const STEP_UP = 0.45;
/** Going down, the feet keep to the ground over drops this small. */
export const SNAP_DOWN = 0.3;
/**
 * The ground's height, in metres: the roads' surface in the scene (0.025 street widths), where people walk; blocks and
 * parks lie a little below it.
 */
export const GROUND = 0.25;

/** Twice a footprint's area, in square metres: zero for a line or a point. */
export const area2 = (corners: Footprint["corners"]) =>
  Math.abs(
    corners.reduce((sum, a, i) => {
      const b = corners[(i + 1) % corners.length]!;
      return sum + a.x * b.z - b.x * a.z;
    }, 0),
  );

/** A footprint makes a wall when it encloses ground and stands above it. */
export const solid = (footprint: Footprint) =>
  footprint.corners.length >= 3 && area2(footprint.corners) > 1e-9 && footprint.top > 0;
