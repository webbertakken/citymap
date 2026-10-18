import { ColliderDesc } from "@dimforge/rapier3d-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Step } from "../../load/step";
import type { Footprint } from "../footprints";
import { NO_INTENTS, stepWalker, type Body } from "../walker";
import { GROUND, SLICE, rapierWalls, solid } from "./rapier";

/** A square building, `size` street widths across and `top` high, with its south-west corner at (x, z). */
const building = (lot: number, x: number, z: number, size = 1, top = 1): Footprint => ({
  lot,
  corners: [
    { x, z },
    { x: x + size, z },
    { x: x + size, z: z - size },
    { x, z: z - size },
  ],
  top,
});
const dt = 1 / 120;
const standing = (x: number, z: number): Body => ({ feet: { x, y: GROUND, z }, rise: 0, heading: 0, grounded: true });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("solid", () => {
  it("makes walls of footprints that enclose ground and stand above it", () => {
    expect(solid(building(0, 0, 0))).toBe(true);
    expect(solid({ lot: 0, corners: building(0, 0, 0).corners.slice(0, 2), top: 1 })).toBe(false);
    const line = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ];
    expect(solid({ lot: 0, corners: line, top: 1 })).toBe(false);
    expect(solid(building(0, 0, 0, 1, 0))).toBe(false);
  });
});

describe("rapierWalls", () => {
  it("stops a walker at a building's wall", async () => {
    // A building whose west wall runs along x = 10 m.
    const walls = await rapierWalls([building(0, 1, 1)]);
    let body = standing(5, 5);
    for (let i = 0; i < 600; i++) body = stepWalker(body, { ...NO_INTENTS, forward: 1, run: true }, 0, dt, walls);
    expect(body.feet.x).toBeLessThan(10);
    expect(body.feet.x).toBeGreaterThan(9.5);
    expect(body.grounded).toBe(true);
    walls.dispose();
  });

  it("lets a walker walk where no building stands, on the ground", async () => {
    const walls = await rapierWalls([building(0, 50, 50)]);
    let body = standing(0, 0);
    for (let i = 0; i < 120; i++) body = stepWalker(body, { ...NO_INTENTS, forward: 1 }, 0, dt, walls);
    expect(body.feet.x).toBeGreaterThan(1.5);
    expect(body.feet.y).toBeCloseTo(GROUND, 1);
    walls.dispose();
  });

  it("measures how far a line runs before it meets a wall", async () => {
    const walls = await rapierWalls([building(0, 1, 1, 1, 3)]);
    const from = { x: 0, y: 1.5, z: 5 };
    expect(walls.clearance(from, { x: 20, y: 1.5, z: 5 })).toBeCloseTo(10, 1);
    expect(walls.clearance(from, { x: -4, y: 1.5, z: 5 })).toBeCloseTo(4, 6);
    expect(walls.clearance(from, from)).toBe(0);
    walls.dispose();
  });

  it("loads the engine, then raises the walls in slices it reports", async () => {
    const many = Array.from({ length: SLICE + 1 }, (_unused, i) =>
      building(i, (i % 100) * 2, -Math.floor(i / 100) * 2),
    );
    // A footprint of one point makes no wall, and is skipped.
    const flat: Footprint = { lot: SLICE + 1, corners: [{ x: 0, z: 0 }], top: 1 };
    const steps: Step[] = [];
    const walls = await rapierWalls([...many, flat], { onStep: (step) => steps.push(step) });
    expect(steps).toEqual([
      { phase: "engine" },
      { phase: "walls", done: 0, of: SLICE + 2 },
      { phase: "walls", done: SLICE, of: SLICE + 2 },
      { phase: "walls", done: SLICE + 2, of: SLICE + 2 },
    ]);
    walls.dispose();
  });

  it("skips a building whose hull Rapier cannot make", async () => {
    const hull = vi.spyOn(ColliderDesc, "convexHull").mockReturnValue(null);
    const walls = await rapierWalls([building(0, 1, 1)]);
    expect(hull).toHaveBeenCalledOnce();
    // Nothing stands where the building would.
    expect(walls.clearance({ x: 0, y: 1, z: 5 }, { x: 30, y: 1, z: 5 })).toBe(30);
    walls.dispose();
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(rapierWalls([building(0, 1, 1)], { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    const midway = new AbortController();
    const walls = rapierWalls([building(0, 1, 1)], {
      signal: midway.signal,
      onStep: (step) => {
        if (step.phase === "walls") midway.abort();
      },
    });
    await expect(walls).rejects.toMatchObject({ name: "AbortError" });
  });
});
