import { Object3D, Quaternion } from "three";
import { describe, expect, it } from "vitest";
import { STAND_SWING, kickstandOf, leanOnStand, standAfter } from "./kickstand";

describe("standAfter", () => {
  it("unfolds a parked machine's stand over STAND_SWING, and folds a ridden one's as fast", () => {
    expect(standAfter(0, true, STAND_SWING / 2, false)).toBeCloseTo(0.5, 9);
    expect(standAfter(0.5, true, STAND_SWING, false)).toBe(1);
    expect(standAfter(1, false, STAND_SWING / 4, false)).toBeCloseTo(0.75, 9);
    expect(standAfter(0.1, false, STAND_SWING, false)).toBe(0);
  });

  it("swings it at once under reduced motion", () => {
    expect(standAfter(0, true, 0.001, true)).toBe(1);
    expect(standAfter(1, false, 0.001, true)).toBe(0);
  });
});

describe("leanOnStand", () => {
  it("leans an upright machine onto its stand as far as the stand is down", () => {
    expect(leanOnStand(0, 1, 0.14)).toBeCloseTo(0.14, 9);
    expect(leanOnStand(0, 0.5, 0.14)).toBeCloseTo(0.07, 9);
    expect(leanOnStand(0.12, 0, 0.14)).toBe(0.12);
  });

  it("adds less as the machine's own lean nears the stand's, and nothing past it: one knocked over lies as it lies", () => {
    expect(leanOnStand(0.07, 1, 0.14)).toBeCloseTo(0.14, 9);
    expect(leanOnStand(-0.3, 1, 0.14)).toBe(-0.3);
    expect(leanOnStand(1.4, 1, 0.14)).toBe(1.4);
  });
});

describe("kickstandOf", () => {
  it("reads a stand's folded turn and its lean from the extras the model build gave it", () => {
    const node = new Object3D();
    node.userData = { folded: [0, 0, 1, 0], lean: 0.14 };
    const stand = kickstandOf(node);
    expect(stand?.lean).toBe(0.14);
    expect(stand?.folded.equals(new Quaternion(0, 0, 1, 0))).toBe(true);
  });

  it("calls a node without readable extras no stand", () => {
    const node = new Object3D();
    expect(kickstandOf(node)).toBeNull();
    node.userData = { folded: [0, 0, 1], lean: 0.14 };
    expect(kickstandOf(node)).toBeNull();
    node.userData = { folded: [0, 0, 1, "0"], lean: 0.14 };
    expect(kickstandOf(node)).toBeNull();
    node.userData = { folded: [0, 0, 1, 0], lean: "0.14" };
    expect(kickstandOf(node)).toBeNull();
  });
});
