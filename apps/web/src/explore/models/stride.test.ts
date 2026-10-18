import { THEMES } from "@citymap/themes";
import { Group } from "three";
import { describe, expect, it } from "vitest";
import { WALK_SPEED } from "../walker";
import { figure, paletteOf } from "./procedural";
import { ARM_SHARE, MAX_SWING, STRIDE, WALK_SWING, poseStride, swingOf } from "./stride";

describe("swingOf", () => {
  it("swings forward a quarter stride in, back three quarters in, and level at rest", () => {
    expect(swingOf(STRIDE / 4, WALK_SPEED)).toBeCloseTo(WALK_SWING, 9);
    expect(swingOf((3 * STRIDE) / 4, WALK_SPEED)).toBeCloseTo(-WALK_SWING, 9);
    expect(swingOf(STRIDE / 4, 0)).toBe(0);
  });

  it("swings wider at a run, but never past its limit", () => {
    expect(swingOf(STRIDE / 4, 1.5 * WALK_SPEED)).toBeCloseTo(1.5 * WALK_SWING, 9);
    expect(swingOf(STRIDE / 4, 100)).toBeCloseTo(MAX_SWING, 9);
  });
});

describe("poseStride", () => {
  it("swings each leg against the other, and each arm against its leg", () => {
    const model = figure(paletteOf(THEMES["paper-atlas"]));
    poseStride(model, 0.3);
    expect(model.getObjectByName("leg-left")?.rotation.z).toBeCloseTo(0.3, 9);
    expect(model.getObjectByName("leg-right")?.rotation.z).toBeCloseTo(-0.3, 9);
    expect(model.getObjectByName("arm-left")?.rotation.z).toBeCloseTo(-0.3 * ARM_SHARE, 9);
    expect(model.getObjectByName("arm-right")?.rotation.z).toBeCloseTo(0.3 * ARM_SHARE, 9);
  });

  it("leaves a model without limbs as it is", () => {
    const model = new Group();
    poseStride(model, 0.3);
    expect(model.children).toHaveLength(0);
  });
});
