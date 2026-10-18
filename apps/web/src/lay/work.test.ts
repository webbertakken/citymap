import type { City, Town } from "@citymap/ground-plan";
import { buildScene, buildingSpans, focusOn, lotRefs } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { city as cityNamed, square, twin } from "../components/testing/fixtures";
import { cityBuildings, cityFloors, tableFor } from "../view/buildings";
import { answerBuffers, asked, buffersOf, cityWork, opening, type Answer } from "./work";

// A city of three towns of different sizes, and a highway: towns are made largest first, after the whole city.
const third: Town = {
  ...twin.towns[0]!,
  key: "alpha/libs",
  name: "libs",
  outline: square(25600, 6400),
  lots: Array.from({ length: 3 }, (_, i) => ({
    ...twin.towns[0]!.lots[0]!,
    key: `l${i}`,
    pts: square(25664 + 128 * i, 64),
  })),
  stats: { ...twin.towns[0]!.stats, lots: 3 },
};
const web = { ...twin.towns[1]!, stats: { ...twin.towns[1]!.stats, lots: 2 } };
const city: City = { ...twin, towns: [twin.towns[0]!, web, third] };
const work = cityWork({ city, measures: null });

const keys = (tasks: readonly { key: string }[]) => tasks.map((t) => t.key);

describe("cityWork", () => {
  it("keeps the file, every building, their refs, floors and each town's span", () => {
    expect(work.file.city).toBe(city);
    expect(work.refs).toEqual(lotRefs(city));
    expect(work.floors).toEqual(cityFloors(lotRefs(city), cityBuildings(null)));
    expect(work.spans).toEqual(buildingSpans(city));
    expect(work.buildings).toEqual(cityBuildings(null));
  });
});

describe("opening", () => {
  it("makes the table, the whole city's scene and the town asked for at once, and leaves the rest largest first", () => {
    const { answers, tasks } = opening(work, { ask: "look", theme: "dracula", colourBy: "folder", first: "alpha" });
    expect(answers).toEqual([
      {
        kind: "table",
        theme: "dracula",
        colourBy: "folder",
        table: tableFor(lotRefs(city), cityBuildings(null), "folder", THEMES.dracula),
      },
      { kind: "scene", theme: "dracula", town: null, scene: buildScene(city, THEMES.dracula) },
      { kind: "scene", theme: "dracula", town: "alpha", scene: buildScene(focusOn(city, "alpha"), THEMES.dracula) },
    ] satisfies Answer[]);
    expect(keys(tasks)).toEqual(["scene dracula alpha/libs", "scene dracula alpha/apps/web"]);
    expect(tasks[0]!.make()).toEqual({
      kind: "scene",
      theme: "dracula",
      town: "alpha/libs",
      scene: buildScene(focusOn(city, "alpha/libs"), THEMES.dracula),
    });
  });

  it("colours by folder what the city cannot colour by, and ignores a town it does not hold", () => {
    const { answers, tasks } = opening(work, { ask: "look", theme: "night-atlas", colourBy: "size", first: "nowhere" });
    expect(answers.map((a) => (a.kind === "table" ? a.colourBy : a.town))).toEqual(["folder", null]);
    expect(keys(tasks)).toEqual([
      "scene night-atlas alpha/libs",
      "scene night-atlas alpha/apps/web",
      "scene night-atlas alpha",
    ]);
  });

  it("answers the town of a city of one town without highways as the whole city's scene", () => {
    const one = cityWork({ city: cityNamed("solo"), measures: null });
    const { answers, tasks } = opening(one, { ask: "look", theme: "dracula", colourBy: "folder", first: null });
    expect(answers.map((a) => a.kind)).toEqual(["table", "scene"]);
    expect(tasks.map((t) => t.make())).toEqual([{ kind: "scene", theme: "dracula", town: "solo", scene: null }]);
    // The town alone is the city itself, so its own scene would be the same.
    expect(buildScene(focusOn(one.file.city, "solo"), THEMES.dracula)).toEqual(
      buildScene(one.file.city, THEMES.dracula),
    );
  });
});

describe("asked", () => {
  const look = { ask: "look", theme: "dracula", colourBy: "folder", first: null } as const;

  it("puts a table first, never twice", () => {
    const tasks = asked(asked([], work, look), work, { ask: "table", theme: "dracula", colourBy: "kind" });
    expect(keys(tasks).slice(0, 3)).toEqual(["table dracula kind", "table dracula folder", "scene dracula "]);
    const again = asked(tasks, work, { ask: "table", theme: "dracula", colourBy: "folder" });
    expect(keys(again).slice(0, 3)).toEqual(["table dracula folder", "table dracula kind", "scene dracula "]);
    expect(again).toHaveLength(tasks.length);
  });

  it("drops the scenes an older look has not made yet, keeping the tables still to make", () => {
    const older = asked(asked([], work, look), work, { ask: "table", theme: "dracula", colourBy: "kind" });
    const newer = asked(older, work, { ask: "look", theme: "paper-atlas", colourBy: "kind", first: "alpha/apps/web" });
    expect(keys(newer)).toEqual([
      "table dracula kind",
      "table dracula folder",
      "table paper-atlas kind",
      "scene paper-atlas ",
      "scene paper-atlas alpha/apps/web",
      "scene paper-atlas alpha/libs",
      "scene paper-atlas alpha",
    ]);
  });
});

describe("answerBuffers", () => {
  it("lists a scene's buffers and a table's, none for a scene that is the whole city's", () => {
    const [table, whole] = opening(work, { ask: "look", theme: "dracula", colourBy: "folder", first: null }).answers;
    expect(answerBuffers(table!)).toEqual([table!.kind === "table" && table!.table.buffer]);
    expect(answerBuffers(whole!)).toEqual(whole!.kind === "scene" && buffersOf(whole!.scene!));
    expect(answerBuffers({ kind: "scene", theme: "dracula", town: "x", scene: null })).toEqual([]);
  });

  it("lists the scene's buffers, to hand over without a copy", () => {
    const scene = buildScene(cityNamed("x"), THEMES.dracula);
    const buffers = buffersOf(scene);
    expect(buffers).toHaveLength(scene.layers.length * 3 + 4);
    expect(buffers[0]).toBe(scene.layers[0]!.positions.buffer);
  });
});
