import { THEMES } from "@citymap/themes";
import { Group, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { bicycle, car, helicopter, paletteOf } from "./procedural";
import { PROCEDURAL_RIGS, RIGS, poseHelicopter, poseVehicle, type Pose, type Rig } from "./rig";

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

/** A pose: rolled so far, the rest still. */
const still: Pose = { rolled: 0, steer: 0, lean: 0, pitch: 0, crank: 0 };

/** Where a part's own +y ends up: its top, after its turn. */
const topOf = (model: Group, name: string) => new Vector3(0, 1, 0).applyEuler(model.getObjectByName(name)!.rotation);

describe("poseVehicle", () => {
  it("rolls a PSX car's wheels forwards (their tops ahead, +z), and steers its front ones only", () => {
    const model = rigged(RIGS.car);
    poseVehicle(model, RIGS.car, { ...still, rolled: 0.1, steer: -0.3 });
    expect(topOf(model, "sedan_blue_wheel_rear_left").z).toBeGreaterThan(0);
    expect(model.getObjectByName("sedan_blue_wheel_rear_left")!.rotation.x).toBeCloseTo(0.1 / RIGS.car.radius, 9);
    expect(model.getObjectByName("sedan_blue_wheel_front_right")!.rotation.y).toBeCloseTo(-0.3, 9);
    expect(model.getObjectByName("sedan_blue_wheel_rear_right")!.rotation.y).toBe(0);
  });

  it("turns a PSX bicycle's crank by its own angle, steers its fork and leans it", () => {
    const model = rigged(RIGS.bicycle);
    poseVehicle(model, RIGS.bicycle, { ...still, rolled: 2, steer: 0.2, lean: 0.3, crank: 1.25 });
    const turn = 2 / RIGS.bicycle.radius;
    expect(model.getObjectByName("bicycle_red_wheel_rear")!.rotation.x).toBeCloseTo(turn, 9);
    expect(model.getObjectByName("bicycle_red_crank")!.rotation.x).toBeCloseTo(1.25, 9);
    expect(model.getObjectByName("bicycle_red_fork")!.rotation.y).toBeCloseTo(0.2, 9);
    // The front wheel rides on the fork: it rolls, and turns with the fork, not on its own.
    expect(model.getObjectByName("bicycle_red_wheel_front")!.rotation.y).toBe(0);
    expect(new Vector3(0, 1, 0).applyEuler(model.rotation).z).toBeLessThan(0);
  });

  it("rolls the procedural stand-ins, built facing +x, forwards about −z", () => {
    const bike = bicycle(p);
    poseVehicle(bike, PROCEDURAL_RIGS.bicycle, { ...still, rolled: 0.1 });
    // Facing +x, a wheel's top rolls forwards to +x.
    expect(new Vector3(0, 1, 0).applyEuler(bike.getObjectByName("wheel-rear")!.rotation).x).toBeGreaterThan(0);
    const sedan = car(p);
    poseVehicle(sedan, PROCEDURAL_RIGS.car, { ...still, rolled: 0.1, steer: 0.2 });
    expect(sedan.getObjectByName("wheel-front-left")!.rotation.y).toBeCloseTo(0.2, 9);
  });

  it("leaves a model without the rig's parts as it is, but for its lean", () => {
    const model = new Group();
    poseVehicle(model, RIGS.bicycle, { ...still, rolled: 1, lean: 0.1 });
    poseVehicle(
      model,
      { wheels: [], radius: 1, front: 0, roll: { axis: "x", sign: 1 } },
      { ...still, rolled: 1, lean: 0.1 },
    );
    expect(model.children).toHaveLength(0);
    expect(model.rotation.x).toBeCloseTo(-0.1, 9);
  });

  it("pitches nose down about its front contact, which stays where it was", () => {
    const model = rigged(RIGS.bicycle);
    poseVehicle(model, RIGS.bicycle, { ...still, pitch: 0.3, lean: 0.2 });
    model.updateMatrixWorld(true);
    const front = new Vector3(RIGS.bicycle.front, 0, 0).applyMatrix4(model.matrix);
    expect(front.x).toBeCloseTo(RIGS.bicycle.front, 9);
    expect(front.y).toBeCloseTo(0, 9);
    expect(front.z).toBeCloseTo(0, 9);
    // Its back end is up off the ground.
    const back = new Vector3(-RIGS.bicycle.front, 0, 0).applyMatrix4(model.matrix);
    expect(back.y).toBeGreaterThan(0.2);
    // Level again, it stands where it always did.
    poseVehicle(model, RIGS.bicycle, still);
    expect(model.position.toArray()).toEqual([0, 0, 0]);
  });

  it("lifts the front in a wheelie about its back contact, which stays where it was", () => {
    const model = rigged(RIGS.motorbike);
    poseVehicle(model, RIGS.motorbike, { ...still, pitch: -0.4 });
    model.updateMatrixWorld(true);
    const back = new Vector3(-RIGS.motorbike.back, 0, 0).applyMatrix4(model.matrix);
    expect(back.x).toBeCloseTo(-RIGS.motorbike.back, 9);
    expect(back.y).toBeCloseTo(0, 9);
    const front = new Vector3(RIGS.motorbike.front, 0, 0).applyMatrix4(model.matrix);
    expect(front.y).toBeGreaterThan(0.5);
    // A rig that does not say where its back wheel meets the ground lifts about the front's distance behind.
    const plain = new Group();
    poseVehicle(plain, { wheels: [], radius: 1, front: 0.5, roll: { axis: "x", sign: 1 } }, { ...still, pitch: -0.4 });
    plain.updateMatrixWorld(true);
    expect(new Vector3(-0.5, 0, 0).applyMatrix4(plain.matrix).y).toBeCloseTo(0, 9);
  });
});

describe("poseHelicopter", () => {
  it("spins the AS350's main rotor about its upright, clockwise from above, and its tail rotor about its axle", () => {
    const rig = RIGS.helicopter;
    const model = new Group();
    for (const name of [rig.rotors.main, rig.rotors.tail]) {
      const part = new Group();
      part.name = name;
      model.add(part);
    }
    poseHelicopter(model, rig, { blades: 0.5, tail: 1.25 });
    expect(model.getObjectByName(rig.rotors.main)!.rotation.y).toBeCloseTo(-0.5, 9);
    expect(model.getObjectByName(rig.rotors.tail)!.rotation.x).toBeCloseTo(1.25, 9);
    // Its mast stands over the group's origin, where the walk keeps the helicopter's feet.
    expect(model.position.x).toBeCloseTo(-rig.rotors.hub, 9);
  });

  it("spins the stand-in's rotors by its own names and axes, and leaves a model without them as it is", () => {
    const model = helicopter(p);
    const rig = PROCEDURAL_RIGS.helicopter;
    poseHelicopter(model, rig, { blades: 0.5, tail: 1.25 });
    expect(model.getObjectByName("rotor-main")!.rotation.y).toBeCloseTo(-0.5, 9);
    expect(model.getObjectByName("rotor-tail")!.rotation.z).toBeCloseTo(1.25, 9);
    expect(model.position.x).toBeCloseTo(-rig.rotors.hub, 9);
    const bare = new Group();
    poseHelicopter(bare, rig, { blades: 0.5, tail: 1.25 });
    expect(bare.children).toHaveLength(0);
  });
});
