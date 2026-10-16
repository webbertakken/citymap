import type { City, Lot, Pt, Town } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { MAX_HITS, search, searchIndex } from "./search";

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const lot = (path: string, at: number, vacant = false): Lot => ({
  pts: box(at, 0, at + 64, 128),
  key: path,
  address: "1",
  vacant,
  path: vacant ? "" : path,
  use: "source",
  district: 1,
});
const district = (path: string, pts: Pt[], ward = false) => ({
  pts,
  path,
  name: path.split("/").at(-1)!,
  depth: path.split("/").length,
  massMille: 100,
  ward,
});
const town = (key: string, name: string, lots: Lot[], districts: ReturnType<typeof district>[]): Town => ({
  key,
  name,
  form: "polycentric",
  old: false,
  outline: box(0, 0, 6400, 6400),
  water: [],
  roads: [],
  blocks: [],
  lots,
  districts,
  stats: { lots: lots.length, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});
const city: City = {
  repository: "demo",
  commit: "c",
  highways: [],
  towns: [
    town(
      "apps/live",
      "apps/live",
      [
        lot("apps/live/components/palette/Palette.tsx", 0),
        lot("apps/live/components/palette/usePalette.ts", 128),
        lot("apps/live/lib/palettes.ts", 256),
        lot("gone.ts", 384, true),
      ],
      [
        district("apps/live/components/palette", box(0, 0, 1280, 640)),
        district("apps/live/components", box(0, 0, 2560, 1280)),
        district("apps/live/misc", box(0, 0, 64, 64), true),
      ],
    ),
    town("docs", "docs", [lot("docs/palette.md", 0)], []),
  ],
};

describe("searchIndex", () => {
  it("lists folders and the files of lots, with where they are and how much land they cover", () => {
    const index = searchIndex(city);
    // Wards are not folders a person named, and a vacant lot holds no file.
    expect(index.entries.map((e) => [e.kind, e.path])).toEqual([
      ["folder", "apps/live/components/palette"],
      ["folder", "apps/live/components"],
      ["file", "apps/live/components/palette/Palette.tsx"],
      ["file", "apps/live/components/palette/usePalette.ts"],
      ["file", "apps/live/lib/palettes.ts"],
      ["file", "docs/palette.md"],
    ]);
    // Scene units: 64 fixed units each, z running south.
    expect(index.entries[0]).toMatchObject({ name: "palette", townKey: "apps/live", town: "apps/live", x: 10, z: -5 });
    expect(index.entries[0]!.extent).toBe(20);
    expect(index.entries[2]).toMatchObject({ name: "Palette.tsx", x: 0.5, z: -1, extent: 2 });
  });
});

describe("search", () => {
  const index = searchIndex(city);
  const paths = (query: string) => search(index, query).hits.map((h) => h.path);

  it("ranks exact names, then names that start with the query, then names and paths that hold it", () => {
    expect(paths("palette")).toEqual([
      "apps/live/components/palette",
      "docs/palette.md",
      "apps/live/lib/palettes.ts",
      "apps/live/components/palette/Palette.tsx",
      "apps/live/components/palette/usePalette.ts",
    ]);
    expect(paths("components")).toEqual([
      "apps/live/components",
      "apps/live/components/palette",
      "apps/live/components/palette/Palette.tsx",
      "apps/live/components/palette/usePalette.ts",
    ]);
  });

  it("ignores case and the spaces around the query", () => {
    expect(paths("  USEPAL ")).toEqual(["apps/live/components/palette/usePalette.ts"]);
  });

  it("waits for two characters, and finds nothing for text that is nowhere", () => {
    expect(search(index, "p")).toEqual({ hits: [], total: 0 });
    expect(search(index, "   ")).toEqual({ hits: [], total: 0 });
    expect(search(index, "zebra")).toEqual({ hits: [], total: 0 });
  });

  it("breaks ties by kind, then path length, then path, keeping an old town's twin beside its own", () => {
    const tied: City = {
      ...city,
      towns: [
        town("b", "b", [lot("b/pal", 0), lot("a/pal", 64)], [district("x/pal", box(0, 0, 64, 64))]),
        town("old", "b old town", [lot("b/pal", 0)], [district("x/pal", box(0, 0, 64, 64))]),
      ],
    };
    const found = search(searchIndex(tied), "pal").hits;
    expect(found.map((h) => [h.kind, h.path, h.town])).toEqual([
      ["folder", "x/pal", "b"],
      ["folder", "x/pal", "b old town"],
      ["file", "a/pal", "b"],
      ["file", "b/pal", "b"],
      ["file", "b/pal", "b old town"],
    ]);
  });

  it("shows at most seven, and counts them all", () => {
    const many: City = {
      ...city,
      towns: [
        town(
          "t",
          "t",
          Array.from({ length: 12 }, (_, i) => lot(`src/file${String(i).padStart(2, "0")}.ts`, i * 64)),
          [],
        ),
      ],
    };
    const found = search(searchIndex(many), "file");
    expect(found.total).toBe(12);
    expect(found.hits).toHaveLength(MAX_HITS);
    expect(found.hits[0]!.path).toBe("src/file00.ts");
  });
});
