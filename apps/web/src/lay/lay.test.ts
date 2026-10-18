import { CitymapError, stateSnapshot } from "@citymap/ground-plan";
import { parseCityFile, serialiseCityFile } from "@citymap/measures";
import { buildScene, pick, pickIndex } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { city as cityNamed } from "../components/testing/fixtures";
import type { Step } from "../load/step";
import {
  buffersOf,
  errorOf,
  failureOf,
  layHere,
  layStep,
  liveOptions,
  readHere,
  throttled,
  trustedCityFile,
  wireText,
} from "./lay";

const snapshot = stateSnapshot(
  "demo",
  "c1",
  Array.from({ length: 30 }, (_, i) => `src/f${i}.ts`),
);

describe("liveOptions", () => {
  it("lays with the CLI's defaults, and the toggles and separations chosen when any are", () => {
    expect(liveOptions()).not.toHaveProperty("toggles");
    expect(liveOptions()).not.toHaveProperty("separate");
    expect(liveOptions(["tiers"], ["plugins"])).toMatchObject({ toggles: ["tiers"], separate: ["plugins"] });
  });
});

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
  it("lays the snapshot and tells how far it has come, ending at the whole bar", async () => {
    const steps: Step[] = [];
    const { city, scene } = await layHere(snapshot, { onProgress: (s) => steps.push(s) });
    expect(city.repository).toBe("demo");
    expect(scene).toBeNull();
    expect(steps[0]).toMatchObject({ phase: "lay", done: 0 });
    const last = steps.at(-1)!;
    expect(last.done).toBe(last.of);
    expect((await layHere(snapshot)).city).toEqual(city);
  });

  it("builds the measures beside the city when given what the source knows", async () => {
    const facts = { source: "github", size: "bytes", comments: false, files: new Map(), coverage: new Map() } as const;
    const { measures } = await layHere(snapshot, { facts });
    expect(measures).toMatchObject({ source: "github", tested: "name" });
    expect((await layHere(snapshot)).measures).toBeNull();
  });

  it("draws the scene too when given a theme, saying so first", async () => {
    const steps: Step[] = [];
    const { city, scene } = await layHere(snapshot, { theme: "dracula", onProgress: (s) => steps.push(s) });
    expect(steps.at(-1)).toEqual({ phase: "draw" });
    expect(scene).toEqual({ theme: "dracula", scene: buildScene(city, THEMES.dracula) });
    // The pick index is built beside them, for the city laid.
    const laid = await layHere(snapshot);
    expect(laid.pick.city).toBe(laid.city);
    expect(pick(laid.pick, 0, 0)).toEqual(pick(pickIndex(laid.city), 0, 0));
  });

  it("lists the scene's buffers, to hand over without a copy", () => {
    const scene = buildScene(cityNamed("x"), THEMES.dracula);
    const buffers = buffersOf(scene);
    expect(buffers).toHaveLength(scene.layers.length * 3 + 4);
    expect(buffers[0]).toBe(scene.layers[0]!.positions.buffer);
  });

  it("lays nothing once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(layHere(snapshot, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("readHere", () => {
  const file = { city: cityNamed("x"), measures: null };
  const text = serialiseCityFile(file);

  it("reads a city file, saying so, and builds its scene and pick index", async () => {
    const steps: Step[] = [];
    const laid = await readHere(text, { theme: "dracula", onProgress: (s) => steps.push(s) });
    expect(steps).toEqual([{ phase: "parse" }, { phase: "draw" }]);
    expect(laid).toMatchObject({ city: file.city, measures: null });
    expect(laid.scene).toEqual({ theme: "dracula", scene: buildScene(file.city, THEMES.dracula) });
    expect(pick(laid.pick, 0.5, -0.5)).toEqual(pick(pickIndex(file.city), 0.5, -0.5));
    expect((await readHere(text)).scene).toBeNull();
  });

  it("rejects what is not a city with the file's code, and reads nothing once aborted", async () => {
    await expect(readHere("{}")).rejects.toMatchObject({ code: "city/bad-shape" });
    const controller = new AbortController();
    controller.abort();
    await expect(readHere(text, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("wireText and trustedCityFile", () => {
  it("carry a laid city file across as text, equal to the validated one, with or without measures", async () => {
    const facts = { source: "github", size: "bytes", comments: false, files: new Map(), coverage: new Map() } as const;
    const { city, measures } = await layHere(snapshot, { facts });
    for (const file of [
      { city, measures },
      { city, measures: null },
    ]) {
      const text = wireText(file);
      expect(trustedCityFile(text)).toEqual(file);
      expect(trustedCityFile(text)).toEqual(parseCityFile(text));
    }
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
