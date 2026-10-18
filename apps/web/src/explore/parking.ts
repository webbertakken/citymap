// Vehicles parked about the city, worked out from its plan so a city always has the same ones in the same places:
// kerb places at even steps along every street, alternating sides, each filled (or not) by a hash of its road and its
// place; never in a junction nor where the walk lands. The walk keeps the nearest to its landing, so a large city
// costs what a small one does. Metres; headings as the walker's.
import { UNIT, roadWidth, type City, type Pt } from "@citymap/ground-plan";
import { GROUND, type Walls } from "@citymap/world";
import type { Landing } from "./landing";
import { METRE, STREET_CLASSES } from "./street";
import { PARKING, VEHICLES, standing, type Vehicle, type VehicleKind } from "./vehicles";

/** A kerb place every this many metres along a street. */
export const PLACE_GAP = 24;
/** No place within this many metres of a road's end: a junction. */
export const JUNCTION_GAP = 8;
/** No place within this many metres of the landing: the landing's own pair stands there. */
export const LANDING_CLEAR = 16;
/** Of the places, these shares hold a bicycle and a car; the rest stand empty. */
export const BICYCLE_SHARE = 0.3;
export const CAR_SHARE = 0.3;
/** The walk keeps this many, the nearest its landing. */
export const PARKED_MOST = 200;
/** Road ends are found through a grid of cells this many metres square. */
const END_CELL = 16;

/** A road's place, hashed to a number in [0, 1): the same for the same road and place, every time. */
export function placeHash(road: number, place: number): number {
  let h = Math.imul(road ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(place ^ 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** A plan point (fixed units, y north) in metres (z south). */
const metresOf = (p: Pt) => ({ x: p.x / UNIT / METRE, z: -p.y / UNIT / METRE });

/** The grid cell a point is in. */
const key = (x: number, z: number) => `${Math.floor(x / END_CELL)},${Math.floor(z / END_CELL)}`;

/** Every road's ends, in a grid, to ask whether a point is in a junction. */
function junctions(roads: readonly { readonly pts: readonly Pt[] }[]) {
  const cells = new Map<string, { x: number; z: number }[]>();
  for (const road of roads)
    for (const end of [road.pts[0], road.pts.at(-1)]) {
      if (!end) continue;
      const at = metresOf(end);
      cells.set(key(at.x, at.z), [...(cells.get(key(at.x, at.z)) ?? []), at]);
    }
  return (x: number, z: number) => {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const end of cells.get(key(x + i * END_CELL, z + j * END_CELL)) ?? [])
          if (Math.hypot(end.x - x, end.z - z) <= JUNCTION_GAP) return true;
    return false;
  };
}

/** A filled kerb place: what stands there, where on the road, which kerb, and how far it is from the landing. */
interface Place {
  readonly id: string;
  readonly kind: VehicleKind;
  readonly at: { readonly x: number; readonly z: number };
  readonly along: { readonly x: number; readonly z: number };
  readonly side: 1 | -1;
  readonly half: number;
  readonly crank: number;
  readonly distance: number;
}

/** The filled kerb places along one street (the `index`th), each with its distance from the landing (metres). */
function placesOn(
  road: { readonly pts: readonly Pt[] },
  index: number,
  half: number,
  landing: { x: number; z: number },
) {
  const places: Place[] = [];
  let k = 0;
  let from = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const a = metresOf(road.pts[i - 1]!);
    const b = metresOf(road.pts[i]!);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const along = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
    for (let s = (k + 0.5) * PLACE_GAP; s < from + length; k++, s = (k + 0.5) * PLACE_GAP) {
      const u = placeHash(index, k);
      if (u >= BICYCLE_SHARE + CAR_SHARE) continue;
      const at = { x: a.x + along.x * (s - from), z: a.z + along.z * (s - from) };
      places.push({
        id: `parked-${index}-${k}`,
        kind: u < BICYCLE_SHARE ? "bicycle" : "car",
        at,
        along,
        side: k % 2 === 0 ? 1 : -1,
        half,
        crank: placeHash(index, -1 - k) * 2 * Math.PI,
        distance: Math.hypot(at.x - landing.x, at.z - landing.z),
      });
    }
    from += length;
  }
  return places;
}

/**
 * The city's own parked vehicles, the `PARKED_MOST` nearest the landing, nearest first: at the kerb on the right of a
 * street facing along it, or on the left facing back, each moved out from the road's middle as far as the walls let it.
 */
export function parkedIn(city: City, landing: Landing, walls: Walls): Vehicle[] {
  const roads = city.towns.flatMap((town) => town.roads);
  const inJunction = junctions([...roads, ...city.highways]);
  const landed = { x: landing.at.x / METRE, z: landing.at.z / METRE };
  const places = roads
    .flatMap((road, index) =>
      STREET_CLASSES.has(road.cls) ? placesOn(road, index, roadWidth(road) / UNIT / METRE / 2, landed) : [],
    )
    .filter((place) => place.distance > LANDING_CLEAR && !inJunction(place.at.x, place.at.z))
    .toSorted((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1))
    .slice(0, PARKED_MOST);
  return places.map(({ id, kind, at, along, side, half, crank }) => {
    // The right of a direction along the ground is it turned a quarter clockwise from above.
    const out = Math.max(0, half - PARKING[kind].inset) * side;
    const middle = { x: at.x, y: GROUND, z: at.z };
    const placed = walls.move(middle, { x: -along.z * out, y: 0, z: along.x * out }, VEHICLES[kind].radius);
    const heading = Math.atan2(-along.z * side, along.x * side);
    return standing(id, kind, placed.feet, heading, crank);
  });
}
