import { describe, expect, it } from "vitest";
import type { City, Lot, Town } from "../city/city";
import { area2, type Pt } from "../fixed/polygon";
import { cityRegions } from "./regions";

const square = (x: number, y: number, s: number): Pt[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const lot = (path: string, x: number, y: number, vacant = false): Lot => ({
  pts: square(x, y, 32),
  key: path,
  address: path,
  vacant,
  path: vacant ? "" : path,
  use: "source",
  district: 0,
});
const town = (key: string, lots: Lot[], old = false): Town => ({
  key,
  name: key,
  form: "polycentric",
  old,
  outline: square(0, 0, 2000),
  water: [],
  roads: [],
  blocks: [],
  lots,
  districts: [],
  stats: { lots: lots.length, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});
const grid = (folder: string, x0: number, x1: number) =>
  Array.from({ length: 30 }, (_, i) =>
    lot(`${folder}/f${i}.ts`, x0 + ((i * 97) % (x1 - x0 - 40)), 100 + ((i * 61) % 1700)),
  );
const inside = (p: Pt, pts: readonly Pt[]) => {
  let odd = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [a, b] = [pts[i]!, pts[j]!];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd;
  }
  return odd;
};

const shift = (l: Lot): Lot => ({ ...l, pts: l.pts.map((p) => ({ x: p.x - 5000, y: p.y - 5000 })) });
const centre = (l: Lot) => ({ x: l.pts[0]!.x + 16, y: l.pts[0]!.y + 16 });

describe("cityRegions", () => {
  const city: City = {
    repository: "demo",
    commit: "c",
    highways: [],
    towns: [town("demo", [...grid("lib", 100, 900), ...grid("src", 1100, 1900), lot("src/gone.ts", 1500, 900, true)])],
  };

  it("gives each top-level folder the land nearer its lots than any other's, inside the town", () => {
    const [regions] = cityRegions(city);
    expect(regions!.map((r) => r.path)).toEqual(["lib", "src"]);
    for (const region of regions!) {
      expect(area2(region.pts)).toBeGreaterThan(0);
      expect(region.pts.every((p) => p.x >= 0 && p.x <= 2000 && p.y >= 0 && p.y <= 2000)).toBe(true);
    }
    const [lib, src] = regions!;
    expect(grid("lib", 100, 900).every((l) => inside(centre(l), lib!.pts) && !inside(centre(l), src!.pts))).toBe(true);
    expect(grid("src", 1100, 1900).every((l) => inside(centre(l), src!.pts))).toBe(true);
  });

  it("is the same every time, takes a split town's folders below its root, and leaves old towns without", () => {
    expect(cityRegions(city)).toEqual(cityRegions(city));
    const split: City = {
      ...city,
      towns: [
        town("demo/apps/web", [...grid("apps/web/app", 100, 900), ...grid("apps/web/lib", 1100, 1900)]),
        town("demo old town", grid("x", 100, 900), true),
      ],
    };
    const [web, old] = cityRegions(split);
    expect(web!.map((r) => r.path)).toEqual(["apps/web/app", "apps/web/lib"]);
    expect(old).toEqual([]);
  });

  it("gives a town of one folder one region, two lots on one spot one point, and a town of no lots none", () => {
    const twice = [...grid("lib", 100, 1900), { ...grid("lib", 100, 1900)[0]!, key: "twin", path: "lib/twin.ts" }];
    const one: City = { ...city, towns: [town("demo", twice), town("demo/empty", [])] };
    const [single, none] = cityRegions(one);
    expect(single!.map((r) => r.path)).toEqual(["lib"]);
    expect(none).toEqual([]);
  });

  it("keeps the larger piece of a folder split by another, wherever the town lies", () => {
    const split: Town = {
      ...town(
        "demo",
        [...grid("lib", 100, 500), ...grid("src", 700, 1300), ...grid("lib/more", 1500, 1700).slice(0, 8)].map(shift),
      ),
      outline: square(-5000, -5000, 2000),
    };
    const [regions] = cityRegions({ ...city, towns: [split] });
    const lib = regions!.find((r) => r.path === "lib")!;
    expect(
      grid("lib", 100, 500)
        .map(shift)
        .every((l) => inside(centre(l), lib.pts)),
    ).toBe(true);
    expect(lib.pts.every((p) => p.x < -5000 + 700)).toBe(true);
  });
});
