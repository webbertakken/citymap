import type { Building, Scales } from "@citymap/measures";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { KIND_COLOURS, RAMPS, lookOf, rampColour, rampOf, shareFor, unknownColour } from "./colour-by";

const building = (over: Partial<Building> = {}): Building => ({
  files: ["a"],
  size: 100,
  bytes: null,
  lines: 100,
  tested: 0.5,
  changed: 1500,
  commits: 10,
  authors: 2,
  comments: null,
  todos: null,
  ...over,
});
const scales: Scales = {
  size: { low: 10, high: 1000 },
  churn: { low: 1, high: 100 },
  authors: { low: 1, high: 4 },
  recency: { low: 1000, high: 2000 },
};
const ref = { town: "t", key: "a", district: 7, use: "config" } as const;
const paper = THEMES["paper-atlas"];
const night = THEMES["night-atlas"];

describe("rampColour", () => {
  it("runs between a ramp's stops, clamped at its ends", () => {
    const stops = ["#000000", "#FF0000", "#FFFFFF"];
    expect(rampColour(stops, 0)).toBe("#000000");
    expect(rampColour(stops, 0.25)).toBe("#800000");
    expect(rampColour(stops, 1)).toBe("#FFFFFF");
    expect(rampColour(stops, -1)).toBe("#000000");
    expect(rampColour(stops, 2)).toBe("#FFFFFF");
  });

  it("picks each measure's stops for light and dark themes", () => {
    expect(rampOf("size", paper)).toBe(RAMPS.size.light);
    expect(rampOf("size", night)).toBe(RAMPS.size.dark);
    expect(unknownColour(paper)).not.toBe(unknownColour(night));
  });
});

describe("shareFor", () => {
  it("places each measure on its scale, and nothing where it or its scale is not known", () => {
    const b = building();
    expect(shareFor("tested", b, scales)).toBe(0.5);
    expect(shareFor("size", b, scales)).toBeCloseTo(0.5);
    expect(shareFor("recency", b, scales)).toBe(0.5);
    expect(shareFor("churn", b, scales)).toBeCloseTo(0.5);
    expect(shareFor("authors", b, scales)).toBeCloseTo(0.5);
    const none = building({ size: null, changed: null, commits: null, authors: null, tested: null });
    for (const measure of ["tested", "size", "recency", "churn", "authors"] as const)
      expect(shareFor(measure, none, scales)).toBeNull();
    const unscaled: Scales = { size: null, churn: null, authors: null, recency: null };
    for (const measure of ["size", "recency", "churn", "authors"] as const)
      expect(shareFor(measure, b, unscaled)).toBeNull();
  });
});

describe("lookOf", () => {
  it("stands a building by its size, lights its windows by tested, and colours it by the choice", () => {
    expect(lookOf(ref, building(), scales, "folder", paper)).toEqual({
      floors: 7,
      lit: 0.5,
      colour: paper.lot(7, false),
      unknownSize: false,
    });
    expect(lookOf({ ...ref, use: "source" }, building(), scales, "folder", paper).colour).toBe(paper.lot(7, true));
    expect(lookOf(ref, building(), scales, "kind", paper).colour).toBe(KIND_COLOURS.config);
    expect(lookOf(ref, building({ tested: 1 }), scales, "tested", night).colour).toBe(RAMPS.tested.dark[4]);
  });

  it("keeps an unknown building one floor high, unlit and grey", () => {
    expect(lookOf(ref, undefined, scales, "size", paper)).toEqual({
      floors: 1,
      lit: -1,
      colour: unknownColour(paper),
      unknownSize: true,
    });
  });
});
