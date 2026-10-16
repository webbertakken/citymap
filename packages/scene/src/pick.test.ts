import type { City, Pt, Town } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { folderHit, pick, pickIndex, townRoot } from "./pick";

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
  it("names a lot, with its file, use, address, folder and the live lots its folder holds", () => {
    expect(at(736, 800)).toEqual({
      kind: "lot",
      town: "demo",
      townKey: "k/demo",
      root: "",
      path: "src/a.ts",
      use: "source",
      address: "src:0.0.0.0",
      vacant: false,
      folder: "src",
      folderLots: 1,
    });
  });

  it("names the lot of a deleted file as vacant, in its address's folder", () => {
    expect(at(832, 800)).toMatchObject({ kind: "lot", vacant: true, path: "", folder: "src", folderLots: 1 });
  });

  it("names a block by its kind when no lot is there", () => {
    expect(at(2000, 2000)).toEqual({
      kind: "block",
      town: "demo",
      townKey: "k/demo",
      root: "",
      block: "built",
      folder: "src/core",
    });
    expect(at(4000, 1000)).toEqual({
      kind: "block",
      town: "demo",
      townKey: "k/demo",
      root: "",
      block: "park",
      folder: "src",
    });
  });

  it("names a road by its class, and a highway by the towns at its ends", () => {
    expect(at(1000, 3220)).toEqual({
      kind: "road",
      town: "demo",
      townKey: "k/demo",
      root: "",
      cls: "avenue",
      joins: [],
    });
    // Both ends lie nearest the one town: it is named once.
    expect(at(7000, 6010)).toEqual({
      kind: "road",
      town: null,
      townKey: null,
      root: null,
      cls: "street",
      joins: ["demo"],
    });
  });

  it("takes a road's own width when its right of way narrows it", () => {
    const narrow: City = { ...city, towns: [{ ...town, roads: [{ ...town.roads[0]!, width: 30 }] }] };
    expect(pick(pickIndex(narrow), 1000 / 64, -3210 / 64)).toMatchObject({ kind: "road" });
    expect(pick(pickIndex(narrow), 1000 / 64, -3220 / 64)).not.toMatchObject({ kind: "road" });
  });

  it("names the district, then the town, where nothing else is, with what each holds", () => {
    expect(at(3000, 3000)).toEqual({
      kind: "district",
      town: "demo",
      townKey: "k/demo",
      root: "",
      district: "core",
      path: "src/core",
      form: null,
      lots: 0,
      folders: 0,
    });
    expect(at(3000, 5000)).toEqual({
      kind: "town",
      town: "demo",
      townKey: "k/demo",
      root: "",
      form: "polycentric",
      old: false,
      lots: 1,
      districts: 1,
    });
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
      root: "",
      block: "plaza",
      folder: "",
    });
    expect(there(5900, 5900)).toMatchObject({ kind: "town", town: "demo" });
  });

  it("looks past a road whose box holds the point but whose line passes by, and reads a road of one point", () => {
    expect(there(1900, 4100)).toMatchObject({ kind: "town", town: "demo" });
    expect(there(1150, 4850)).toMatchObject({ kind: "road", town: "demo", cls: "street" });
    expect(there(1005, 1005)).toMatchObject({ kind: "road", town: "demo", cls: "lane" });
  });
});

describe("what a hit counts", () => {
  // A member town of the repository "demo", laid from apps/web: files at three depths, one deleted.
  const lot = (path: string, x: number, vacant = false) => ({
    pts: box(x, 0, x + 64, 64),
    key: `${path || "gone"}@${x}`,
    address: vacant ? "apps/web/src#lots:1.-2.1.4" : "apps/web/src:0.0.0.0",
    vacant,
    path,
    use: "source" as const,
    district: 1,
  });
  const member: Town = {
    ...town,
    key: "demo/apps/web",
    name: "apps/web",
    form: "radial",
    old: false,
    lots: [
      lot("apps/web/src/a.ts", 0),
      lot("apps/web/src/b.ts", 100),
      lot("apps/web/src/ui/c.ts", 200),
      lot("apps/web/src/ui/deep/d.ts", 300),
      lot("apps/web/lib/e.ts", 400),
      lot("", 500, true),
    ],
    districts: [
      {
        pts: box(0, 0, 640, 640),
        path: "apps/web/src",
        name: "src",
        depth: 1,
        massMille: 4000,
        form: "twin",
        ward: false,
      },
      { pts: box(0, 0, 1280, 1280), path: "#ward", name: "src", depth: 1, massMille: 5000, ward: true },
    ],
    stats: { ...town.stats, lots: 5 },
  };
  const index = pickIndex({ repository: "demo", commit: "c", towns: [member], highways: [] });

  it("counts a folder's own live lots for a file, and finds a vacant lot's folder from its address", () => {
    expect(pick(index, 32 / 64, -32 / 64)).toMatchObject({ folder: "apps/web/src", folderLots: 2, root: "apps/web" });
    expect(pick(index, 532 / 64, -32 / 64)).toMatchObject({ vacant: true, folder: "apps/web/src", folderLots: 2 });
  });

  it("counts the live lots at or below a labelled folder, and the folders below it that lead to lots", () => {
    expect(folderHit(index, "demo/apps/web", "apps/web/src")).toMatchObject({
      kind: "district",
      district: "src",
      form: "twin",
      lots: 4,
      folders: 2,
    });
    expect(folderHit(index, "demo/apps/web", "apps/web/nowhere")).toBeNull();
  });

  it("counts a town's top-level labelled districts, wards left out", () => {
    expect(pick(index, 3000 / 64, -5000 / 64)).toMatchObject({ kind: "town", form: "radial", lots: 5, districts: 1 });
  });

  it("falls back to the town's root for a vacant lot whose address it cannot read", () => {
    const odd = { ...member, lots: [{ ...lot("", 0, true), address: "odd" }] };
    expect(pick(pickIndex({ repository: "demo", commit: "c", towns: [odd], highways: [] }), 0.5, -0.5)).toMatchObject({
      folder: "apps/web",
      folderLots: 0,
    });
  });
});

const root = (key: string) => townRoot({ repository: "demo" }, { key });

describe("townRoot", () => {
  it("reads the folder a town is laid from out of its key", () => {
    expect(root("demo")).toBe("");
    expect(root("demo old town")).toBe("");
    expect(root("demo/apps/web")).toBe("apps/web");
    expect(root("demo/apps/web old town")).toBe("apps/web");
    expect(root("demo/packages old town 2")).toBe("packages");
    expect(root("elsewhere/x")).toBe("");
  });
});

describe("a highway between towns", () => {
  it("names the towns nearest its two ends, in order", () => {
    const east: Town = { ...town, key: "demo/east", name: "east", outline: box(12800, 0, 19200, 6400) };
    const highway = {
      pts: [
        { x: 6000, y: 3000 },
        { x: 12700, y: 3000 },
      ],
      cls: "collector" as const,
    };
    const index = pickIndex({ repository: "demo", commit: "c", towns: [town, east], highways: [highway] });
    expect(pick(index, 9000 / 64, -3000 / 64)).toMatchObject({ kind: "road", joins: ["demo", "east"] });
  });

  it("names no town when the city has none", () => {
    const highway = {
      pts: [
        { x: 0, y: 0 },
        { x: 640, y: 0 },
      ],
      cls: "street" as const,
    };
    const index = pickIndex({ repository: "demo", commit: "c", towns: [], highways: [highway] });
    expect(pick(index, 5, 0)).toMatchObject({ kind: "road", joins: [] });
  });
});
