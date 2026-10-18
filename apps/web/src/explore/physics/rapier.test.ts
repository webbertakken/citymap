import { GROUND, type Footprint } from "@citymap/world";
import { ColliderDesc } from "@dimforge/rapier3d-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Step } from "../../load/step";
import { NO_INTENTS, stepWalker, type Body } from "../walker";
import { SLICE, rapierWalls } from "./rapier";

/** A square building, `size` tens of metres across and `top` tens of metres high, its south-west corner at (x, z). */
const building = (lot: number, x: number, z: number, size = 1, top = 1): Footprint => ({
  lot,
  corners: [
    { x: 10 * x, z: 10 * z },
    { x: 10 * (x + size), z: 10 * z },
    { x: 10 * (x + size), z: 10 * (z - size) },
    { x: 10 * x, z: 10 * (z - size) },
  ],
  top: 10 * top,
});
const dt = 1 / 120;
const standing = (x: number, z: number): Body => ({ feet: { x, y: GROUND, z }, rise: 0, heading: 0, grounded: true });

afterEach(() => {
  vi.restoreAllMocks();
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

  it("stops a wider mover by its own radius", async () => {
    const walls = await rapierWalls([building(0, 1, 1)]);
    const car = walls.move({ x: 5, y: GROUND, z: 5 }, { x: 10, y: -0.01, z: 0 }, 1);
    expect(car.feet.x).toBeLessThan(9.1);
    expect(car.feet.x).toBeGreaterThan(8.5);
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

  it("keeps feet level on the ground over a long walk, far from the middle of the city", async () => {
    const walls = await rapierWalls([building(0, 300, 300)]);
    let feet = { x: 1500, y: GROUND, z: 1500 };
    const heights = new Set<number>();
    for (let i = 0; i < 2400; i++) {
      const moved = walls.move(feet, { x: 0.04, y: -9.81 / 14400, z: 0.01 });
      expect(moved.grounded).toBe(true);
      feet = moved.feet;
      heights.add(feet.y);
    }
    expect([...heights]).toEqual([GROUND]);
    walls.dispose();
  });

  it("lands on the ground from a jump, and leaves it rising", async () => {
    const walls = await rapierWalls([]);
    expect(walls.move({ x: 0, y: GROUND + 0.1, z: 0 }, { x: 0, y: -1, z: 0 })).toEqual({
      feet: { x: 0, y: GROUND, z: 0 },
      grounded: true,
    });
    expect(walls.move({ x: 0, y: GROUND, z: 0 }, { x: 0, y: 0.05, z: 0 }).grounded).toBe(false);
    walls.dispose();
  });

  it("steps up onto a low kerb and stays on it, then down off it", async () => {
    // A kerb 20 cm high, 10 m to 20 m east.
    const kerb: Footprint = {
      lot: 0,
      corners: [
        { x: 10, z: -5 },
        { x: 20, z: -5 },
        { x: 20, z: 5 },
        { x: 10, z: 5 },
      ],
      top: GROUND + 0.2,
    };
    const walls = await rapierWalls([kerb]);
    let feet = { x: 5, y: GROUND, z: 0 };
    const at: Record<string, number> = {};
    for (let i = 0; i < 1200; i++) {
      feet = walls.move(feet, { x: 0.02, y: -9.81 / 14400, z: 0 }).feet;
      if (Math.abs(feet.x - 15) < 0.011) at.on = feet.y;
      if (Math.abs(feet.x - 25) < 0.011) at.off = feet.y;
    }
    expect(at.on).toBeCloseTo(GROUND + 0.2, 1);
    expect(at.off).toBe(GROUND);
    walls.dispose();
  });

  it("stops a line going down at the ground", async () => {
    const walls = await rapierWalls([]);
    expect(walls.clearance({ x: 0, y: 5, z: 0 }, { x: 0, y: -5, z: 0 })).toBeCloseTo(5 - GROUND, 6);
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
