import { buildScene, buildingSpans, type Scene } from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { twin } from "../components/testing/fixtures";
import { Atlas, THEMES_KEPT } from "./atlas";
import { herePort } from "./port";
import { cityWork, type Answer } from "./work";

const work = cityWork({ city: twin, measures: null });
const port = herePort(work);
const scenes = new Map<ThemeName, Scene>();
const sceneIn = (theme: ThemeName) => {
  if (!scenes.has(theme)) scenes.set(theme, buildScene(twin, THEMES[theme]));
  return scenes.get(theme)!;
};
const whole = (theme: ThemeName): Answer => ({ kind: "scene", theme, town: null, scene: sceneIn(theme) });
const town = (theme: ThemeName, key: string, scene: Scene | null = sceneIn(theme)): Answer => ({
  kind: "scene",
  theme,
  town: key,
  scene,
});
const table = (theme: ThemeName, colourBy: "folder" | "kind" | "size", fill = 1): Answer => ({
  kind: "table",
  theme,
  colourBy,
  table: new Float32Array(4).fill(fill),
});
const opened = (answers: readonly Answer[]) =>
  Atlas.open({ city: twin, port, scales: work.buildings.scales, floors: work.floors, answers });

describe("Atlas.open", () => {
  it("holds the city, its port, scales, floors and spans, and the opening's answers", () => {
    const atlas = opened([table("dracula", "folder"), whole("dracula")]);
    expect(atlas).toMatchObject({ city: twin, port, scales: work.buildings.scales, floors: work.floors });
    expect(atlas.spans).toEqual(buildingSpans(twin));
    expect(Atlas.look(atlas, { theme: "dracula", colourBy: "folder" })).toEqual({
      theme: "dracula",
      colourBy: "folder",
      whole: sceneIn("dracula"),
      table: new Float32Array(4).fill(1),
    });
  });
});

describe("Atlas.look", () => {
  it("keeps drawing the newest complete theme until the one asked for has its whole city and a table", () => {
    let atlas = opened([table("dracula", "folder"), whole("dracula")]);
    atlas = Atlas.received(atlas, table("paper-atlas", "folder", 2));
    expect(Atlas.look(atlas, { theme: "paper-atlas", colourBy: "folder" })?.theme).toBe("dracula");
    atlas = Atlas.received(atlas, whole("paper-atlas"));
    expect(Atlas.look(atlas, { theme: "paper-atlas", colourBy: "folder" })).toMatchObject({
      theme: "paper-atlas",
      whole: sceneIn("paper-atlas"),
      table: new Float32Array(4).fill(2),
    });
    // A theme not yet answered at all: the newest complete one.
    expect(Atlas.look(atlas, { theme: "night-atlas", colourBy: "folder" })?.theme).toBe("paper-atlas");
  });

  it("keeps the newest table of its theme until the colour asked for arrives", () => {
    let atlas = opened([table("dracula", "folder"), whole("dracula")]);
    atlas = Atlas.received(atlas, table("dracula", "kind", 3));
    expect(Atlas.look(atlas, { theme: "dracula", colourBy: "size" })).toMatchObject({
      colourBy: "kind",
      table: new Float32Array(4).fill(3),
    });
    expect(Atlas.look(atlas, { theme: "dracula", colourBy: "folder" })?.colourBy).toBe("folder");
  });

  it("has nothing to draw before a theme is complete", () => {
    expect(Atlas.look(opened([table("dracula", "folder")]), { theme: "dracula", colourBy: "folder" })).toBeNull();
    expect(Atlas.look(opened([whole("dracula")]), { theme: "dracula", colourBy: "folder" })).toBeNull();
  });
});

describe("Atlas.received", () => {
  it(`keeps at most ${THEMES_KEPT} complete themes: the one just completed and the newest before it`, () => {
    let atlas = opened([table("dracula", "folder"), whole("dracula")]);
    for (const theme of ["paper-atlas", "night-atlas"] as const)
      atlas = Atlas.received(Atlas.received(atlas, table(theme, "folder")), whole(theme));
    expect([...atlas.themes.keys()]).toEqual(["paper-atlas", "night-atlas"]);
    // A theme still arriving is kept beside them, and dropped once a newer one completes.
    atlas = Atlas.received(atlas, table("dracula", "folder"));
    expect([...atlas.themes.keys()]).toEqual(["paper-atlas", "night-atlas", "dracula"]);
    atlas = Atlas.received(Atlas.received(atlas, table("beck", "folder")), whole("beck"));
    expect([...atlas.themes.keys()]).toEqual(["night-atlas", "beck"]);
  });
});

describe("Atlas.town", () => {
  it("answers a town's scene once made, the whole city's for a town that is the city, else null", () => {
    const own = buildScene(twin, THEMES.nolli);
    const atlas = [town("dracula", "alpha", own), town("dracula", "solo", null)].reduce(
      Atlas.received,
      opened([table("dracula", "folder"), whole("dracula")]),
    );
    expect(Atlas.town(atlas, "dracula", "alpha")).toBe(own);
    expect(Atlas.town(atlas, "dracula", "solo")).toBe(sceneIn("dracula"));
    expect(Atlas.town(atlas, "dracula", "alpha/apps/web")).toBeNull();
    expect(Atlas.town(atlas, "paper-atlas", "alpha")).toBeNull();
    // A town answered as the whole city's before the whole city's scene is in hand.
    expect(Atlas.town(opened([town("dracula", "solo", null)]), "dracula", "solo")).toBeNull();
  });
});

describe("Atlas.span", () => {
  it("is a town's span of the buildings, else every building's, kept", () => {
    const atlas = opened([table("dracula", "folder"), whole("dracula")]);
    expect(Atlas.span(atlas, "alpha/apps/web")).toEqual(buildingSpans(twin).get("alpha/apps/web"));
    expect(Atlas.span(atlas, null)).toEqual({ first: 0, count: work.floors.length });
    expect(Atlas.span(atlas, "nowhere")).toBe(Atlas.span(atlas, null));
  });
});

describe("Atlas.wants", () => {
  it("asks for a theme's look (its town first), then a missing colour's table, else nothing", () => {
    const atlas = opened([table("dracula", "folder"), whole("dracula")]);
    expect(Atlas.wants(atlas, { theme: "paper-atlas", colourBy: "kind", town: "alpha" })).toEqual({
      ask: "look",
      theme: "paper-atlas",
      colourBy: "kind",
      first: "alpha",
    });
    expect(Atlas.wants(atlas, { theme: "dracula", colourBy: "kind", town: null })).toEqual({
      ask: "table",
      theme: "dracula",
      colourBy: "kind",
    });
    expect(Atlas.wants(atlas, { theme: "dracula", colourBy: "folder", town: null })).toBeNull();
  });
});
