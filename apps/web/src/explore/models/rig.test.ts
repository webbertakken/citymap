import { THEMES } from "@citymap/themes";
import { Group, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GRAVITY } from "../walker";
import { bicycle, car, paletteOf } from "./procedural";
import { GEARING, MAX_LEAN, PROCEDURAL_RIGS, RIGS, leanOf, poseVehicle, type Rig } from "./rig";

const p = paletteOf(THEMES["paper-atlas"]);

/** A model with a named part for each of a rig's moving parts. */
function rigged(rig: Rig) {
  const model = new Group();
  for (const name of [...rig.wheels.map((w) => w.name), rig.crank, rig.fork]) {
    if (!name) continue;
    const part = new Group();
    part.name = name;
    model.add(part);
  }
  return model;
}

/** Where a part's own +y ends up: its top, after its turn. */
const topOf = (model: Group, name: string) => new Vector3(0, 1, 0).applyEuler(model.getObjectByName(name)!.rotation);

describe("leanOf", () => {
  it("leans into a turn as far as balance asks, left for a left turn, upright going straight", () => {
    expect(leanOf(5, 0)).toBe(0);
    const left = leanOf(4, 0.5);
    expect(left).toBeCloseTo(Math.atan(2 / GRAVITY), 9);
    expect(leanOf(4, -0.5)).toBeCloseTo(-left, 9);
  });

  it("never leans past its limit", () => {
    expect(leanOf(30, 2)).toBe(MAX_LEAN);
    expect(leanOf(30, -2)).toBe(-MAX_LEAN);
  });
});

describe("poseVehicle", () => {
  it("rolls a PSX car's wheels forwards (their tops ahead, +z), and steers its front ones only", () => {
    const model = rigged(RIGS.car);
    poseVehicle(model, RIGS.car, { rolled: 0.1, steer: -0.3, lean: 0.2 });
    expect(topOf(model, "sedan_blue_wheel_rear_left").z).toBeGreaterThan(0);
    expect(model.getObjectByName("sedan_blue_wheel_rear_left")!.rotation.x).toBeCloseTo(0.1 / RIGS.car.radius, 9);
    expect(model.getObjectByName("sedan_blue_wheel_front_right")!.rotation.y).toBeCloseTo(-0.3, 9);
    expect(model.getObjectByName("sedan_blue_wheel_rear_right")!.rotation.y).toBe(0);
  });

  it("turns a PSX bicycle's crank through its gearing, steers its fork and leans it", () => {
    const model = rigged(RIGS.bicycle);
    poseVehicle(model, RIGS.bicycle, { rolled: 2, steer: 0.2, lean: 0.3 });
    const turn = 2 / RIGS.bicycle.radius;
    expect(model.getObjectByName("bicycle_red_wheel_rear")!.rotation.x).toBeCloseTo(turn, 9);
    expect(model.getObjectByName("bicycle_red_crank")!.rotation.x).toBeCloseTo(turn / GEARING, 9);
    expect(model.getObjectByName("bicycle_red_fork")!.rotation.y).toBeCloseTo(0.2, 9);
    // The front wheel rides on the fork: it rolls, and turns with the fork, not on its own.
    expect(model.getObjectByName("bicycle_red_wheel_front")!.rotation.y).toBe(0);
    expect(new Vector3(0, 1, 0).applyEuler(model.rotation).z).toBeLessThan(0);
  });

  it("rolls the procedural stand-ins, built facing +x, forwards about −z", () => {
    const bike = bicycle(p);
    poseVehicle(bike, PROCEDURAL_RIGS.bicycle, { rolled: 0.1, steer: 0, lean: 0 });
    // Facing +x, a wheel's top rolls forwards to +x.
    expect(new Vector3(0, 1, 0).applyEuler(bike.getObjectByName("wheel-rear")!.rotation).x).toBeGreaterThan(0);
    const sedan = car(p);
    poseVehicle(sedan, PROCEDURAL_RIGS.car, { rolled: 0.1, steer: 0.2, lean: 0 });
    expect(sedan.getObjectByName("wheel-front-left")!.rotation.y).toBeCloseTo(0.2, 9);
  });

  it("leaves a model without the rig's parts as it is, but for its lean", () => {
    const model = new Group();
    poseVehicle(model, RIGS.bicycle, { rolled: 1, steer: 0, lean: 0.1 });
    poseVehicle(model, { wheels: [], radius: 1, roll: { axis: "x", sign: 1 } }, { rolled: 1, steer: 0, lean: 0.1 });
    expect(model.children).toHaveLength(0);
    expect(model.rotation.x).toBeCloseTo(-0.1, 9);
  });
});
