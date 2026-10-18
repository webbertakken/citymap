import { cityWalls, type Footprint } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { ROTOR_RADIUS } from "./helicopter";
import { ROOFTOP_MARGIN, ROOFTOP_MOST, ROOFTOP_REACH, rooftops, type Rooftops } from "./rooftops";
import { roomToLand } from "./vehicles";

/** A building from (x0, z0) to (x1, z1), metres, this tall. */
const block = (lot: number, x0: number, z0: number, x1: number, z1: number, top: number): Footprint => ({
  lot,
  corners: [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ],
  top,
});

/** The rooftops of buildings, with the walls they make. */
const of = (footprints: readonly Footprint[]): Rooftops => rooftops(footprints, cityWalls(footprints));

describe("rooftops", () => {
  it("marks the roofs whose middle has room for the rotor, with a margin, nearest first", () => {
    // A wide low roof, a narrow one beside a taller neighbour, and the taller neighbour itself.
    const wide = block(0, 0, 0, 20, 20, 5);
    const narrow = block(1, 30, 0, 35, 20, 5);
    const taller = block(2, 35, 0, 40, 20, 10);
    const roofs = of([wide, narrow, taller]);
    const near = roofs.near({ x: 0, z: 0 }, 100);
    expect(near.map((r) => r.lot)).toEqual([0, 2]);
    expect(near[0]).toEqual({ lot: 0, at: { x: 10, y: 5, z: 10 }, distance: Math.hypot(10, 10) });
    expect(near[1]!.at).toEqual({ x: 37.5, y: 10, z: 10 });
    // Each one's middle has room with the margin to spare, as the rotor's own rule says.
    for (const roof of near)
      expect(roomToLand(roof.at, roof.at.y, cityWalls([wide, narrow, taller]), ROOFTOP_MARGIN)).toBe(true);
  });

  it("holds no roof with a neighbour taller within the rotor's reach and its margin", () => {
    const roof = block(0, 0, 0, 20, 20, 5);
    // Just inside the reach and its margin from the roof's middle (10, 10).
    const close = block(1, 10 + ROTOR_RADIUS + ROOFTOP_MARGIN - 0.1, 0, 40, 20, 9);
    expect(
      of([roof, close])
        .near({ x: 10, z: 10 }, 50)
        .map((r) => r.lot),
    ).toEqual([1]);
    const clear = block(1, 10 + ROTOR_RADIUS + ROOFTOP_MARGIN + 0.1, 0, 40, 20, 9);
    expect(
      of([roof, clear])
        .near({ x: 10, z: 10 }, 50)
        .map((r) => r.lot),
    ).toEqual([0, 1]);
  });

  it("gives at most a few, within a reach, and none from an empty city", () => {
    const many = Array.from({ length: 20 }, (_, i) => block(i, i * 30, 0, i * 30 + 20, 20, 5));
    const near = of(many).near({ x: 0, z: 0 }, ROOFTOP_REACH);
    expect(near).toHaveLength(ROOFTOP_MOST);
    expect(near.map((r) => r.lot)).toEqual([0, 1, 2, 3, 4, 5]);
    // The second roof's middle is 41.2 m off.
    expect(of(many).near({ x: 0, z: 0 }, 45).length).toBe(2);
    expect(of(many).near({ x: 0, z: 0 }, 40).length).toBe(1);
    expect(of([]).near({ x: 0, z: 0 }, ROOFTOP_REACH)).toEqual([]);
    // Two as near as each other: by their lots.
    const pair = [block(5, 10, 0, 30, 20, 5), block(3, -30, 0, -10, 20, 5)];
    expect(
      of(pair)
        .near({ x: 0, z: 10 }, 100)
        .map((r) => r.lot),
    ).toEqual([3, 5]);
  });

  it("works out each roof once, however often it is asked", () => {
    let probes = 0;
    const footprints = [block(0, 0, 0, 20, 20, 5)];
    const walls = cityWalls(footprints);
    const counted = rooftops(footprints, {
      ...walls,
      move: (...args) => {
        probes++;
        return walls.move(...args);
      },
    });
    counted.near({ x: 0, z: 0 }, 100);
    const first = probes;
    counted.near({ x: 5, z: 5 }, 100);
    expect(first).toBeGreaterThan(0);
    expect(probes).toBe(first);
  });
});
