import type { City, Pt } from "@citymap/ground-plan";
import { pickIndex } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { heightOf, heightsOf, hitAt } from "./hover";
import { project, type View } from "./view";

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const city: City = {
  repository: "demo",
  commit: "worktree",
  highways: [],
  towns: [
    {
      key: "demo",
      name: "demo",
      form: "polycentric",
      old: false,
      outline: box(0, 0, 6400, 6400),
      water: [],
      roads: [],
      blocks: [{ pts: box(640, 640, 2560, 2560), district: 1, kind: "built" }],
      lots: [
        {
          pts: box(1280, 1280, 1600, 1600),
          key: "a",
          address: "src:1.1.0.0",
          vacant: false,
          path: "src/a.ts",
          use: "source",
          district: 1,
        },
      ],
      districts: [],
      stats: { lots: 1, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
    },
  ],
};
const viewport = { width: 1000, height: 800 };

describe("hitAt", () => {
  it("finds the lot under the pointer, and the block or nothing elsewhere", () => {
    const view: View = { centre: { x: 50, z: -50 }, zoom: 8 };
    const index = pickIndex(city);
    const lot = project(view, viewport, { x: 1440 / 64, y: 0, z: -1440 / 64 });
    expect(hitAt(index, view, viewport, lot)).toMatchObject({ kind: "lot", path: "src/a.ts" });
    const block = project(view, viewport, { x: 700 / 64, y: 0, z: -700 / 64 });
    expect(hitAt(index, view, viewport, block)).toMatchObject({ kind: "block", block: "built" });
    expect(hitAt(index, view, viewport, { x: 0, y: 0 })).toBeNull();
  });
});

describe("hitAt in the Buildings view", () => {
  const index = pickIndex(city);
  const view: View = { centre: { x: 22.5, z: -22.5 }, zoom: 20 };
  // The lot's middle, three street widths up: the top of a twelve-floor building.
  const roof = project(view, viewport, { x: 1440 / 64, y: 3, z: -1440 / 64 }, "buildings");

  it("hits a building at its top, where the ground under that point is something else", () => {
    const tall = heightsOf(Uint8Array.of(12), { first: 0, count: 1 });
    expect(tall.top).toBe(heightOf(12));
    expect(hitAt(index, view, viewport, roof, "buildings", tall)).toMatchObject({ kind: "lot", key: "a" });
    // The same point with a low building: the ray passes over it and meets the ground beyond.
    const low = heightsOf(Uint8Array.of(1), { first: 0, count: 1 });
    expect(hitAt(index, view, viewport, roof, "buildings", low)?.kind).not.toBe("lot");
    // Without heights, the ground answers.
    expect(hitAt(index, view, viewport, roof, "buildings")?.kind).not.toBe("lot");
  });

  it("reads a building's height from the floors, by its index in the whole city's order", () => {
    // The tallest top is another building's; this one is one floor high, so the ray passes over it.
    const tallElsewhere = { top: heightOf(12), floors: Uint8Array.of(1, 12) };
    expect(hitAt(index, view, viewport, roof, "buildings", tallElsewhere)?.kind).not.toBe("lot");
  });
});

describe("heightsOf", () => {
  it("takes the tallest top of a place's span, and 0 for a place without buildings", () => {
    const floors = Uint8Array.of(3, 12, 5, 1);
    expect(heightsOf(floors, { first: 2, count: 2 })).toEqual({ top: heightOf(5), floors });
    expect(heightsOf(floors, { first: 0, count: 4 }).top).toBe(heightOf(12));
    expect(heightsOf(floors, { first: 4, count: 0 }).top).toBe(0);
  });
});
