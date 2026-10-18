import type { City, Pt, Town } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { onlyTown, pick, pickBuffers, pickFrom, pickGrid, pickIndex, type PickIndex } from "./pick";

// The pick index's flat form: what the layout worker builds and hands over, attached on the main thread.

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const townAt = (key: string, name: string, x: number): Town => ({
  key,
  name,
  form: "polycentric",
  old: false,
  outline: box(x, 0, x + 3200, 3200),
  water: [],
  roads: [
    {
      pts: [
        { x, y: 1600 },
        { x: x + 3200, y: 1600 },
      ],
      cls: "street",
    },
  ],
  blocks: [{ pts: box(x + 320, 320, x + 1280, 1280), district: 1, kind: "built" }],
  lots: [
    {
      pts: box(x + 384, 384, x + 448, 512),
      key: "a@0",
      address: "src:0.0.0.0",
      vacant: false,
      path: "src/a.ts",
      use: "source",
      district: 1,
    },
    {
      pts: box(x + 480, 384, x + 544, 512),
      key: "b@0",
      address: "src:0.0.0.1",
      vacant: true,
      path: "",
      use: "source",
      district: 1,
    },
  ],
  districts: [
    { pts: box(x, 0, x + 1600, 1600), path: "src", name: "src", depth: 1, massMille: 900, ward: false },
    { pts: box(x, 0, x + 800, 800), path: "src/deep", name: "deep", depth: 2, massMille: 400, ward: false },
    { pts: box(x, 0, x + 400, 400), path: "#w", name: "w", depth: 1, massMille: 100, ward: true },
    // A shape without points lies in no cell.
    { pts: [], path: "empty", name: "empty", depth: 1, massMille: 0, ward: false },
  ],
  stats: { lots: 1, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});
const city: City = {
  repository: "demo",
  commit: "c",
  towns: [townAt("demo", "demo", 0), townAt("demo/b", "b", 4000)],
  highways: [
    {
      pts: [
        { x: 3100, y: 2000 },
        { x: 4100, y: 2000 },
      ],
      cls: "collector",
    },
  ],
};

/** Every hit on a raster over the city and a margin round it, one per 50 fixed units. */
const raster = (index: PickIndex) => {
  const hits = [];
  for (let x = -200; x <= 7400; x += 50) for (let y = -200; y <= 3400; y += 50) hits.push(pick(index, x / 64, -y / 64));
  return hits;
};

describe("pickGrid", () => {
  it("answers after a structured clone as the index built in place, at every point", () => {
    const copied = pickFrom(city, structuredClone(pickGrid(city)));
    const hits = raster(copied);
    expect(hits).toEqual(raster(pickIndex(city)));
    // Every kind of hit is on the raster, so the comparison covers them all.
    expect(new Set(hits.map((h) => h?.kind ?? null))).toEqual(
      new Set(["lot", "block", "road", "district", "town", null]),
    );
  });

  it("lists a grid over the cells the city touches, each entry in every cell its box touches", () => {
    const grid = pickGrid(city);
    // Two towns of 2 lots, a block, a road, 3 labelled districts and an outline; and the highway.
    expect(grid.layer).toHaveLength(2 * 8 + 1);
    // A street's ends, grown by half its width, reach one cell west of the first town.
    expect(grid).toMatchObject({ column0: -1, row0: 0, columns: 16, rows: 7 });
    expect(grid.starts).toHaveLength(grid.columns * grid.rows + 1);
    expect(grid.starts.at(-1)).toBe(grid.members.length);
    expect(Array.from(grid.ends.slice(-2))).toEqual([0, 1]);
  });

  it("lists every buffer once, so all of them can be handed over without a copy", () => {
    const grid = pickGrid(city);
    const buffers = pickBuffers(grid);
    expect(new Set(buffers).size).toBe(buffers.length);
    const moved = structuredClone(grid, { transfer: buffers });
    expect(grid.members.byteLength).toBe(0);
    expect(pick(pickFrom(city, moved), 416 / 64, -448 / 64)).toMatchObject({ kind: "lot", path: "src/a.ts" });
  });

  it("is empty for a city with nothing on it", () => {
    const grid = pickGrid({ ...city, towns: [], highways: [] });
    expect(grid).toMatchObject({ columns: 0, rows: 0 });
    expect(pick(pickFrom({ ...city, towns: [], highways: [] }, grid), 0, 0)).toBeNull();
  });
});

describe("pickFrom", () => {
  it("answers a lot, road, district or town with the same hit every time, and a block afresh", () => {
    const index = pickIndex(city);
    const lot = pick(index, 416 / 64, -448 / 64);
    expect(pick(index, 400 / 64, -400 / 64)).toBe(lot);
    const block = pick(index, 1000 / 64, -1000 / 64);
    expect(block).toMatchObject({ kind: "block", folder: "src" });
    expect(pick(index, 1000 / 64, -1000 / 64)).not.toBe(block);
    expect(pick(index, 1000 / 64, -1000 / 64)).toEqual(block);
  });
});

describe("onlyTown", () => {
  it("answers as the city with only that town would, at every point", () => {
    const whole = pickIndex(city);
    for (const town of city.towns) {
      const alone = pickIndex({ ...city, towns: [town], highways: [] });
      expect(raster(onlyTown(whole, town.key))).toEqual(raster(alone));
    }
  });

  it("answers nothing for a town the city does not hold", () => {
    expect(raster(onlyTown(pickIndex(city), "elsewhere")).every((hit) => hit === null)).toBe(true);
  });
});
