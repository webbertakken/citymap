// What the walk knows of a building, by its lot's index: its card's details, picked at the middle of its footprint in
// the map's index, and its files in order, from its measures (else the one file the card names).
import { pick, type Hit, type PickIndex, type Scene } from "@citymap/scene";
import type { Footprint } from "@citymap/world";
import { buildingOf, type CityBuildings } from "../view/buildings";
import { METRE } from "./street";

export type Inspect = (lot: number) => { readonly hit: Hit | null; readonly files: readonly string[] };

export function inspector(
  scene: Scene,
  footprints: readonly Footprint[],
  index: PickIndex,
  buildings: CityBuildings,
): Inspect {
  return (lot) => {
    const ref = scene.buildings.order[lot];
    const footprint = footprints[lot];
    if (!ref || !footprint) return { hit: null, files: [] };
    const n = footprint.corners.length;
    const x = footprint.corners.reduce((sum, c) => sum + c.x, 0) / n;
    const z = footprint.corners.reduce((sum, c) => sum + c.z, 0) / n;
    const found = pick(index, x * METRE, z * METRE);
    // The middle of a convex lot lies in it; anything else there is not this building.
    const hit = found?.kind === "lot" && found.townKey === ref.town && found.key === ref.key ? found : null;
    const files = buildingOf(buildings, ref.town, ref.key)?.files ?? (hit?.path ? [hit.path] : []);
    return { hit, files };
  };
}
