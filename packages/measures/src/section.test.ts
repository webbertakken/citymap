import { serialiseCity, type City } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import {
  availableFor,
  parseCityFile,
  serialiseCityFile,
  unavailableReason,
  validateMeasures,
  type Measures,
} from "./section";

const city: City = {
  repository: "demo",
  commit: "worktree",
  towns: [
    {
      key: "demo",
      name: "demo",
      form: "polycentric",
      old: false,
      outline: [{ x: 1, y: 2 }],
      water: [],
      roads: [],
      blocks: [],
      lots: [],
      districts: [],
      stats: { lots: 0, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 8 },
    },
  ],
  highways: [],
};

const measures: Measures = {
  version: 1,
  source: "cli",
  size: "lines",
  tested: "name",
  available: ["size", "tested", "kind", "recency", "churn", "authors", "comments"],
  lots: {
    demo: {
      "src/a.ts@0": {
        files: [
          { path: "src/a.ts", bytes: 120, lines: 10, comments: 2, todos: 1, named: true, changed: 9, commits: 3 },
        ],
        authors: 2,
      },
    },
  },
};

const bad = (value: unknown) => () => validateMeasures(value);

describe("serialiseCityFile", () => {
  it("writes a city without measures byte for byte as the city alone", () => {
    expect(serialiseCityFile({ city, measures: null })).toBe(serialiseCity(city));
  });

  it("adds the measures key between highways and repository, leaving the layout as it was", () => {
    const text = serialiseCityFile({ city, measures });
    expect(text.indexOf('"highways"')).toBeLessThan(text.indexOf('"measures"'));
    expect(text.indexOf('"measures"')).toBeLessThan(text.indexOf('"repository"'));
    const without = text.replace(/"measures":\{.*\},"repository"/, '"repository"');
    expect(without).toBe(serialiseCity(city));
  });

  it("keeps what a city records of its separations, measures or not", () => {
    const recorded: City = { ...city, declared: true, separable: ["workspaces", "packages"] };
    expect(serialiseCityFile({ city: recorded, measures: null })).toBe(serialiseCity(recorded));
    expect(parseCityFile(serialiseCityFile({ city: recorded, measures }))).toEqual({ city: recorded, measures });
  });
});

describe("parseCityFile", () => {
  it("round-trips a city with measures, and opens one without them", () => {
    expect(parseCityFile(serialiseCityFile({ city, measures }))).toEqual({ city, measures });
    expect(parseCityFile(serialiseCity(city))).toEqual({ city, measures: null });
  });

  it("round-trips the submodule folders a city's files lie in, and rejects a list of anything else", () => {
    const within = { ...measures, submodules: ["vendor/a", "vendor/b"] };
    expect(parseCityFile(serialiseCityFile({ city, measures: within }))).toEqual({ city, measures: within });
    expect(bad({ ...measures, submodules: [1] })).toThrow("measures/bad-shape: /measures/submodules/0");
  });

  it("rejects text that is not JSON, and a bad city", () => {
    expect(() => parseCityFile("{")).toThrow("city/bad-json");
    expect(() => parseCityFile("[]")).toThrow("city/bad-shape");
    expect(() => parseCityFile('{"measures":{}}')).toThrow("city/bad-shape");
    const text = serialiseCityFile({ city, measures }).replace('"size":"lines"', '"size":"pages"');
    expect(() => parseCityFile(text)).toThrow("measures/bad-shape: /measures/size");
  });

  it("rejects bad measures by pointer, and newer ones by name", () => {
    expect(bad({ ...measures, size: "pages" })).toThrow("measures/bad-shape: /measures/size");
    expect(bad({ ...measures, lots: { demo: { a: { files: [] } } } })).toThrow("/measures/lots/demo/a/files");
    expect(bad({ ...measures, lots: { demo: { a: { files: [{ path: "a", lines: -1 }] } } } })).toThrow(
      "/measures/lots/demo/a/files/0/lines",
    );
    expect(bad({ ...measures, version: 2 })).toThrow("measures/too-new");
    expect(bad(null)).toThrow("measures/bad-shape: /measures/");
  });
});

describe("availableFor", () => {
  it("gives history's measures to a folded CLI city only, and comments when contents were read", () => {
    expect(availableFor("cli", { history: true, authors: true, comments: true })).toEqual([
      "size",
      "tested",
      "kind",
      "recency",
      "churn",
      "authors",
      "comments",
    ]);
    expect(availableFor("cli", { history: false, authors: false, comments: true })).toEqual([
      "size",
      "tested",
      "kind",
      "comments",
    ]);
    expect(availableFor("github", { history: false, authors: false, comments: false })).toEqual([
      "size",
      "tested",
      "kind",
    ]);
  });

  it("leaves authors out of a fold whose .mailmap could not be read, and nothing else", () => {
    expect(availableFor("cli", { history: true, authors: false, comments: true })).toEqual([
      "size",
      "tested",
      "kind",
      "recency",
      "churn",
      "comments",
    ]);
  });
});

describe("unavailableReason", () => {
  it("says why a measure is missing, and nothing for kind or an available one", () => {
    const github: Measures = { ...measures, source: "github", available: ["size", "tested", "kind"] };
    const state: Measures = { ...measures, available: ["size", "tested", "kind", "comments"] };
    expect(unavailableReason("kind", null)).toBeNull();
    expect(unavailableReason("size", null)).toBe("This city file has no measures");
    expect(unavailableReason("size", github)).toBeNull();
    expect(unavailableReason("churn", github)).toBe("Needs the CLI's history");
    expect(unavailableReason("comments", github)).toBe("Needs the files' contents");
    expect(unavailableReason("authors", state)).toBe("Laid without history (--no-history)");
    const unmapped: Measures = { ...measures, available: ["size", "tested", "kind", "recency", "churn", "comments"] };
    expect(unavailableReason("authors", unmapped)).toBe("The laid commit's .mailmap could not be fetched");
    expect(unavailableReason("churn", unmapped)).toBeNull();
  });
});
