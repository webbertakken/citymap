import type { City, Pt } from "@citymap/ground-plan";
import { pickIndex } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { hitAt } from "./hover";
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
