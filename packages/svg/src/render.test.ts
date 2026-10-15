import { DEFAULT_LAND_USES, initialState, layCity, type City, type Snapshot } from "@citymap/ground-plan";
import { THEMES, THEME_NAMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { renderCity } from "./render";

const files = (folder: string, n: number, born = 0) =>
  Array.from({ length: n }, (_, i) => {
    const path = `${folder}/f${String(i).padStart(3, "0")}.ts`;
    return { path, identity: `${path}@${born + i}`, firstSeen: born + i };
  });
const snapshot = (entries: Snapshot["files"], repository = "demo"): Snapshot => ({
  repository,
  commit: "worktree",
  index: 0,
  files: entries.toSorted((a, b) => (a.path < b.path ? -1 : 1)),
  folderFirstSeen: new Map(),
});
const options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
} as const;
const lay = (entries: Snapshot["files"], repository?: string): City =>
  layCity(snapshot(entries, repository), initialState(options), options).city;
const twin = () => lay([...files("lib", 300), ...files("kit", 250, 400), ...files("misc", 50, 800)]);

/** A sheet's width and height. */
const size = (svg: string) => svg.match(/width="([\d.]+)" height="([\d.]+)"/)!.slice(1);

describe("renderCity", () => {
  it("draws a whole city as one SVG document, the same every time", () => {
    const city = twin();
    const svg = renderCity(city, { title: "demo", subtitle: "a twin" });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(THEMES["paper-atlas"].water);
    expect(renderCity(city, { title: "demo", subtitle: "a twin" })).toBe(svg);
  });

  it("fills each top-level folder's region beneath its blocks when asked, and none by default", () => {
    const city = lay([...files("lib", 120), ...files("kit", 120, 400), ...files("misc", 60, 800)]);
    expect(renderCity(city, { title: "t", subtitle: "s" })).not.toContain(`class="region"`);
    const svg = renderCity(city, { title: "t", subtitle: "s", regions: true });
    expect(svg.match(/class="region"/g)).toHaveLength(3);
    // Regions lie beneath the blocks: the first region comes before the first block of its town.
    expect(svg.indexOf(`class="region"`)).toBeLessThan(svg.indexOf(`stroke="${THEMES["paper-atlas"].casing}"`));
    // Their edges are drawn over everything in the town, so a district's shape reads through its blocks and lots.
    expect(svg.match(/class="region-edge"/g)).toHaveLength(3);
    expect(svg.lastIndexOf(`class="region-edge"`)).toBeGreaterThan(
      svg.lastIndexOf(`stroke="${THEMES["paper-atlas"].casing}"`),
    );
  });

  it("draws a road at its own width when its right of way narrows it", () => {
    const city = twin();
    const narrow = {
      ...city,
      towns: city.towns.map((t) => ({ ...t, roads: t.roads.map((r) => ({ ...r, width: 8 })) })),
    };
    expect(renderCity(narrow, { title: "t", subtitle: "s" })).not.toBe(renderCity(city, { title: "t", subtitle: "s" }));
  });

  it("draws within a given frame, so maps of one place share a scale and an origin", () => {
    const small = lay(files("lib", 50));
    const large = twin();
    const frame = { min: { x: -20_000, y: -20_000 }, max: { x: 20_000, y: 20_000 } };
    const [a, b] = [small, large].map((c) => renderCity(c, { title: "t", subtitle: "s", frame }));
    expect(size(a!)).toEqual(size(b!));
    expect(size(a!)).not.toEqual(size(renderCity(small, { title: "t", subtitle: "s" })));
  });

  it.each(THEME_NAMES)("draws in the %s theme", (theme) => {
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
    const svg = renderCity(
      { repository: "x", commit: "worktree", towns: [], highways: [] },
      { title: "empty", subtitle: "" },
    );
    expect(svg).toContain(">empty</text>");
  });

  it("colours by district form when asked", () => {
    const byForm = renderCity(twin(), { title: "t", subtitle: "s", colourBy: "form" });
    expect(byForm).not.toBe(renderCity(twin(), { title: "t", subtitle: "s" }));
  });
});
