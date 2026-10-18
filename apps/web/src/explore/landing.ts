// Where going down into the city puts a person: in front of the selected building, facing it; otherwise on the road
// nearest the middle of the map, facing along it. Scene units.
import { UNIT, centroid, roadWidth, type City, type Pt } from "@citymap/ground-plan";
import type { Hit } from "@citymap/scene";
import { METRE } from "./street";

interface Point {
  readonly x: number;
  readonly z: number;
}

/** Where to stand, which way to face (a turn about y from +x), and why there. */
export interface Landing {
  readonly at: Point;
  readonly heading: number;
  readonly kind: "selected" | "road";
}

/** In front of a building, a person stands this far, in metres, inside the road's edge. */
export const KERB_GAP = 1;

/** A plan point (fixed units, y north) in the scene (street widths, z south). */
const sceneOf = (p: Pt): Point => ({ x: p.x / UNIT, z: -p.y / UNIT });

/** The turn about y that faces a model built along +x in a direction on the ground. */
export const headingTowards = (dx: number, dz: number) => Math.atan2(-dz, dx);

/** The nearest point on any road to a point: where it is, the road's direction there and its width. */
function nearestRoad(city: City, q: Point) {
  let best: { at: Point; dx: number; dz: number; width: number; distance: number } | null = null;
  for (const road of [...city.highways, ...city.towns.flatMap((t) => t.roads)])
    for (let i = 1; i < road.pts.length; i++) {
      const a = sceneOf(road.pts[i - 1]!);
      const b = sceneOf(road.pts[i]!);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length2 = dx * dx + dz * dz;
      if (length2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / length2));
      const at = { x: a.x + dx * t, z: a.z + dz * t };
      const distance = Math.hypot(q.x - at.x, q.z - at.z);
      if (best && best.distance <= distance) continue;
      const length = Math.sqrt(length2);
      best = { at, dx: dx / length, dz: dz / length, width: roadWidth(road) / UNIT, distance };
    }
  return best;
}

/** The selected lot's middle, when a lot is selected and the city holds it. */
function selectedLot(city: City, selected: Hit | null): Point | null {
  if (selected?.kind !== "lot") return null;
  const lot = city.towns.find((t) => t.key === selected.townKey)?.lots.find((l) => l.key === selected.key);
  return lot ? sceneOf(centroid(lot.pts)) : null;
}

/** Where to land: before the selected building, else on the road nearest `centre`; null in a city without roads. */
export function landingOf(city: City, selected: Hit | null, centre: Point): Landing | null {
  const building = selectedLot(city, selected);
  const road = nearestRoad(city, building ?? centre);
  if (!road) return null;
  if (!building) return { at: road.at, heading: headingTowards(road.dx, road.dz), kind: "road" };
  // From the road towards the building: stand just inside the road's edge on the building's side, facing it.
  const dx = building.x - road.at.x;
  const dz = building.z - road.at.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return { at: road.at, heading: headingTowards(road.dx, road.dz), kind: "selected" };
  const inside = Math.max(0, Math.min(road.width / 2 - KERB_GAP * METRE, road.distance));
  return {
    at: { x: road.at.x + (dx / length) * inside, z: road.at.z + (dz / length) * inside },
    heading: headingTowards(dx, dz),
    kind: "selected",
  };
}
