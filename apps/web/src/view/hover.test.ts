import type { City, Pt } from "@citymap/ground-plan";
import { pickIndex, type Hit } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { describeHit, hitAt } from "./hover";
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

describe("describeHit", () => {
  const cases: [Hit, string, string[]][] = [
    [
      {
        kind: "lot",
        town: "t",
        townKey: "k",
        district: "core",
        path: "src/a.ts",
        use: "source",
        address: "src:0.0.0.0",
        vacant: false,
      },
      "src/a.ts",
      ["Source", "Address src:0.0.0.0", "core · t"],
    ],
    [
      {
        kind: "lot",
        town: "t",
        townKey: "k",
        district: null,
        path: "",
        use: "source",
        address: "src:0.0.0.1",
        vacant: true,
      },
      "Vacant lot",
      ["A deleted file's lot, kept until renewal", "Address src:0.0.0.1", "t"],
    ],
    [
      { kind: "block", town: "t", townKey: "k", district: "core", block: "reserve" },
      "Reserve plot",
      ["Room to grow", "core · t"],
    ],
    [{ kind: "block", town: "t", townKey: "k", district: null, block: "park" }, "Park", ["Documentation", "t"]],
    [{ kind: "block", town: "t", townKey: "k", district: null, block: "green" }, "Green", ["A hamlet's green", "t"]],
    [
      { kind: "block", town: "t", townKey: "k", district: null, block: "plaza" },
      "Plaza",
      ["Where a long road jogs", "t"],
    ],
    [{ kind: "block", town: "t", townKey: "k", district: null, block: "built" }, "Block", ["Lots back to back", "t"]],
    [{ kind: "road", town: "t", townKey: "k", cls: "avenue" }, "Avenue", ["t"]],
    [{ kind: "road", town: null, townKey: null, cls: "street" }, "Street", ["A highway between towns"]],
    [{ kind: "district", town: "t", townKey: "k", district: "core" }, "core", ["District of t"]],
    [{ kind: "town", town: "t", townKey: "k" }, "t", ["Town"]],
  ];
  it.each(cases)("describes %j", (hit, title, lines) => {
    expect(describeHit(hit)).toEqual({ title, lines });
  });
});
