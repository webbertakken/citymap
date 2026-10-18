// Every building as solid ground for movers: its footprint (the lot's polygon) and how high it stands, read from the
// scene's building mesh and the lot table the viewer draws it from, in metres, as the world measures.
import { FLOOR_HEIGHT, LOTS_BASE, LOT_FLOATS, type Buildings } from "@citymap/scene";
import type { Footprint } from "@citymap/world";
import { METRE } from "./street";

/**
 * The buildings' footprints, in their order. A roof's vertices are the lot's corners: each vertex of the building mesh
 * whose facade is −1 is a roof corner of its lot; its height is the lot's floors on the lots' base.
 */
export function footprintsOf(buildings: Buildings, table: Float32Array): Footprint[] {
  const corners = buildings.order.map((): { x: number; z: number }[] => []);
  for (let v = 0; v < buildings.lots.length; v++) {
    if (buildings.facades[v * 2] !== -1) continue;
    corners[buildings.lots[v]!]!.push({
      x: buildings.positions[v * 3]! / METRE,
      z: buildings.positions[v * 3 + 2]! / METRE,
    });
  }
  return corners.map((points, lot) => ({
    lot,
    corners: points,
    top: (LOTS_BASE + table[lot * LOT_FLOATS]! * FLOOR_HEIGHT) / METRE,
  }));
}
