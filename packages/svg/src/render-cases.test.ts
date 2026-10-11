import type { City, District, Town } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { renderCity } from "./render";
import { THEMES } from "./themes";

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const district = (name: string, x: number, size: number, depth: number, massMille: number): District => ({
  pts: square(x, 0, size),
  path: name,
  name,
  depth,
  massMille,
  ward: false,
});
const town: Town = {
  key: "t",
  name: "town",
  form: "polycentric",
  old: false,
  outline: square(0, 0, 100_000),
  water: [],
  roads: [],
  blocks: [
    { pts: square(0, 0, 100), district: 1, kind: "park" },
    { pts: square(0, 0, 100), district: 1, kind: "green" },
    { pts: square(0, 0, 100), district: 1, kind: "plaza" },
    { pts: square(0, 0, 100), district: 1, kind: "built" },
  ],
  lots: [{ pts: square(0, 0, 50), key: "a", address: "a", vacant: false, path: "a.json", use: "config", district: 1 }],
  districts: [
    district("north", 10_000, 60_000, 1, 1000),
    district("overlapping", 10_000, 60_000, 2, 900),
    district("minor", 80_000, 15_000, 3, 10),
    district("speck", 0, 100, 3, 5),
  ],
  stats: { lots: 1, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
};
const city: City = { repository: "r", commit: "worktree", towns: [town], highways: [] };

describe("renderCity cases", () => {
  it("fills parks, greens and plazas in their own colours", () => {
    const svg = renderCity(city, { title: "t", subtitle: "s" });
    expect(svg.split(`fill="${THEMES["paper-atlas"].park}"`).length - 1).toBe(2);
    expect(svg).toContain(`fill="${THEMES["paper-atlas"].plaza}"`);
  });

  it("labels the heaviest districts, leaves out overlaps and specks, and sets minor names in lower case", () => {
    const svg = renderCity(city, { title: "t", subtitle: "s" });
    expect(svg).toContain(">NORTH<");
    expect(svg).not.toContain("OVERLAPPING");
    expect(svg).toContain(">minor<");
    expect(svg).not.toContain("speck");
  });

  it("colours by form with polycentric as the default form", () => {
    const svg = renderCity(city, { title: "t", subtitle: "s", colourBy: "form" });
    expect(svg).toContain(THEMES["paper-atlas"].form("polycentric", false));
    expect(svg).toContain(THEMES["paper-atlas"].form("polycentric", true));
  });
});
