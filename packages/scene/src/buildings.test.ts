import { UNIT } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { BuildingsBuilder, DATA_COLUMNS, LOT_FLOATS, UNKNOWN_SIZE, lotTable, packColour } from "./buildings";

const square = [
  { x: 0, y: 0 },
  { x: 2 * UNIT, y: 0 },
  { x: 2 * UNIT, y: UNIT },
  { x: 0, y: UNIT },
];
const ref = { town: "t", key: "a@0", district: 3, use: "source" } as const;

describe("BuildingsBuilder", () => {
  it("builds a roof and a wall per edge, each vertex with its lot, ring and place along its wall", () => {
    const builder = new BuildingsBuilder();
    builder.add(square, ref);
    builder.add(square.slice(0, 2), { ...ref, key: "line@0" });
    builder.add(square, { ...ref, key: "b@0" });
    const b = builder.done();
    expect(b.order.map((r) => r.key)).toEqual(["a@0", "b@0"]);
    expect(b.positions.length / 3).toBe(2 * (4 + 16));
    expect(b.lots.slice(0, 20).every((l) => l === 0)).toBe(true);
    expect(b.lots[20]).toBe(1);
    // The roof: every vertex at the top, no wall.
    expect(Array.from(b.positions.slice(0, 12))).toEqual([0, 1, 0, 2, 1, 0, 2, 1, -1, 0, 1, -1]);
    expect(Array.from(b.facades.slice(0, 2))).toEqual([-1, -1]);
    // The first wall runs 2 street widths: from its start at the foot to its end at the top.
    expect(Array.from(b.facades.slice(8, 16))).toEqual([0, 2, 2, 2, 2, 2, 0, 2]);
    expect(Array.from(b.positions.slice(12, 24)).filter((_, i) => i % 3 === 1)).toEqual([0, 0, 1, 1]);
    expect(b.indices.length).toBe(2 * (2 * 3 + 4 * 6));
    expect(Math.max(...b.indices)).toBe(b.positions.length / 3 - 1);
  });
});

describe("lotTable", () => {
  it("packs four floats per lot into whole rows, the colour exactly", () => {
    const table = lotTable([ref, { ...ref, key: "b" }], (r) => ({
      floors: r.key === "b" ? 12 : 1,
      lit: r.key === "b" ? -1 : 0.5,
      colour: "#FFD27A",
      unknownSize: r.key === "b",
    }));
    expect(table.length).toBe(DATA_COLUMNS * LOT_FLOATS);
    expect(Array.from(table.slice(0, 8))).toEqual([1, 0.5, 0xffd27a, 0, 12, -1, 0xffd27a, UNKNOWN_SIZE]);
    expect(packColour("#ffffff")).toBe(16_777_215);
    expect(lotTable([], () => ({ floors: 1, lit: 0, colour: "#000000", unknownSize: false })).length).toBe(
      DATA_COLUMNS * LOT_FLOATS,
    );
  });
});
