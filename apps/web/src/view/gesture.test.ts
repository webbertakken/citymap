import { describe, expect, it } from "vitest";
import { gesture } from "./gesture";

describe("gesture", () => {
  it("spreads by the ratio of the fingers' distances", () => {
    expect(gesture({ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 0 }).ratio).toBeCloseTo(2, 9);
    // Fingers on one spot never divide by nothing.
    expect(gesture({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 0 }).ratio).toBe(3);
  });

  it("twists clockwise on screen (y down) by the turn of the line between them, the short way round", () => {
    expect(gesture({ x: 100, y: 0 }, { x: 0, y: 100 }, { x: 0, y: 0 }).twist).toBeCloseTo(Math.PI / 2, 9);
    expect(gesture({ x: -100, y: 1 }, { x: -100, y: -1 }, { x: 0, y: 0 }).twist).toBeCloseTo(0.02, 3);
  });

  it("lifts by half the moving finger's step down, as the pair's middle moves", () => {
    const g = gesture({ x: 100, y: 50 }, { x: 100, y: 90 }, { x: 0, y: 50 });
    expect(g.lift).toBe(20);
    expect(g.middle).toEqual({ x: 50, y: 70 });
  });
});
