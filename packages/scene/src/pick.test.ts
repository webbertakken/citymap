import type { City, Pt, Town } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { pick, pickIndex } from "./pick";

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const town: Town = {
  key: "k/demo",
  name: "demo",
  form: "polycentric",
  old: false,
  outline: box(0, 0, 6400, 6400),
  water: [],
  roads: [
    {
      pts: [
        { x: 0, y: 3200 },
        { x: 6400, y: 3200 },
      ],
      cls: "avenue",
    },
  ],
  blocks: [
    { pts: box(640, 640, 2560, 2560), district: 1, kind: "built" },
    { pts: box(3840, 640, 5760, 2560), district: 1, kind: "park" },
  ],
  lots: [
    {
      pts: box(704, 704, 768, 896),
      key: "a@0",
      address: "src:0.0.0.0",
      vacant: false,
      path: "src/a.ts",
      use: "source",
      district: 1,
    },
    {
      pts: box(800, 704, 864, 896),
      key: "b@0",
      address: "src:0.0.0.1",
      vacant: true,
      path: "",
      use: "source",
      district: 1,
    },
  ],
  districts: [
    { pts: box(0, 0, 6400, 3168), path: "src", name: "src", depth: 1, massMille: 2000, ward: false },
    { pts: box(0, 0, 3200, 3168), path: "src/core", name: "core", depth: 2, massMille: 1000, ward: false },
  ],
  stats: { lots: 1, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
};
const city: City = {
  repository: "demo",
  commit: "worktree",
  towns: [town],
  highways: [
    {
      pts: [
        { x: 6400, y: 6000 },
        { x: 9000, y: 6000 },
      ],
      cls: "street",
    },
  ],
};
// Scene units: x = fixed x / 64, z = −fixed y / 64.
const at = (x: number, y: number) => pick(pickIndex(city), x / 64, -y / 64);

describe("pick", () => {
  it("names a lot, with its file, use, address and smallest district", () => {
    expect(at(736, 800)).toEqual({
      kind: "lot",
      town: "demo",
      townKey: "k/demo",
      district: "core",
      path: "src/a.ts",
      use: "source",
      address: "src:0.0.0.0",
      vacant: false,
    });
  });

  it("names the lot of a deleted file as vacant", () => {
    expect(at(832, 800)).toMatchObject({ kind: "lot", vacant: true, path: "" });
  });

  it("names a block by its kind when no lot is there", () => {
    expect(at(2000, 2000)).toEqual({
      kind: "block",
      town: "demo",
      townKey: "k/demo",
      district: "core",
      block: "built",
    });
    expect(at(4000, 1000)).toEqual({ kind: "block", town: "demo", townKey: "k/demo", district: "src", block: "park" });
  });

  it("names a road by its class, highways included", () => {
    expect(at(1000, 3220)).toEqual({ kind: "road", town: "demo", townKey: "k/demo", cls: "avenue" });
    expect(at(7000, 6010)).toEqual({ kind: "road", town: null, townKey: null, cls: "street" });
  });

  it("names the district, then the town, where nothing else is", () => {
    expect(at(3000, 3000)).toEqual({ kind: "district", town: "demo", townKey: "k/demo", district: "core" });
    expect(at(3000, 5000)).toEqual({ kind: "town", town: "demo", townKey: "k/demo" });
  });

  it("finds nothing off the map", () => {
    expect(at(-5000, -5000)).toBeNull();
    expect(pick(pickIndex({ ...city, towns: [], highways: [] }), 0, 0)).toBeNull();
  });
});

describe("pick at the edges of shapes", () => {
  const triangle: Town = {
    ...town,
    blocks: [
      {
        pts: [
          { x: 3500, y: 3500 },
          { x: 6000, y: 3500 },
          { x: 3500, y: 6000 },
        ],
        district: 1,
        kind: "plaza",
      },
    ],
    lots: [],
    roads: [
      {
        pts: [
          { x: 300, y: 4000 },
          { x: 2000, y: 5700 },
        ],
        cls: "street",
      },
      {
        pts: [
          { x: 1000, y: 1000 },
          { x: 1000, y: 1000 },
        ],
        cls: "lane",
      },
    ],
    districts: [],
  };
  const index = pickIndex({ ...city, towns: [triangle], highways: [] });
  const there = (x: number, y: number) => pick(index, x / 64, -y / 64);

  it("looks past a shape whose box holds the point but whose outline does not", () => {
    expect(there(3600, 3600)).toEqual({
      kind: "block",
      town: "demo",
      townKey: "k/demo",
      district: null,
      block: "plaza",
    });
    expect(there(5900, 5900)).toEqual({ kind: "town", town: "demo", townKey: "k/demo" });
  });

  it("looks past a road whose box holds the point but whose line passes by, and reads a road of one point", () => {
    expect(there(1900, 4100)).toEqual({ kind: "town", town: "demo", townKey: "k/demo" });
    expect(there(1150, 4850)).toEqual({ kind: "road", town: "demo", townKey: "k/demo", cls: "street" });
    expect(there(1005, 1005)).toEqual({ kind: "road", town: "demo", townKey: "k/demo", cls: "lane" });
  });
});
