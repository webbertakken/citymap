import type { City, Lot, Pt, Town } from "@citymap/ground-plan";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { buildingSpans, hasBuilding, lotRefs } from "./buildings";
import { buildingAt, onlyTown, pick, pickGrid, pickIndex, type PickIndex } from "./pick";
import { buildScene, focusOn } from "./scene";

// Each lot's building by its index in the whole city's order: what the Buildings view's ray reads heights by, and what
// a town shown alone draws its rows of the whole city's lot table by.

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const lot = (key: string, pts: Pt[], vacant = false): Lot => ({
  pts,
  key,
  address: `src:0.0.0.${key.length}`,
  vacant,
  path: vacant ? "" : `src/${key}.ts`,
  use: "source",
  district: 1,
});
const townAt = (key: string, x: number, lots: readonly Lot[]): Town => ({
  key,
  name: key,
  form: "polycentric",
  old: false,
  outline: box(x, 0, x + 3200, 3200),
  water: [],
  roads: [],
  blocks: [{ pts: box(x + 320, 320, x + 1280, 1280), district: 1, kind: "built" }],
  lots,
  districts: [{ pts: box(x, 0, x + 1600, 1600), path: "src", name: "src", depth: 1, massMille: 900, ward: false }],
  stats: { lots: lots.filter((l) => !l.vacant).length, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});
const city: City = {
  repository: "demo",
  commit: "c",
  towns: [
    townAt("demo", 0, [
      lot("a", box(384, 384, 448, 512)),
      lot("b", box(480, 384, 544, 512), true),
      lot("c", box(576, 384, 640, 512)),
    ]),
    // A lot of two corners has no building: it is neither drawn nor counted.
    townAt("demo/b", 4000, [
      lot("d", [
        { x: 4384, y: 384 },
        { x: 4448, y: 512 },
      ]),
      lot("e", box(4480, 384, 4544, 512)),
    ]),
    townAt("demo/empty", 8000, []),
  ],
  highways: [],
};

/** The building of what `pick` answers at a point: its lot's index in the whole city's order, else −1. */
const expected = (index: PickIndex, x: number, z: number) => {
  const hit = pick(index, x, z);
  if (hit?.kind !== "lot") return -1;
  return lotRefs(city).findIndex((ref) => ref.town === hit.townKey && ref.key === hit.key);
};

/** Every point of a raster over the city, one per 16 fixed units. */
const raster = (each: (x: number, z: number) => void) => {
  for (let x = 300; x <= 4700; x += 16) for (let y = 300; y <= 600; y += 16) each(x / 64, -y / 64);
};

describe("hasBuilding", () => {
  it("is true for a lot that is not vacant and has at least three corners", () => {
    expect(city.towns[0]!.lots.map(hasBuilding)).toEqual([true, false, true]);
    expect(city.towns[1]!.lots.map(hasBuilding)).toEqual([false, true]);
  });
});

describe("lotRefs", () => {
  it("lists every building in the order the whole city's scene draws them", () => {
    expect(lotRefs(city)).toEqual(buildScene(city, THEMES.dracula).buildings.order);
    expect(lotRefs(city).map((ref) => ref.key)).toEqual(["a", "c", "e"]);
  });
});

describe("buildingSpans", () => {
  it("cuts the whole city's buildings into each town's, in the order the town alone draws them", () => {
    const spans = buildingSpans(city);
    expect([...spans]).toEqual([
      ["demo", { first: 0, count: 2 }],
      ["demo/b", { first: 2, count: 1 }],
      ["demo/empty", { first: 3, count: 0 }],
    ]);
    for (const [key, { first, count }] of spans)
      expect(buildScene(focusOn(city, key), THEMES.dracula).buildings.order).toEqual(
        lotRefs(city).slice(first, first + count),
      );
  });
});

describe("focusOn", () => {
  it("keeps only the town of that key, without highways", () => {
    const twin: City = { ...city, highways: [{ pts: box(3200, 1600, 4000, 1600), cls: "collector" }] };
    expect(focusOn(twin, "demo/b")).toEqual({ ...city, towns: [city.towns[1]], highways: [] });
  });

  it("is the city itself for a city of one town without highways, so its scene is the same", () => {
    const one: City = { ...city, towns: [city.towns[0]!] };
    expect(focusOn(one, "demo")).toEqual(one);
    expect(buildScene(focusOn(one, "demo"), THEMES["paper-atlas"])).toEqual(buildScene(one, THEMES["paper-atlas"]));
  });
});

describe("pickGrid's buildings", () => {
  it("gives each lot with a building its index in the whole city's order, and every other entry −1", () => {
    const { building, layer } = pickGrid(city);
    expect(Array.from(building).filter((_, e) => layer[e] === 0)).toEqual([0, -1, 1, -1, 2]);
    expect(Array.from(building).filter((_, e) => layer[e] !== 0)).toEqual(
      Array.from({ length: building.length - 5 }, () => -1),
    );
  });
});

describe("buildingAt", () => {
  it("answers the building of the lot pick answers, at every point, and −1 where it answers no building", () => {
    const index = pickIndex(city);
    const answers = new Set<number>();
    raster((x, z) => {
      const b = buildingAt(index, x, z);
      answers.add(b);
      expect(b).toBe(expected(index, x, z));
    });
    expect(answers).toEqual(new Set([-1, 0, 1, 2]));
  });

  it("answers only for the town shown alone", () => {
    const index = onlyTown(pickIndex(city), "demo/b");
    const answers = new Set<number>();
    raster((x, z) => {
      const b = buildingAt(index, x, z);
      answers.add(b);
      expect(b).toBe(expected(index, x, z));
    });
    expect(answers).toEqual(new Set([-1, 2]));
  });
});
