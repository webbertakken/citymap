// Every building's name over its roof, for the Buildings view close up. The city's worker makes them once per city as
// flat arrays (the names joined, each roof's middle), so the main thread reads only the roofs near the view's centre.
import { UNIT, centroid, type City } from "@citymap/ground-plan";
import { hasBuilding, type Span } from "@citymap/scene";
import { signName } from "../explore/signs";
import type { CityBuildings } from "./buildings";
import { heightOf } from "./hover";
import type { Roof } from "./view";

/** Every building's roof, by its index in the whole city's order. */
export interface Roofs {
  /** Every building's name, joined: building b's runs from `ends[b − 1]` (0 for the first) to `ends[b]`. */
  readonly names: string;
  readonly ends: Uint32Array<ArrayBuffer>;
  /** Two per building: its roof's middle, x and z, in scene units. */
  readonly centres: Float64Array<ArrayBuffer>;
}

/** The roofs of a city's buildings: each named by its files from its measures, else its path. */
export function cityRoofs(city: City, buildings: CityBuildings): Roofs {
  const names: string[] = [];
  const centres: number[] = [];
  for (const town of city.towns)
    for (const lot of town.lots)
      if (hasBuilding(lot)) {
        names.push(signName(buildings.buildings.get(town.key)?.get(lot.key)?.files ?? [lot.path]));
        const middle = centroid(lot.pts);
        centres.push(middle.x / UNIT, -middle.y / UNIT);
      }
  let end = 0;
  return {
    names: names.join(""),
    ends: Uint32Array.from(names, (name) => (end += name.length)),
    centres: Float64Array.from(centres),
  };
}

/** The buffers under the roofs, handed over without a copy. */
export const roofBuffers = (roofs: Roofs): ArrayBuffer[] => [roofs.ends.buffer, roofs.centres.buffer];

/** What roofs a place shows near a point: those of its buildings within `reach` of it, in building order. */
export type RoofsNear = (centre: { readonly x: number; readonly z: number }, reach: number) => readonly Roof[];

/** The roofs of a place's span within reach of a point, each at its top from the floors, in building order. */
export function roofsNear(
  roofs: Roofs,
  floors: Uint8Array,
  { first, count }: Span,
  centre: { readonly x: number; readonly z: number },
  reach: number,
): Roof[] {
  const near: Roof[] = [];
  for (let b = first; b < first + count; b++) {
    const x = roofs.centres[2 * b]!;
    const z = roofs.centres[2 * b + 1]!;
    if (Math.hypot(x - centre.x, z - centre.z) > reach) continue;
    const text = roofs.names.slice(b === 0 ? 0 : roofs.ends[b - 1], roofs.ends[b]);
    near.push({ text, x, y: heightOf(floors[b]!), z });
  }
  return near;
}
