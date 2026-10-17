import { initialState, layCity, stateSnapshot } from "@citymap/ground-plan";
import type { Measures } from "@citymap/measures";
import { DATA_COLUMNS, FLOOR_HEIGHT, LOTS_BASE, LOT_FLOATS, buildScene } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { liveOptions } from "../lay/lay";
import { liveMeasures } from "../measures/live";
import { buildingOf, cityBuildings, colourChoices, colourFor, floorEnds, rampEnds, tableFor } from "./buildings";

const snapshot = stateSnapshot(
  "demo",
  "c1",
  Array.from({ length: 40 }, (_, i) => `src/f${i}.ts`),
);
const options = liveOptions();
const { city, state } = layCity(snapshot, initialState(options), options);
const scene = buildScene(city, THEMES["paper-atlas"]);
const sizes = new Map(snapshot.files.map((f, i) => [f.path, { bytes: (i + 1) * 100, lines: (i + 1) * 10 }]));
const measures: Measures = {
  ...liveMeasures(city, state.plat, snapshot, {
    source: "folder",
    size: "lines",
    comments: true,
    files: sizes,
    coverage: new Map(),
  }),
};

describe("cityBuildings", () => {
  it("gathers each lot's building and the city's scales, and nothing without measures", () => {
    const buildings = cityBuildings(measures);
    const first = scene.buildings.order[0]!;
    expect(buildingOf(buildings, first.town, first.key)?.files).toHaveLength(1);
    expect(buildings.scales.size).toEqual({ low: 20, high: 400 });
    const none = cityBuildings(null);
    expect(none.buildings.size).toBe(0);
    expect(none.scales).toEqual({ size: null, churn: null, authors: null, recency: null });
  });
});

describe("tableFor", () => {
  it("writes a lot table for the scene, and how tall each building stands", () => {
    const { table, heights } = tableFor(scene, cityBuildings(measures), "size", THEMES["paper-atlas"]);
    expect(table.length).toBe(DATA_COLUMNS * LOT_FLOATS);
    const first = scene.buildings.order[0]!;
    expect(heights.of(first.town, first.key)).toBe(LOTS_BASE + table[0]! * FLOOR_HEIGHT);
    expect(heights.top).toBe(LOTS_BASE + 12 * FLOOR_HEIGHT);
    expect(heights.of(first.town, "nothing")).toBeNull();
  });
});

describe("colourChoices and colourFor", () => {
  it("offers folder and kind always, the rest as the measures allow, with their reasons", () => {
    expect(colourChoices(measures)).toEqual([
      { by: "folder", reason: null },
      { by: "tested", reason: null },
      { by: "size", reason: null },
      { by: "kind", reason: null },
      { by: "recency", reason: "Needs the CLI's history" },
      { by: "churn", reason: "Needs the CLI's history" },
      { by: "authors", reason: "Needs the CLI's history" },
    ]);
    expect(
      colourChoices(null)
        .filter((c) => c.reason === null)
        .map((c) => c.by),
    ).toEqual(["folder", "kind"]);
    expect(colourFor("size", measures)).toBe("size");
    expect(colourFor("churn", measures)).toBe("folder");
    expect(colourFor("size", null)).toBe("folder");
  });
});

describe("rampEnds and floorEnds", () => {
  it("says each ramp's ends in the city's units", () => {
    const buildings = cityBuildings(measures);
    expect(rampEnds("tested", buildings)).toEqual(["0 %", "100 %"]);
    expect(rampEnds("size", buildings)).toEqual(["20 lines", "400 lines"]);
    expect(floorEnds(buildings)).toEqual(["20 lines", "400 lines"]);
    expect(rampEnds("churn", buildings)).toBeNull();
    const history = cityBuildings({
      ...measures,
      size: "bytes",
      lots: Object.fromEntries(
        Object.entries(measures.lots).map(([town, lots]) => [
          town,
          Object.fromEntries(
            Object.entries(lots).map(([key, lot]) => [
              key,
              { files: lot.files.map((f) => ({ ...f, changed: 1_700_000_000, commits: 3 })), authors: 1 },
            ]),
          ),
        ]),
      ),
    });
    expect(rampEnds("size", history)).toEqual(["200 bytes", "4 kB"]);
    expect(rampEnds("recency", history)![0]).toMatch(/2023/);
    expect(rampEnds("churn", history)).toEqual(["3 commits", "3 commits"]);
    expect(rampEnds("authors", history)).toEqual(["1 author", "1 author"]);
  });
});
