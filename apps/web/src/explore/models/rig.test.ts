import { THEMES } from "@citymap/themes";
import { Group, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GRAVITY } from "../walker";
import { bicycle, paletteOf } from "./procedural";
import { GEARING, MAX_LEAN, WHEEL_RADIUS, leanOf, poseVehicle } from "./rig";

/** A stand-in for Kenney's car: a body and its four named wheels. */
function car() {
  const model = new Group();
  for (const name of ["body", "wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"]) {
    const part = new Group();
    part.name = name;
    model.add(part);
  }
  return model;
}

describe("leanOf", () => {
  it("leans into a turn as far as balance asks, left for a left turn, upright going straight", () => {
    expect(leanOf(5, 0, 1)).toBe(0);
    const left = leanOf(4, 0.1, 1);
    expect(left).toBeCloseTo(Math.atan((16 * Math.tan(0.1)) / GRAVITY), 9);
    expect(leanOf(4, -0.1, 1)).toBeCloseTo(-left, 9);
  });

  it("never leans past its limit", () => {
    expect(leanOf(30, 0.5, 1)).toBe(MAX_LEAN);
    expect(leanOf(30, -0.5, 1)).toBe(-MAX_LEAN);
  });
});

describe("poseVehicle", () => {
  it("turns a car's wheels by the ground rolled, and steers its front ones only", () => {
    const model = car();
    poseVehicle(model, "car", { rolled: 1, steer: 0.3, lean: 0.2 });
    const front = model.getObjectByName("wheel-front-left")!;
    const back = model.getObjectByName("wheel-back-right")!;
    expect(front.rotation.x).toBeCloseTo(1 / WHEEL_RADIUS.car, 9);
    expect(front.rotation.y).toBeCloseTo(0.3, 9);
    expect(front.rotation.order).toBe("YXZ");
    expect(back.rotation.y).toBe(0);
    // A car does not lean.
    expect(model.rotation.x).toBe(0);
  });

  it("leaves a car without some wheel as it is", () => {
    const model = new Group();
    poseVehicle(model, "car", { rolled: 1, steer: 0, lean: 0 });
    expect(model.children).toHaveLength(0);
  });

  it("turns a bicycle's wheels forward, its pedals through its gearing, steers its fork and leans it", () => {
    const model = bicycle(paletteOf(THEMES["paper-atlas"]));
    poseVehicle(model, "bicycle", { rolled: 2, steer: -0.2, lean: 0.3 });
    const turn = 2 / WHEEL_RADIUS.bicycle;
    expect(model.getObjectByName("wheel-rear")?.rotation.z).toBeCloseTo(-turn, 9);
    expect(model.getObjectByName("wheel-front")?.rotation.z).toBeCloseTo(-turn, 9);
    expect(model.getObjectByName("crank")?.rotation.z).toBeCloseTo(-turn / GEARING, 9);
    expect(model.getObjectByName("steering")?.rotation.y).toBeCloseTo(-0.2, 9);
    // Leaning left: the top of the bicycle goes north (−z) when it faces east.
    model.updateMatrixWorld();
    const top = new Vector3(0, 1, 0).applyEuler(model.rotation);
    expect(top.z).toBeLessThan(0);
  });

  it("leaves a model without a bicycle's parts upright but otherwise as it is", () => {
    const model = new Group();
    poseVehicle(model, "bicycle", { rolled: 1, steer: 0, lean: 0.1 });
    expect(model.rotation.x).toBeCloseTo(-0.1, 9);
  });
});
