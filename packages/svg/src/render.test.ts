import { DEFAULT_LAND_USES, initialState, layCity, type City, type Snapshot } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { renderCity } from "./render";
import { THEMES, type ThemeName } from "./themes";

const files = (folder: string, n: number, born = 0) =>
  Array.from({ length: n }, (_, i) => {
    const path = `${folder}/f${String(i).padStart(3, "0")}.ts`;
    return { path, identity: `${path}@${born + i}`, firstSeen: born + i };
  });
const snapshot = (entries: Snapshot["files"], repository = "demo"): Snapshot => ({
  repository,
  commit: "worktree",
  index: 0,
  files: [...entries].sort((a, b) => (a.path < b.path ? -1 : 1)),
  folderFirstSeen: new Map(),
});
const options = { densityPct: 50, landUses: DEFAULT_LAND_USES, order: "centre-out", jog: "top-level", warp: true } as const;
const lay = (entries: Snapshot["files"], repository?: string): City =>
  layCity(snapshot(entries, repository), initialState(options), options).city;
const twin = () => lay([...files("lib", 300), ...files("kit", 250, 400), ...files("misc", 50, 800)]);

describe("renderCity", () => {
  it("draws a whole city as one SVG document, the same every time", () => {
    const city = twin();
    const svg = renderCity(city, { title: "demo", subtitle: "a twin" });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(THEMES["paper-atlas"].water);
    expect(renderCity(city, { title: "demo", subtitle: "a twin" })).toBe(svg);
  });

  it.each(Object.keys(THEMES) as ThemeName[])("draws in the %s theme", (theme) => {
    const svg = renderCity(twin(), { title: "t", subtitle: "s", theme });
    expect(svg).toContain(`fill="${THEMES[theme].country}"`);
  });

  it("lifts lots on plinths in the dimetric view", () => {
    const plan = renderCity(twin(), { title: "t", subtitle: "s", camera: "plan" });
    const dimetric = renderCity(twin(), { title: "t", subtitle: "s", camera: "dimetric" });
    expect(dimetric).toContain("translate(0 ");
    expect(plan).not.toContain("translate(0 ");
  });

  it("escapes every text it draws", () => {
    const svg = renderCity(lay(files("<script>&", 30), "a<b>&c"), { title: "<t>", subtitle: "&s" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;t&gt;");
    expect(svg).toContain("&amp;s");
    expect(svg).toContain("A&lt;B&gt;&amp;C");
  });

  it("marks highlighted lots, dashes old towns and vacant lots, and draws highways", () => {
    const city = twin();
    const town = city.towns[0];
    if (!town) throw new Error("no town");
    const first = town.lots[0];
    if (!first) throw new Error("no lot");
    const old = { ...town, key: "old", old: true, lots: town.lots.map((l, i) => ({ ...l, vacant: i % 2 === 0 })) };
    const withOld: City = { ...city, towns: [town, old], highways: [{ pts: town.outline.slice(0, 2), cls: "avenue" }] };
    const svg = renderCity(withOld, { title: "t", subtitle: "s", highlight: new Set([first.key]) });
    expect(svg).toContain("#E4572E");
    expect(svg).toContain("stroke-dasharray");
    expect(svg.match(/stroke-width="[\d.]+" stroke-linecap="butt"/g)?.length).toBeGreaterThan(2);
  });

  it("draws an empty city as an empty sheet with its header", () => {
    const svg = renderCity({ repository: "x", commit: "worktree", towns: [], highways: [] }, { title: "empty", subtitle: "" });
    expect(svg).toContain(">empty</text>");
  });

  it("colours by district form when asked", () => {
    const byForm = renderCity(twin(), { title: "t", subtitle: "s", colourBy: "form" });
    expect(byForm).not.toBe(renderCity(twin(), { title: "t", subtitle: "s" }));
  });
});
