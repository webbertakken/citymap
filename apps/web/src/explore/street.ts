// Where to stand in a city: the longest straight run of a street, in scene units (one street width is 10 m).
import { UNIT, roadWidth, type City, type RoadClass } from "@citymap/ground-plan";

/** Scene units per metre: a street width, one scene unit, is ten metres. */
export const METRE = 0.1;

/** A straight piece of road: where it starts, its unit direction along the ground, its length and its width. */
export interface Street {
  readonly start: { readonly x: number; readonly z: number };
  readonly along: { readonly x: number; readonly z: number };
  readonly length: number;
  readonly width: number;
}

/** Roads that people walk and ride along, rather than a lane between back gardens or a highway between towns. */
export const STREET_CLASSES: ReadonlySet<RoadClass> = new Set<RoadClass>([
  "street",
  "collector",
  "avenue",
  "boulevard",
]);

/** Consecutive segments whose directions differ by less than this (radians) are one straight run. */
const STRAIGHT = 0.02;

/** How far one direction turns from another, in radians, the short way round. */
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

/** The longest straight run of any town's street, joining roads end to end, or null for a city without one. */
export function longestStreet(city: City): Street | null {
  // Roads are laid as many short pieces; pieces that meet end to end in the same direction are one street.
  const pieces = city.towns.flatMap((town) =>
    town.roads
      .filter((road) => STREET_CLASSES.has(road.cls))
      .flatMap((road) =>
        road.pts.slice(1).map((b, i) => {
          const a = road.pts[i]!;
          return { a, b, angle: Math.atan2(b.y - a.y, b.x - a.x), width: roadWidth(road) / UNIT };
        }),
      )
      .filter((p) => p.a.x !== p.b.x || p.a.y !== p.b.y),
  );
  const startingAt = new Map<string, (typeof pieces)[number][]>();
  for (const p of pieces) {
    const key = `${p.a.x},${p.a.y}`;
    startingAt.set(key, [...(startingAt.get(key) ?? []), p]);
  }
  const ahead = (p: (typeof pieces)[number]) =>
    startingAt.get(`${p.b.x},${p.b.y}`)?.find((n) => turn(p.angle, n.angle) < STRAIGHT);
  const continued = new Set(pieces.map(ahead).filter((p) => p !== undefined));
  let best: Street | null = null;
  for (const first of pieces) {
    if (continued.has(first)) continue;
    // A gentle curve of many short pieces can come round to where it joined: each piece is walked once.
    const walked = new Set([first]);
    let last = first;
    for (let next = ahead(last); next && !walked.has(next); next = ahead(last)) {
      walked.add(next);
      last = next;
    }
    const dx = (last.b.x - first.a.x) / UNIT;
    const dz = -(last.b.y - first.a.y) / UNIT;
    const length = Math.hypot(dx, dz);
    if (best && best.length >= length) continue;
    best = {
      start: { x: first.a.x / UNIT, z: -first.a.y / UNIT },
      along: { x: dx / length, z: dz / length },
      length,
      width: first.width,
    };
  }
  return best;
}

/** A point on a street: so many metres along it from its start, and so many to its left (negative: its right). */
export function onStreet(street: Street, along: number, left: number) {
  const a = along * METRE;
  const l = left * METRE;
  return {
    x: street.start.x + street.along.x * a + street.along.z * l,
    z: street.start.z + street.along.z * a - street.along.x * l,
  };
}

/** The heading about y (radians) that turns a model facing +x to face along the street. */
export const headingOf = (street: Street) => Math.atan2(-street.along.z, street.along.x);
