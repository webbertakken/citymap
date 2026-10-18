import { describe, expect, it } from "vitest";
import { RUN_PUSH, WALK_KEYS, intentsOf, stickAt } from "./input";

const keys = (...codes: string[]) => new Set(codes);

describe("intentsOf", () => {
  it("walks by WASD and the arrows, by the keys' places", () => {
    expect(intentsOf(keys("KeyW"), null, false)).toEqual({ forward: 1, right: 0, run: false, jump: false });
    expect(intentsOf(keys("ArrowDown", "ArrowLeft"), null, false)).toMatchObject({ forward: -1, right: -1 });
    expect(intentsOf(keys("KeyD"), null, false).right).toBe(1);
    // Opposite keys cancel.
    expect(intentsOf(keys("KeyW", "KeyS"), null, false).forward).toBe(0);
  });

  it("runs with either Shift and jumps with Space or the jump button", () => {
    expect(intentsOf(keys("KeyW", "ShiftRight"), null, false).run).toBe(true);
    expect(intentsOf(keys("Space"), null, false).jump).toBe(true);
    expect(intentsOf(keys(), null, true).jump).toBe(true);
  });

  it("follows a pushed stick over the keys, running when pushed nearly all the way", () => {
    expect(intentsOf(keys("KeyW"), { x: 0.3, y: -0.4 }, false)).toEqual({
      forward: -0.4,
      right: 0.3,
      run: false,
      jump: false,
    });
    expect(intentsOf(keys(), { x: 0, y: RUN_PUSH }, false).run).toBe(true);
    // A stick at rest leaves the keys in charge.
    expect(intentsOf(keys("KeyW"), { x: 0, y: 0 }, false).forward).toBe(1);
  });

  it("knows every key it answers to", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ShiftLeft", "Space"])
      expect(WALK_KEYS.has(code)).toBe(true);
    expect(WALK_KEYS.has("Escape")).toBe(false);
  });
});

describe("stickAt", () => {
  it("pushes forward for a finger moved up, right for a finger moved right", () => {
    expect(stickAt({ x: 100, y: 100 }, { x: 120, y: 70 }, 40)).toEqual({ x: 0.5, y: 0.75 });
  });

  it("never pushes beyond its reach", () => {
    const stick = stickAt({ x: 0, y: 0 }, { x: 300, y: -400 }, 50);
    expect(stick.x).toBeCloseTo(0.6, 9);
    expect(stick.y).toBeCloseTo(0.8, 9);
  });
});
