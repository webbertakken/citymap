// The nearby streets, as pure maths: which buildings a physics engine needs round the player (those within a reach of
// where the player will be a moment ahead), which it can let go (those left well behind), nearest first; and when its
// frame of reference has drifted far enough from the player to be re-centred. Metres.
import { solid, type Footprint } from "@citymap/world";

/** Buildings coming within this many metres of where the player will be are raised; past `STREETS_KEEP`, lowered. */
export const STREETS_REACH = 150;
export const STREETS_KEEP = 200;
/** Where the player will be: this many seconds ahead at its speed. */
export const LOOK_AHEAD = 1.5;
/** The window is chosen again once where the player will be has moved this far. */
export const RECHOOSE = 8;
/** The frame is re-centred on the player once it is this far from its origin. */
export const REBASE = 256;
/** The grid the buildings are found in: cells this many metres across. */
export const STREETS_CELL = 64;

/** A point on the ground. */
export interface Spot {
  readonly x: number;
  readonly z: number;
}

/** A building as the window sees it: its lot, its middle and the circle round it. */
export interface Standing {
  readonly lot: number;
  readonly middle: Spot;
  readonly radius: number;
}

/** Every building that can stand, in a grid of cells. */
export interface StreetGrid {
  readonly standing: ReadonlyMap<number, Standing>;
  readonly cells: ReadonlyMap<number, readonly Standing[]>;
}

const cellOf = (v: number) => Math.floor(v / STREETS_CELL);
const keyOf = (cx: number, cz: number) => (cx + 2 ** 20) * 2 ** 21 + (cz + 2 ** 20);

/** A footprint's middle (the mean of its corners) and the circle about it through its furthest corner. */
export function standingOf(footprint: Footprint): Standing {
  const n = footprint.corners.length;
  const middle = {
    x: footprint.corners.reduce((sum, c) => sum + c.x, 0) / n,
    z: footprint.corners.reduce((sum, c) => sum + c.z, 0) / n,
  };
  const radius = Math.max(...footprint.corners.map((c) => Math.hypot(c.x - middle.x, c.z - middle.z)));
  return { lot: footprint.lot, middle, radius };
}

/** The grid of every building that can stand (with area and height), each in the cell of its middle. */
export function streetGrid(footprints: readonly Footprint[]): StreetGrid {
  const standing = new Map<number, Standing>();
  const cells = new Map<number, Standing[]>();
  for (const footprint of footprints) {
    if (!solid(footprint)) continue;
    const building = standingOf(footprint);
    standing.set(building.lot, building);
    const key = keyOf(cellOf(building.middle.x), cellOf(building.middle.z));
    const cell = cells.get(key);
    if (cell) cell.push(building);
    else cells.set(key, [building]);
  }
  return { standing, cells };
}

/** How far a building's circle is from a point: zero when the point is inside it. */
export const gapTo = (building: Standing, at: Spot) =>
  Math.max(0, Math.hypot(building.middle.x - at.x, building.middle.z - at.z) - building.radius);

/** The widest circle of any building in the grid, so a cell's neighbours are searched far enough. */
const widest = (grid: StreetGrid) => {
  let most = 0;
  for (const building of grid.standing.values()) most = Math.max(most, building.radius);
  return most;
};

/** Every building whose circle comes within `reach` of a point, nearest first (ties by lot). */
export function nearbyLots(grid: StreetGrid, at: Spot, reach: number, widestRadius = widest(grid)): number[] {
  const span = reach + widestRadius;
  const found: { lot: number; gap: number }[] = [];
  for (let cx = cellOf(at.x - span); cx <= cellOf(at.x + span); cx++)
    for (let cz = cellOf(at.z - span); cz <= cellOf(at.z + span); cz++)
      for (const building of grid.cells.get(keyOf(cx, cz)) ?? []) {
        const gap = gapTo(building, at);
        if (gap <= reach) found.push({ lot: building.lot, gap });
      }
  return found.toSorted((a, b) => a.gap - b.gap || a.lot - b.lot).map((f) => f.lot);
}

/** Where the player will be a moment ahead: from where it is, at the speed it moves. */
export const aheadOf = (at: Spot, velocity: Spot): Spot => ({
  x: at.x + velocity.x * LOOK_AHEAD,
  z: at.z + velocity.z * LOOK_AHEAD,
});

/** What the window does next: the buildings to raise (nearest first) and those to lower. */
export interface StreetsPlan {
  readonly raise: readonly number[];
  readonly lower: readonly number[];
}

/**
 * The window round a point, against the buildings already raised: every building within reach not yet raised, nearest
 * first, and every raised one now past the keeping distance.
 */
export function planStreets(grid: StreetGrid, raised: ReadonlySet<number>, at: Spot): StreetsPlan {
  const raise = nearbyLots(grid, at, STREETS_REACH).filter((lot) => !raised.has(lot));
  const lower = [...raised].filter((lot) => {
    const building = grid.standing.get(lot);
    return !building || gapTo(building, at) > STREETS_KEEP;
  });
  return { raise, lower };
}

/** The frame's new origin when the player has gone `REBASE` from the old one (rounded to the metre), else null. */
export const rebased = (origin: Spot, at: Spot): Spot | null =>
  Math.hypot(at.x - origin.x, at.z - origin.z) > REBASE ? { x: Math.round(at.x), z: Math.round(at.z) } : null;
