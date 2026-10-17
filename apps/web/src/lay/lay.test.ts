import { stateSnapshot } from "@citymap/ground-plan";
import { buildScene } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { city as cityNamed } from "../components/testing/fixtures";
import type { Step } from "../load/step";
import { buffersOf, layHere, layStep, liveOptions, throttled } from "./lay";

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

  it("draws the scene too when given a theme, saying so first", async () => {
    const steps: Step[] = [];
    const { city, scene } = await layHere(snapshot, { theme: "dracula", onProgress: (s) => steps.push(s) });
    expect(steps.at(-1)).toEqual({ phase: "draw" });
    expect(scene).toEqual({ theme: "dracula", scene: buildScene(city, THEMES.dracula) });
  });

  it("lists the scene's buffers, to hand over without a copy", () => {
    const scene = buildScene(cityNamed("x"), THEMES.dracula);
    const buffers = buffersOf(scene);
    expect(buffers).toHaveLength(scene.layers.length * 3);
    expect(buffers[0]).toBe(scene.layers[0]!.positions.buffer);
  });

  it("lays nothing once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(layHere(snapshot, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
