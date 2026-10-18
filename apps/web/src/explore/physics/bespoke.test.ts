import { GROUND, type Footprint } from "@citymap/world";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Step } from "../../load/step";
import { bespokeWalls } from "./bespoke";

afterEach(() => {
  vi.restoreAllMocks();
});

const building: Footprint = {
  lot: 0,
  corners: [
    { x: 10, z: -5 },
    { x: 20, z: -5 },
    { x: 20, z: 5 },
    { x: 10, z: 5 },
  ],
  top: 10,
};
const point: Footprint = { lot: 1, corners: [{ x: 0, z: 0 }], top: 1 };

describe("bespokeWalls", () => {
  it("raises the walls at once, says so to the loading card, and logs what it raised", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const steps: Step[] = [];
    const walls = await bespokeWalls([building, point], { onStep: (step) => steps.push(step) });
    expect(steps).toEqual([
      { phase: "walls", done: 0, of: 2 },
      { phase: "walls", done: 2, of: 2 },
    ]);
    expect(walls.move({ x: 0, y: GROUND, z: 0 }, { x: 20, y: 0, z: 0 }).feet.x).toBeLessThan(10);
    expect(String(info.mock.calls[0]?.[0])).toMatch(/^explore\/walls engine=bespoke buildings=2 skipped=1 ms=\d+$/);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(bespokeWalls([building], { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("raises without options", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect((await bespokeWalls([])).clearance({ x: 0, y: 2, z: 0 }, { x: 3, y: 2, z: 4 })).toBe(5);
  });
});
