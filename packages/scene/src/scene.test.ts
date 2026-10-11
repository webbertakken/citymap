import { DEFAULT_LAND_USES, initialState, layCity, type City, type Pt } from "@citymap/ground-plan";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { buildScene, flatLayer, plinths, roadRibbon, triangulate, LOT_HEIGHT } from "./scene";

const square: Pt[] = [
  { x: 0, y: 0 },
  { x: 64, y: 0 },
  { x: 64, y: 64 },
  { x: 0, y: 64 },
];

const files = (folder: string, n: number, born = 0) =>
  Array.from({ length: n }, (_, i) => ({
    path: `${folder}/f${String(i).padStart(3, "0")}.ts`,
    identity: `${folder}${i}`,
    firstSeen: born + i,
  }));
const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));

describe("triangulate", () => {
  it("fans a convex polygon from its first vertex", () => {
    expect(triangulate(4, 10)).toEqual([10, 11, 12, 10, 12, 13]);
    expect(triangulate(2, 0)).toEqual([]);
  });
});

describe("flatLayer", () => {
  it("lays polygons flat at a height, in scene units with z = -y", () => {
    const layer = flatLayer("blocks", [square], ["#ff0000"], 0.5);
    expect([...layer.positions]).toEqual([0, 0.5, 0, 1, 0.5, 0, 1, 0.5, -1, 0, 0.5, -1]);
    expect(Array.from(layer.colours.slice(0, 3))).toEqual([1, 0, 0]);
    expect([...layer.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("skips polygons of fewer than three points", () => {
    expect(flatLayer("x", [square.slice(0, 2)], ["#000000"], 0).positions).toHaveLength(0);
  });
});

describe("roadRibbon", () => {
  it("draws a quad per segment and a cap at each joint", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 640, y: 0 },
      { x: 640, y: 640 },
    ];
    const ribbon = roadRibbon(pts, 64);
    // Two segment quads and one joint cap, four corners each.
    expect(ribbon.length).toBe(3);
    expect(ribbon[0]).toEqual([
      { x: 0, y: -32 },
      { x: 640, y: -32 },
      { x: 640, y: 32 },
      { x: 0, y: 32 },
    ]);
  });

  it("skips zero-length segments", () => {
    expect(
      roadRibbon(
        [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
        64,
      ),
    ).toEqual([]);
  });
});

describe("plinths", () => {
  it("extrudes each lot: a top and a side quad per edge", () => {
    const layer = plinths([square], ["#00ff00"], 0.1);
    expect(layer.positions.length / 3).toBe(4 + 4 * 4);
    expect(Math.max(...[...layer.positions].filter((_, i) => i % 3 === 1))).toBeCloseTo(0.1 + LOT_HEIGHT);
  });
});

describe("buildScene", () => {
  const options = {
    densityPct: 50,
    landUses: DEFAULT_LAND_USES,
    order: "centre-out",
    jog: "top-level",
    warp: true,
  } as const;
  const city: City = layCity(
    {
      repository: "demo",
      commit: "worktree",
      index: 0,
      files: [...files("lib", 300), ...files("kit", 250, 400), ...files("misc", 50, 800)].toSorted((a, b) =>
        a.path < b.path ? -1 : 1,
      ),
      folderFirstSeen: new Map(),
    },
    initialState(options),
    options,
  ).city;

  it("builds every layer of the city, with labels and bounds", () => {
    const scene = buildScene(city, THEMES["paper-atlas"]);
    expect(scene.layers.map((l) => l.name)).toEqual(["ground", "blocks", "water", "casings", "roads", "lots"]);
    for (const layer of scene.layers) {
      expect(layer.colours.length).toBe(layer.positions.length);
      expect(Math.max(...layer.indices)).toBeLessThan(layer.positions.length / 3);
    }
    expect(scene.labels[0]).toMatchObject({ text: "DEMO", size: "town" });
    expect(scene.bounds.max.x).toBeGreaterThan(scene.bounds.min.x);
  });

  it("draws vacant lots flat in the reserve colour, and an empty city as nothing", () => {
    const town = city.towns[0]!;
    const vacant: City = {
      ...city,
      towns: [{ ...town, lots: town.lots.map((l) => Object.assign({}, l, { vacant: true })) }],
    };
    const lots = buildScene(vacant, THEMES.nolli).layers.find((l) => l.name === "lots")!;
    expect(lots.positions.length / 3).toBe(town.lots.reduce((sum, l) => sum + l.pts.length, 0));
    const empty = buildScene({ repository: "x", commit: "worktree", towns: [], highways: [] }, THEMES.dracula);
    expect(empty.layers.every((l) => l.positions.length === 0)).toBe(true);
    expect(empty.bounds).toEqual({ min: { x: 0, z: 0 }, max: { x: 0, z: 0 } });
  });
});

describe("buildScene colours", () => {
  it("colours each kind of block from the theme", () => {
    const theme = THEMES["paper-atlas"];
    const kinds = ["park", "green", "plaza", "reserve", "built"] as const;
    const town = {
      key: "t",
      name: "t",
      form: "polycentric" as const,
      old: false,
      outline: square,
      water: [],
      roads: [],
      blocks: kinds.map((kind) => ({ pts: square, district: 7, kind })),
      lots: [],
      districts: [
        { pts: square, path: "b", name: "b", depth: 2, massMille: 1000, ward: false },
        { pts: square, path: "a", name: "a", depth: 3, massMille: 1, ward: false },
        {
          pts: [square[0]!, { x: 1, y: 0 }, { x: 0, y: 1 }],
          path: "speck",
          name: "speck",
          depth: 3,
          massMille: 1,
          ward: false,
        },
      ],
      stats: { lots: 0, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
    };
    const scene = buildScene({ repository: "r", commit: "worktree", towns: [town], highways: [] }, theme);
    const blocks = scene.layers.find((l) => l.name === "blocks")!;
    const colourAt = (block: number) =>
      Array.from(blocks.colours.slice(block * 12, block * 12 + 3), (c) => Math.round(c * 255));
    expect(colourAt(0)).toEqual(hex(theme.park));
    expect(colourAt(1)).toEqual(hex(theme.park));
    expect(colourAt(2)).toEqual(hex(theme.plaza));
    expect(colourAt(3)).toEqual(hex(theme.reserve(7)[0]));
    expect(colourAt(4)).toEqual(hex(theme.block(7)));
    expect(scene.labels.map((l) => [l.text, l.size])).toEqual([
      ["T", "town"],
      ["B", "district"],
      ["a", "minor"],
    ]);
  });
});
