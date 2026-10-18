import type { BuildingHit } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { BASE, FLOOR, PITCH, sightOf, windowRows } from "./sight";

/** A hit on a 10 m wall (four 2.5 m window columns), so far along it and so high. */
const wall = (along: number, y: number, length = 10): BuildingHit => ({
  lot: 3,
  at: { x: 0, y, z: 0 },
  face: { kind: "wall", edge: 0, along, length },
});
/** The middle of window `column` on floor `row` (both from 0). */
const middle = (column: number, row: number) => wall((column + 0.5) * PITCH, BASE + (row + 0.55) * FLOOR);

/** Which file a window on floor `row` of a six-floor building of three files is. */
const fileOn = (row: number) => {
  const sight = sightOf(middle(0, row), { floors: 6, lit: 1 }, 3);
  return sight.kind === "window" ? sight.file : null;
};

describe("sightOf", () => {
  it("reads a window in the middle of its cell, by floor from the bottom", () => {
    expect(sightOf(middle(1, 2), { floors: 6, lit: 1 }, 1)).toEqual({
      kind: "window",
      lot: 3,
      floor: 3,
      floors: 6,
      file: 0,
      lit: true,
    });
  });

  it("reads the wall between windows, the floor slab, a roof, and above the top floor as the building", () => {
    expect(sightOf(wall(0.1 * PITCH, BASE + 0.55 * FLOOR), { floors: 3, lit: 1 }, 1)).toEqual({
      kind: "building",
      lot: 3,
    });
    expect(sightOf(wall(0.5 * PITCH, BASE + 0.1 * FLOOR), { floors: 3, lit: 1 }, 1).kind).toBe("building");
    expect(sightOf(middle(0, 3), { floors: 3, lit: 1 }, 1).kind).toBe("building");
    expect(sightOf(wall(0, BASE - 0.1), { floors: 3, lit: 1 }, 1).kind).toBe("building");
    expect(sightOf({ lot: 3, at: { x: 0, y: 9, z: 0 }, face: { kind: "roof" } }, { floors: 3, lit: 1 }, 1)).toEqual({
      kind: "building",
      lot: 3,
    });
  });

  it("lights windows as the shader does: a share of them, evenly spread, in order along each floor", () => {
    // A share of a half lights every other window: the second, fourth…
    const lit = [0, 1, 2, 3].map((column) => {
      const sight = sightOf(middle(column, 0), { floors: 2, lit: 0.5 }, 1);
      return sight.kind === "window" && sight.lit;
    });
    expect(lit).toEqual([false, true, false, true]);
    expect(sightOf(middle(0, 0), { floors: 2, lit: 0 }, 1)).toMatchObject({ lit: false });
    expect(sightOf(middle(0, 0), { floors: 2, lit: -1 }, 1)).toMatchObject({ lit: null });
  });

  it("gives each file of a shared building its band of floors", () => {
    expect([0, 1, 2, 3, 4, 5].map(fileOn)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("keeps at least one column on a narrow wall, and the last column to the wall's end", () => {
    const narrow = sightOf(wall(0.5, BASE + 0.55 * FLOOR, 1), { floors: 1, lit: 1 }, 0);
    expect(narrow).toMatchObject({ kind: "window", file: 0 });
    // On an 11 m wall the four columns stretch to 2.75 m: the end is still the fourth.
    expect(sightOf(wall(10.3, BASE + 0.55 * FLOOR, 11), { floors: 1, lit: 1 }, 1).kind).toBe("window");
  });
});

describe("windowRows", () => {
  it("says the floor, the file's share of a shared building, and what its light means", () => {
    const window = { kind: "window", lot: 0, floor: 2, floors: 5, file: 1, lit: true } as const;
    expect(windowRows(window, 3)).toEqual([
      { label: "Window", value: "Floor 2 of 5" },
      { label: "Shared", value: "File 2 of 3", note: "Each file has a share of the floors" },
      { label: "Light", value: "Lit", note: "Lit windows are the share of the file its tests reach" },
    ]);
    expect(windowRows({ ...window, lit: false }, 1).map((r) => r.value)).toEqual(["Floor 2 of 5", "Dark"]);
    expect(windowRows({ ...window, lit: null }, 1)[1]).toMatchObject({ value: "Not known" });
  });
});
