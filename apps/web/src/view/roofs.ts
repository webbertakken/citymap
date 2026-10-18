// Every building's name over its roof, for the Buildings view close up.
import { UNIT, centroid, type City } from "@citymap/ground-plan";
import type { Measures } from "@citymap/measures";
import { hasBuilding, type Span } from "@citymap/scene";
import { signName } from "../explore/signs";
import { filesOn } from "./buildings";
import { heightOf } from "./hover";
import type { Roof } from "./view";

/**
 * Every building's name over its roof, for the Buildings view close up: its files from its measures, else its path; at
 * its top, from the floors by its index in the whole city's order.
 */
export function roofsOf(
  place: City,
  spans: ReadonlyMap<string, Span>,
  floors: Uint8Array,
  measures: Measures | null,
): Roof[] {
  return place.towns.flatMap((town) => {
    let building = spans.get(town.key)!.first;
    return town.lots.flatMap((lot) => {
      if (!hasBuilding(lot)) return [];
      const at = building++;
      const middle = centroid(lot.pts);
      return [
        {
          text: signName(filesOn(measures, town.key, lot.key) ?? [lot.path]),
          x: middle.x / UNIT,
          y: heightOf(floors[at]!),
          z: -middle.y / UNIT,
        },
      ];
    });
  });
}
