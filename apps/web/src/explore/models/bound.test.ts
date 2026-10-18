import { describe, expect, it } from "vitest";
import { RUN_SPEED, WALK_SPEED } from "../walker";
import { LEAN, LEAP, LEAP_HEIGHT, SETTLE, SQUASH, boundOf, runShare, settle } from "./bound";

describe("runShare", () => {
  it("is nothing at a walk, everything at a run, and in between on the way", () => {
    expect(runShare(0)).toBe(0);
    expect(runShare(WALK_SPEED)).toBe(0);
    expect(runShare(RUN_SPEED)).toBe(1);
    expect(runShare(100)).toBe(1);
    expect(runShare((WALK_SPEED + RUN_SPEED) / 2)).toBeCloseTo(0.5, 9);
  });
});

describe("boundOf", () => {
  it("leaps once a leap's length, highest halfway, on the ground between", () => {
    expect(boundOf(0, 1).lift).toBe(0);
    expect(boundOf(LEAP / 2, 1).lift).toBeCloseTo(LEAP_HEIGHT, 9);
    expect(boundOf(LEAP, 1).lift).toBeCloseTo(0, 9);
    expect(boundOf(7 * LEAP + LEAP / 4, 1).lift).toBeCloseTo(0.75 * LEAP_HEIGHT, 9);
  });

  it("squashes landing, stretches at the top, and leans into the run", () => {
    expect(boundOf(0, 1).stretch).toBeCloseTo(1 - SQUASH, 9);
    expect(boundOf(LEAP / 2, 1).stretch).toBeCloseTo(1 + SQUASH, 9);
    expect(boundOf(LEAP / 3, 1).lean).toBe(LEAN);
  });

  it("does none of it at a walk, and half of it half way to a run", () => {
    expect(boundOf(LEAP / 2, 0)).toEqual({ lift: 0, stretch: 1, lean: 0 });
    expect(boundOf(LEAP / 2, 0.5).lift).toBeCloseTo(LEAP_HEIGHT / 2, 9);
  });
});

describe("settle", () => {
  it("eases towards where it is going, most of the way in its settling time", () => {
    expect(settle(0, 1, 0)).toBe(0);
    expect(settle(0, 1, SETTLE)).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(settle(0, 1, 100 * SETTLE)).toBeCloseTo(1, 9);
    expect(settle(1, 0, SETTLE)).toBeCloseTo(Math.exp(-1), 9);
  });
});
