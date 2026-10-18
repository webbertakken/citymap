import { UNIT, type City } from "@citymap/ground-plan";
import type { Measures } from "@citymap/measures";
import { buildingSpans, focusOn } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { square, twin } from "../components/testing/fixtures";
import { heightOf } from "./hover";
import { roofsOf } from "./roofs";

// The twin city, its first town with a vacant lot before its built one: a vacant lot stands no building.
const lot = twin.towns[0]!.lots[0]!;
const city: City = {
  ...twin,
  towns: [
    { ...twin.towns[0]!, lots: [{ ...lot, key: "v", vacant: true, path: "", pts: square(256, 64) }, lot] },
    twin.towns[1]!,
  ],
};
const spans = buildingSpans(city);
const floors = Uint8Array.of(3, 7);
const measures: Measures = {
  version: 1,
  source: "cli",
  size: "lines",
  tested: "name",
  available: ["size"],
  lots: { alpha: { a: { files: [{ path: "a.ts" }, { path: "b.ts" }] } } },
};

describe("roofsOf", () => {
  it("names each building over its roof, its files from its measures, at its top", () => {
    expect(roofsOf(city, spans, floors, measures)).toEqual([
      { text: "a.ts +1", x: 96 / UNIT, y: heightOf(3), z: -32 / UNIT },
      { text: "page.tsx", x: 12896 / UNIT, y: heightOf(7), z: -32 / UNIT },
    ]);
  });

  it("reads a town alone's heights from its span of the whole city's floors", () => {
    expect(roofsOf(focusOn(city, "alpha/apps/web"), spans, floors, null)).toEqual([
      { text: "page.tsx", x: 12896 / UNIT, y: heightOf(7), z: -32 / UNIT },
    ]);
  });
});
