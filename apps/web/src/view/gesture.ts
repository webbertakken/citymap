// Two fingers on the map, one of them moving: how far apart they spread (a pinch), how far round they twist, and how
// far the pair moved up or down together (a tilt), from the moving finger's step. Pure; pixels and radians.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Gesture {
  /** The new distance between the fingers over the old: above 1 spreads them, zooming in. */
  readonly ratio: number;
  /** How far the line between them turned, in radians, clockwise on screen. */
  readonly twist: number;
  /** How far their middle moved down the screen, in pixels. */
  readonly lift: number;
  /** Their middle, after the step. */
  readonly middle: Point;
}

/** What one finger's step from `before` to `now` does, while the other rests at `other`. */
export function gesture(before: Point, now: Point, other: Point): Gesture {
  const was = Math.hypot(before.x - other.x, before.y - other.y);
  const is = Math.hypot(now.x - other.x, now.y - other.y);
  const angleWas = Math.atan2(before.y - other.y, before.x - other.x);
  const angleIs = Math.atan2(now.y - other.y, now.x - other.x);
  return {
    ratio: is / Math.max(1, was),
    twist: Math.atan2(Math.sin(angleIs - angleWas), Math.cos(angleIs - angleWas)),
    lift: (now.y - before.y) / 2,
    middle: { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 },
  };
}
