import { CitymapError, stateSnapshot } from "@citymap/ground-plan";
import { parseCityFile, serialiseCityFile } from "@citymap/measures";
import { buildScene, lotRefs, pick, pickIndex } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { city as cityNamed } from "../components/testing/fixtures";
import type { Step } from "../load/step";
import { cityBuildings, cityFloors, tableFor } from "../view/buildings";
import { errorOf, failureOf, layHere, layStep, readHere, throttled } from "./lay";
import { cityOfPieces, cityPieces } from "./pieces";
import type { Answer } from "./work";

const snapshot = stateSnapshot(
  "demo",
  "c1",
  Array.from({ length: 30 }, (_, i) => `src/f${i}.ts`),
);

describe("layStep", () => {
  it("counts placing and shaping on the bar, and lots placed in words", () => {
    expect(layStep({ placed: 10, shaped: 4, lots: 20 })).toEqual({
      phase: "lay",
      done: 14,
      of: 40,
      count: { done: 10, of: 20 },
    });
  });
});

describe("throttled", () => {
  it("passes the first call, then at most one per interval, and always the last on flush", () => {
    let now = 0;
    const heard: number[] = [];
    const tell = throttled(
      (n: number) => heard.push(n),
      100,
      () => now,
    );
    tell(1);
    now = 50;
    tell(2);
    now = 100;
    tell(3);
    now = 120;
    tell(4);
    tell.flush();
    tell.flush();
    expect(heard).toEqual([1, 3, 4]);
  });
});

describe("layHere", () => {
  it("lays the snapshot and tells how far it has come, ending at the whole bar, then drawing", async () => {
    const steps: Step[] = [];
    const { city } = await layHere(snapshot, { theme: "dracula", onProgress: (s) => steps.push(s) });
    expect(city.repository).toBe("demo");
    expect(steps[0]).toMatchObject({ phase: "lay", done: 0 });
    const laid = steps.findLast((s) => s.phase === "lay")!;
    expect(laid.done).toBe(laid.of);
    expect(steps.at(-1)).toEqual({ phase: "draw" });
    expect((await layHere(snapshot, { theme: "dracula" })).city).toEqual(city);
  });

  it("builds the measures beside the city when given what the source knows", async () => {
    const facts = { source: "github", size: "bytes", comments: false, files: new Map(), coverage: new Map() } as const;
    const { measures, scales } = await layHere(snapshot, { theme: "dracula", facts });
    expect(measures).toMatchObject({ source: "github", tested: "name" });
    expect(scales).toEqual(cityBuildings(measures).scales);
    expect((await layHere(snapshot, { theme: "dracula" })).measures).toBeNull();
  });

  it("makes the first look with the city: its table and its whole scene, its floors and pick index beside", async () => {
    const laid = await layHere(snapshot, { theme: "dracula", colourBy: "size" });
    const refs = lotRefs(laid.city);
    expect(laid.answers).toEqual([
      {
        kind: "table",
        theme: "dracula",
        colourBy: "folder",
        table: tableFor(refs, cityBuildings(null), "folder", THEMES.dracula),
      },
      { kind: "scene", theme: "dracula", town: null, scene: buildScene(laid.city, THEMES.dracula) },
    ]);
    expect(laid.floors).toEqual(cityFloors(refs, cityBuildings(null)));
    expect(laid.pick.city).toBe(laid.city);
    expect(pick(laid.pick, 0, 0)).toEqual(pick(pickIndex(laid.city), 0, 0));
    // The port goes on with every town, and answers what is asked on the calling thread.
    const heard: Answer[] = [];
    laid.port.listen((answer) => heard.push(answer));
    expect(heard.map((a) => a.kind === "scene" && a.town)).toEqual(laid.city.towns.map((town) => town.key));
    laid.port.ask({ ask: "table", theme: "beck", colourBy: "kind" });
    expect(heard.at(-1)).toMatchObject({ kind: "table", theme: "beck", colourBy: "kind" });
  });

  it("makes the town asked for with the first look", async () => {
    const { city, answers } = await layHere(snapshot, { theme: "dracula", town: "demo" });
    expect(answers.at(-1)).toMatchObject({ kind: "scene", town: "demo" });
    expect(city.towns.map((town) => town.key)).toContain("demo");
  });

  it("lays nothing once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(layHere(snapshot, { theme: "dracula", signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("readHere", () => {
  const file = { city: cityNamed("x"), measures: null };
  const text = serialiseCityFile(file);

  it("reads a city file, saying so, and makes its first look and pick index", async () => {
    const steps: Step[] = [];
    const laid = await readHere(text, { theme: "dracula", onProgress: (s) => steps.push(s) });
    expect(steps).toEqual([{ phase: "parse" }, { phase: "draw" }]);
    expect(laid).toMatchObject({ city: file.city, measures: null });
    expect(laid.answers[1]).toEqual({
      kind: "scene",
      theme: "dracula",
      town: null,
      scene: buildScene(file.city, THEMES.dracula),
    });
    expect(pick(laid.pick, 0.5, -0.5)).toEqual(pick(pickIndex(file.city), 0.5, -0.5));
  });

  it("rejects what is not a city with the file's code, and reads nothing once aborted", async () => {
    await expect(readHere("{}", { theme: "dracula" })).rejects.toMatchObject({ code: "city/bad-shape" });
    const controller = new AbortController();
    controller.abort();
    await expect(readHere(text, { theme: "dracula", signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("a laid city file in pieces", () => {
  it("is taken in equal to the validated one, with or without measures", async () => {
    const facts = { source: "github", size: "bytes", comments: false, files: new Map(), coverage: new Map() } as const;
    const { city, measures } = await layHere(snapshot, { theme: "dracula", facts });
    const files = [
      { city, measures },
      { city, measures: null },
    ];
    const taken = await Promise.all(
      files.map((file) => cityOfPieces(cityPieces(file, 2000), { pause: async () => {} })),
    );
    expect(taken).toEqual(files);
    expect(taken[0]).toEqual(parseCityFile(JSON.stringify({ ...city, measures })));
    expect(taken[1]).toEqual(parseCityFile(JSON.stringify(city)));
  });
});

describe("failureOf and errorOf", () => {
  it("keep an engine's code and detail across the worker, so a bad file is named as before", () => {
    const original = new CitymapError("city/bad-shape", "/towns: Invalid type", { pointer: "/towns" });
    const crossed = errorOf(structuredClone(failureOf(original)));
    expect(crossed).toBeInstanceOf(CitymapError);
    expect(crossed).toMatchObject({ code: "city/bad-shape", message: original.message, detail: { pointer: "/towns" } });
  });

  it("keep any other failure's message", () => {
    expect(errorOf(failureOf(new RangeError("too deep")))).toEqual(new Error("too deep"));
    expect(errorOf(failureOf("plain words")).message).toBe("plain words");
  });
});
