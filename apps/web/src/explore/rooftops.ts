// The roofs a helicopter can land on: where a roof's middle leaves the rotor room, with a margin, by the same rule the
// rotor lands by. A city of narrow lots has few, so the walk marks the nearest while flying, as GTA marks its helipads.
// Each roof is worked out once, when it first comes near. Metres.
import { solid, type Footprint, type Vec3, type Walls } from "@citymap/world";
import { nearbyLots, streetGrid } from "./physics/streets";
import { roomToLand } from "./vehicles";

/** A roof is marked when its middle has room for the rotor and this many metres more. */
export const ROOFTOP_MARGIN = 0.5;
/** The marked roofs are looked for this far round the helicopter, and at most this many are marked. */
export const ROOFTOP_REACH = 300;
export const ROOFTOP_MOST = 6;

/** A roof to land on: its building, the middle of its roof, and how far that lies from where it was asked. */
export interface Rooftop {
  readonly lot: number;
  readonly at: Vec3;
  readonly distance: number;
}

/** The city's roofs with room, asked for near a point. */
export interface Rooftops {
  /** The nearest marked roofs within \`reach\` metres of a point on the ground, nearest first, at most \`ROOFTOP_MOST\`. */
  readonly near: (at: { readonly x: number; readonly z: number }, reach: number) => readonly Rooftop[];
}

/** The roofs of a city's buildings that a helicopter can land on, as its walls stand. */
export function rooftops(footprints: readonly Footprint[], walls: Walls): Rooftops {
  const grid = streetGrid(footprints);
  const tops = new Map(footprints.filter(solid).map((f) => [f.lot, f.top]));
  const known = new Map<number, Vec3 | null>();
  const roofOf = (lot: number) => {
    const seen = known.get(lot);
    if (seen !== undefined) return seen;
    const { middle } = grid.standing.get(lot)!;
    const top = tops.get(lot)!;
    const at = { x: middle.x, y: top, z: middle.z };
    const roof = roomToLand(at, top, walls, ROOFTOP_MARGIN) ? at : null;
    known.set(lot, roof);
    return roof;
  };
  return {
    near: (at, reach) =>
      nearbyLots(grid, { x: at.x, z: at.z }, reach)
        .flatMap((lot) => {
          const roof = roofOf(lot);
          const distance = roof ? Math.hypot(roof.x - at.x, roof.z - at.z) : Infinity;
          return roof && distance <= reach ? [{ lot, at: roof, distance }] : [];
        })
        .toSorted((a, b) => a.distance - b.distance || a.lot - b.lot)
        .slice(0, ROOFTOP_MOST),
  };
}
