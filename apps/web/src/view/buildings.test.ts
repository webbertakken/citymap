import { initialState, layCity, stateSnapshot } from "@citymap/ground-plan";
import type { Measures } from "@citymap/measures";
import {
  DATA_COLUMNS,
  LOT_FLOATS,
  buildScene,
  buildingSpans,
  focusOn,
  lookOf,
  lotRefs,
  lotTable,
} from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { liveOptions } from "../lay/lay";
import { liveMeasures } from "../measures/live";
import {
  cityBuildings,
  cityFloors,
  colourChoices,
  colourFor,
  filesOn,
  floorEnds,
  lotBuilding,
  placeTable,
  rampEnds,
  tableFor,
} from "./buildings";

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
    expect(buildings.buildings.get(first.town)?.get(first.key)?.files).toHaveLength(1);
    expect(buildings.scales.size).toEqual({ low: 20, high: 400 });
    const none = cityBuildings(null);
    expect(none.buildings.size).toBe(0);
    expect(none.scales).toEqual({ size: null, churn: null, authors: null, recency: null });
  });
});

describe("lotBuilding and filesOn", () => {
  it("aggregate one lot's measures when asked, and name its files, by its own keys only", () => {
    const first = scene.buildings.order[0]!;
    const whole = cityBuildings(measures).buildings.get(first.town)!.get(first.key)!;
    expect(lotBuilding(measures, first.town, first.key)).toEqual(whole);
    expect(filesOn(measures, first.town, first.key)).toEqual(whole.files);
    expect(lotBuilding(measures, first.town, "nothing")).toBeUndefined();
    expect(lotBuilding(measures, "constructor", "toString")).toBeUndefined();
    expect(filesOn(measures, first.town, "constructor")).toBeUndefined();
    expect(lotBuilding(null, first.town, first.key)).toBeUndefined();
    expect(filesOn(null, first.town, first.key)).toBeUndefined();
  });
});

describe("tableFor and cityFloors", () => {
  it("write the whole city's lot table and each building's floors, in the scene's order", () => {
    const refs = lotRefs(city);
    const buildings = cityBuildings(measures);
    const table = tableFor(refs, buildings, "size", THEMES["paper-atlas"]);
    expect(table.length).toBe(DATA_COLUMNS * LOT_FLOATS);
    expect(table).toEqual(
      lotTable(refs, (ref) =>
        lookOf(ref, buildings.buildings.get(ref.town)?.get(ref.key), buildings.scales, "size", THEMES["paper-atlas"]),
      ),
    );
    const floors = cityFloors(refs, buildings);
    expect(Array.from(floors)).toEqual(refs.map((_, i) => table[i * LOT_FLOATS]));
    expect(Math.max(...floors)).toBe(12);
    expect(Math.min(...floors)).toBe(1);
    expect(Array.from(cityFloors(refs, cityBuildings(null)))).toEqual(refs.map(() => 1));
  });
});

describe("placeTable", () => {
  it("gives a town alone the rows of its buildings, as its own table would be", () => {
    // The laid town, and a copy of it beside it under another key, without measures of its own.
    const two = { ...city, towns: [city.towns[0]!, { ...city.towns[0]!, key: "demo/copy" }] };
    const buildings = cityBuildings(measures);
    const whole = tableFor(lotRefs(two), buildings, "size", THEMES.dracula);
    for (const [key, span] of buildingSpans(two))
      expect(placeTable(whole, span)).toEqual(tableFor(lotRefs(focusOn(two, key)), buildings, "size", THEMES.dracula));
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

  it("disables authors alone, with its reason, in a fold whose .mailmap could not be fetched", () => {
    const unmapped: Measures = {
      ...measures,
      source: "cli",
      available: ["size", "tested", "kind", "recency", "churn", "comments"],
    };
    expect(colourChoices(unmapped).filter((c) => c.reason !== null)).toEqual([
      { by: "authors", reason: "The laid commit's .mailmap could not be fetched" },
    ]);
    expect(colourFor("authors", unmapped)).toBe("folder");
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
