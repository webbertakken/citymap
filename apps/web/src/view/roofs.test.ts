import { UNIT, type City } from "@citymap/ground-plan";
import type { Measures } from "@citymap/measures";
import { buildingSpans } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { square, twin } from "../components/testing/fixtures";
import { cityBuildings } from "./buildings";
import { heightOf } from "./hover";
import { cityRoofs, roofBuffers, roofsNear } from "./roofs";

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
const roofs = cityRoofs(city, cityBuildings(measures));
const whole = { first: 0, count: 2 };

describe("cityRoofs", () => {
  it("names each building by its files from its measures, else its path, at its roof's middle", () => {
    expect(roofs.names).toBe("a.ts +1page.tsx");
    expect(Array.from(roofs.ends)).toEqual([7, 15]);
    expect(Array.from(roofs.centres)).toEqual([96 / UNIT, -32 / UNIT, 12896 / UNIT, -32 / UNIT]);
    expect(roofBuffers(roofs)).toEqual([roofs.ends.buffer, roofs.centres.buffer]);
  });
});

describe("roofsNear", () => {
  it("gives the roofs of a span within reach of a point, at their tops, in building order", () => {
    expect(roofsNear(roofs, floors, whole, { x: 0, z: 0 }, 1000)).toEqual([
      { text: "a.ts +1", x: 96 / UNIT, y: heightOf(3), z: -32 / UNIT },
      { text: "page.tsx", x: 12896 / UNIT, y: heightOf(7), z: -32 / UNIT },
    ]);
    expect(roofsNear(roofs, floors, whole, { x: 0, z: 0 }, 2).map((r) => r.text)).toEqual(["a.ts +1"]);
  });

  it("reads a town alone's roofs from its span", () => {
    const town = spans.get("alpha/apps/web")!;
    expect(roofsNear(roofs, floors, town, { x: 200, z: 0 }, 1000)).toEqual([
      { text: "page.tsx", x: 12896 / UNIT, y: heightOf(7), z: -32 / UNIT },
    ]);
  });
});
