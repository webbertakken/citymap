import { UNIT } from "@citymap/ground-plan";
import { BuildingsBuilder, FLOOR_HEIGHT, LOTS_BASE, lotTable } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { footprintsOf } from "./footprints";

const ref = { town: "t", key: "a", district: 1, use: "source" } as const;

describe("footprintsOf", () => {
  it("gives each building its lot's corners on the ground and its roof's height", () => {
    const builder = new BuildingsBuilder();
    builder.add(
      [
        { x: 0, y: 0 },
        { x: 2 * UNIT, y: 0 },
        { x: 2 * UNIT, y: UNIT },
        { x: 0, y: UNIT },
      ],
      ref,
    );
    builder.add(
      [
        { x: 5 * UNIT, y: 0 },
        { x: 6 * UNIT, y: 0 },
        { x: 5 * UNIT, y: UNIT },
      ],
      { ...ref, key: "b" },
    );
    const buildings = builder.done();
    const floors = [4, 12];
    const table = lotTable(buildings.order, (r) => ({
      floors: floors[buildings.order.indexOf(r)]!,
      lit: 0,
      colour: "#000000",
      unknownSize: false,
    }));
    const [a, b] = footprintsOf(buildings, table);
    // North in the plan is −z in the scene.
    expect(a).toEqual({
      lot: 0,
      corners: [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        { x: 2, z: -1 },
        { x: 0, z: -1 },
      ],
      top: LOTS_BASE + 4 * FLOOR_HEIGHT,
    });
    expect(b?.corners).toHaveLength(3);
    expect(b?.top).toBe(LOTS_BASE + 12 * FLOOR_HEIGHT);
  });
});
