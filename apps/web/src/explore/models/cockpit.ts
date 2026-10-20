// The helicopter's glass and where its pilot meets it, measured from its own hull by the model build: the panes found by
// how they are painted on its one texture, and its seat and pedals found from the pilot's door window and the cabin's
// floor. The model has no cyclic or collective, so those are set from the seat. Points are in the file's own frame, in
// metres: ahead is −z, the pilot's right +x, up +y. The pilot sits on the right, as an Écureuil's does.
import { partsOf, surfaceBottomAt, type Point } from "./contacts";

/** A colour as the texture holds it: red, green and blue, 0 to 255. */
export type Colour = readonly [number, number, number];

/** The texture's colour at a point of it (u and v within [0, 1)). */
export type Paint = (u: number, v: number) => Colour;

/**
 * Glass is painted bluer than red by at least `bluer`, and at least `blue` blue: the panes' steel blue (about 60, 120,
 * 150) against the hull's red, its white and greys, and the near-black frames round the panes.
 */
export const GLASS_PAINT = { bluer: 30, blue: 90 } as const;

/** How the cockpit is measured and laid out, in metres. */
export const COCKPIT = {
  /** A side pane faces across: its triangles' area-weighted mean |normal.x| at least this. */
  sideFacing: 0.7,
  /** The door window is at least this tall; the lower door and chin windows are 0.32 to 0.43 m. */
  doorTall: 0.45,
  /** The seat's cushion above the floor. */
  seatHeight: 0.5,
  /** The pedals stand where the floor ahead of the seat has risen this far into the nose, looked for this often. */
  pedalRise: 0.1,
  pedalStep: 0.02,
  /** The pedals are this far apart about the seat's line, their faces this far above the floor under each. */
  pedalApart: 0.26,
  pedalUp: 0.05,
  /** The cyclic's grip ahead of the seat and above it, between the knees. */
  cyclicAhead: 0.4,
  cyclicUp: 0.3,
  /** The collective's grip to the seat's left (towards the cabin's middle), a little ahead, a little above. */
  collectiveIn: 0.3,
  collectiveAhead: 0.15,
  collectiveUp: 0.12,
} as const;

/** Whether a colour is the panes' paint. */
export const isGlass = ([r, , b]: Colour) => b >= r + GLASS_PAINT.bluer && b >= GLASS_PAINT.blue;

/** A texture coordinate wrapped into [0, 1), as a repeating texture reads it. */
const wrapped = (t: number) => t - Math.floor(t);

/** The triangles (by their order in the index) painted as glass under the middle of their UVs. */
export function panesOf(uvs: ArrayLike<number>, indices: ArrayLike<number>, paint: Paint): number[] {
  const glass: number[] = [];
  for (let t = 0; t < indices.length / 3; t++) {
    const corners = [0, 1, 2].map((k) => indices[t * 3 + k]!);
    const u = corners.reduce((sum, i) => sum + uvs[i * 2]!, 0) / 3;
    const v = corners.reduce((sum, i) => sum + uvs[i * 2 + 1]!, 0) / 3;
    if (isGlass(paint(wrapped(u), wrapped(v)))) glass.push(t);
  }
  return glass;
}

/** Where the pilot meets the helicopter: the seat's top, the controls' grips and the pedals' faces. */
export interface Cockpit {
  readonly seat: Point;
  readonly cyclic: Point;
  readonly collective: Point;
  readonly pedals: { readonly left: Point; readonly right: Point };
}

/** The cockpit measured, or what could not be found: the pilot's door window, the floor beside it, or the pedals. */
export type CockpitMeasured = { readonly cockpit: Cockpit } | { readonly missing: "door" | "floor" | "pedals" };

/** A pane's box and how squarely it faces across. */
interface Pane {
  readonly min: Point;
  readonly max: Point;
  readonly facing: number;
}

const middle = (pane: Pane, k: 0 | 1 | 2) => (pane.min[k] + pane.max[k]) / 2;

/** Each pane of glass (its triangles joined where they meet): its box, and its area-weighted mean |normal.x|. */
function panesIn(positions: ArrayLike<number>, glass: ArrayLike<number>): Pane[] {
  const at = (i: number): Point => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
  return partsOf(positions, glass).map(({ vertices, triangles }) => {
    const points = vertices.map(at);
    const extreme = (pick: (...values: number[]) => number): Point => [
      pick(...points.map((p) => p[0])),
      pick(...points.map((p) => p[1])),
      pick(...points.map((p) => p[2])),
    ];
    let across = 0;
    let area = 0;
    for (const t of triangles) {
      const a = at(glass[t * 3]!);
      const b = at(glass[t * 3 + 1]!);
      const c = at(glass[t * 3 + 2]!);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] as const;
      across += Math.abs(n[0]);
      area += Math.hypot(...n);
    }
    return { min: extreme(Math.min), max: extreme(Math.max), facing: area > 0 ? across / area : 0 };
  });
}

/** The middle across of the hull's box. */
function middleAcross(positions: ArrayLike<number>, hull: ArrayLike<number>) {
  const xs = Array.from(hull, (i) => positions[i * 3]!);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/**
 * The cockpit, measured from the hull and its glass (index lists into the same positions): the pilot's door window is
 * the frontmost side pane on the right at least `doorTall` tall; the seat is beside its middle, halfway from the hull's
 * middle to it, `seatHeight` above the floor there; the pedals are ahead, where the floor along the seat's line has
 * risen `pedalRise` into the nose; the cyclic and collective are set from the seat.
 */
export function cockpitOf(
  positions: ArrayLike<number>,
  hull: ArrayLike<number>,
  glass: ArrayLike<number>,
): CockpitMeasured {
  const across = middleAcross(positions, hull);
  const doors = panesIn(positions, glass).filter(
    (pane) =>
      pane.facing >= COCKPIT.sideFacing && middle(pane, 0) > across && pane.max[1] - pane.min[1] >= COCKPIT.doorTall,
  );
  if (doors.length === 0) return { missing: "door" };
  const door = doors.reduce((front, pane) => (middle(pane, 2) < middle(front, 2) ? pane : front));
  const x = (across + middle(door, 0)) / 2;
  const z = middle(door, 2);
  const floor = surfaceBottomAt(positions, hull, x, z);
  if (floor === null) return { missing: "floor" };
  const seat: Point = [x, floor + COCKPIT.seatHeight, z];
  const pedals = pedalsAhead(positions, hull, seat, floor);
  if (!pedals) return { missing: "pedals" };
  return {
    cockpit: {
      seat,
      cyclic: [x, seat[1] + COCKPIT.cyclicUp, z - COCKPIT.cyclicAhead],
      collective: [x - COCKPIT.collectiveIn, seat[1] + COCKPIT.collectiveUp, z - COCKPIT.collectiveAhead],
      pedals,
    },
  };
}

/**
 * The pedals: looked for ahead of the seat every `pedalStep` along its line until the floor there has risen `pedalRise`
 * above the floor under the seat, `pedalApart` apart about that line, each `pedalUp` above the floor under it; null when
 * the hull ends first, or has no floor under a pedal.
 */
function pedalsAhead(
  positions: ArrayLike<number>,
  hull: ArrayLike<number>,
  seat: Point,
  under: number,
): Cockpit["pedals"] | null {
  const [x, , from] = seat;
  for (let step = 1; ; step++) {
    const z = from - step * COCKPIT.pedalStep;
    const floor = surfaceBottomAt(positions, hull, x, z);
    if (floor === null) return null;
    if (floor < under + COCKPIT.pedalRise) continue;
    const pedal = (side: number): Point | null => {
      const at = x + (side * COCKPIT.pedalApart) / 2;
      const beneath = surfaceBottomAt(positions, hull, at, z);
      return beneath === null ? null : [at, beneath + COCKPIT.pedalUp, z];
    };
    const [left, right] = [pedal(-1), pedal(1)];
    return left && right ? { left, right } : null;
  }
}
