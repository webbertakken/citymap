import { PERSON_RADIUS, type Walls } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { LOOK_SPEED, ON_FOOT, START_PITCH } from "./camera";
import {
  LONGEST_FRAME,
  STEP,
  advanceSession,
  followOf,
  newControls,
  placeOf,
  promptOf,
  promptWords,
  ridden,
  shownOf,
  shownVehicles,
  startSession,
} from "./session";
import { VEHICLES, type Vehicle } from "./vehicles";
import { RUN_SPEED, WALK_SPEED } from "./walker";

const open: Walls = {
  move: (feet, delta) => ({
    feet: { x: feet.x + delta.x, y: Math.max(0, feet.y + delta.y), z: feet.z + delta.z },
    grounded: feet.y + delta.y <= 0,
  }),
  clearance: (from, to) => Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z),
  dispose: () => undefined,
};

describe("startSession", () => {
  it("stands on the ground facing its heading, with the camera behind", () => {
    const session = startSession({ x: 1, y: 0, z: 2 }, 0.5);
    expect(session.body).toEqual({ feet: { x: 1, y: 0, z: 2 }, rise: 0, heading: 0.5, grounded: true });
    expect(session.orbit).toEqual({ yaw: 0.5, pitch: START_PITCH });
  });
});

describe("advanceSession", () => {
  it("takes every whole step due and keeps the rest of the time for the next frame", () => {
    const controls = newControls();
    controls.keys.add("KeyW");
    const session = advanceSession(startSession({ x: 0, y: 0, z: 0 }, 0), controls, 2.5 * STEP, open);
    expect(session.body.feet.x).toBeCloseTo(2 * STEP * WALK_SPEED, 9);
    expect(session.spare).toBeCloseTo(0.5 * STEP, 9);
    expect(session.walked).toBeCloseTo(2 * STEP * WALK_SPEED, 9);
  });

  it("counts a long frame as the longest frame", () => {
    const controls = newControls();
    controls.keys.add("KeyW");
    const session = advanceSession(startSession({ x: 0, y: 0, z: 0 }, 0), controls, 5, open);
    expect(session.body.feet.x).toBeCloseTo(LONGEST_FRAME * WALK_SPEED, 2);
  });

  it("turns the camera by the drag, and walks where it now looks", () => {
    const controls = newControls();
    controls.keys.add("KeyW");
    // A quarter turn to the left: looking north.
    controls.look = { dx: -Math.PI / 2 / LOOK_SPEED, dy: 0 };
    const session = advanceSession(startSession({ x: 0, y: 0, z: 0 }, 0), controls, STEP, open);
    expect(session.orbit.yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(session.body.feet.z).toBeCloseTo(-STEP * WALK_SPEED, 9);
  });

  it("follows the stick and the jump button", () => {
    const controls = newControls();
    controls.stick = { x: 1, y: 0 };
    controls.jump = true;
    const session = advanceSession(startSession({ x: 0, y: 0, z: 0 }, 0), controls, STEP, open);
    expect(session.body.feet.z).toBeGreaterThan(0);
    expect(session.body.grounded).toBe(false);
  });
});

describe("shownOf", () => {
  /** Frames as a screen gives them: about 60 a second, never quite even. */
  const UNEVEN = [0.0155, 0.0178, 0.0162, 0.0171, 0.0149, 0.0167, 0.0183, 0.0151];

  it("moves the walker as far each frame as its pace covers in that frame, however uneven the frames", () => {
    const controls = newControls();
    controls.keys.add("KeyW");
    controls.keys.add("ShiftLeft");
    let session = startSession({ x: 0, y: 0, z: 0 }, 0);
    // Up to pace first.
    for (let i = 0; i < 30; i++) session = advanceSession(session, controls, UNEVEN[i % UNEVEN.length]!, open);
    for (let i = 0; i < 40; i++) {
      const seconds = UNEVEN[i % UNEVEN.length]!;
      const before = shownOf(session).feet.x;
      session = advanceSession(session, controls, seconds, open);
      expect((shownOf(session).feet.x - before) / seconds).toBeCloseTo(RUN_SPEED, 6);
    }
  });

  it("shows the walker between its last two steps, as far as the time not yet stepped", () => {
    const controls = newControls();
    controls.keys.add("KeyW");
    const session = advanceSession(startSession({ x: 0, y: 0, z: 0 }, 0), controls, 1.5 * STEP, open);
    expect(session.previous.feet.x).toBe(0);
    expect(shownOf(session).feet.x).toBeCloseTo(0.5 * STEP * WALK_SPEED, 9);
    expect(shownOf(session).walked).toBeCloseTo(0.5 * STEP * WALK_SPEED, 9);
  });

  it("turns the walker the short way round between its steps", () => {
    const session = { ...startSession({ x: 0, y: 0, z: 0 }, 3), spare: STEP / 2 };
    const turning = { ...session, previous: { ...session.body, heading: -3 } };
    expect(Math.cos(shownOf(turning).heading)).toBeCloseTo(-1, 3);
  });
});

describe("speed", () => {
  it("is the pace of the last step: steady at a run, nothing standing still", () => {
    const controls = newControls();
    expect(advanceSession(startSession({ x: 0, y: 0, z: 0 }, 0), controls, 0.05, open).speed).toBe(0);
    controls.keys.add("KeyW");
    controls.keys.add("ShiftLeft");
    let session = startSession({ x: 0, y: 0, z: 0 }, 0);
    for (let i = 0; i < 10; i++) session = advanceSession(session, controls, 0.0167, open);
    expect(session.speed).toBeCloseTo(RUN_SPEED, 9);
  });
});

describe("placeOf", () => {
  it("says where the walker stands and which way they face", () => {
    expect(placeOf(startSession({ x: 3, y: 0, z: 4 }, 0))).toEqual({
      feet: { x: 3, y: 0, z: 4 },
      ahead: { x: 1, z: -0 },
    });
  });
});

const pressing = (...codes: string[]) => {
  const controls = newControls();
  for (const code of codes) controls.keys.add(code);
  return controls;
};
const useKey = () => ({ ...newControls(), use: true });

describe("riding", () => {
  // A car parked 2 m east of the walker, facing east; a bicycle far off.
  const car: Vehicle = { id: "car", kind: "car", feet: { x: 4, y: 0, z: 0 }, heading: 0, speed: 0, turn: 0, steer: 0 };
  const bicycle: Vehicle = { ...car, id: "bicycle", kind: "bicycle", feet: { x: 100, y: 0, z: 0 } };
  const parked = () => startSession({ x: 1.5, y: 0, z: 0 }, 0, [car, bicycle]);

  it("offers to get in the vehicle within reach, and nothing out of reach", () => {
    expect(promptOf(parked())).toEqual({ action: "enter", kind: "car", ready: true });
    expect(promptOf(startSession({ x: 50, y: 0, z: 0 }, 0, [car]))).toBeNull();
  });

  it("gets in with E, and drives it: forward throttles, the walker goes with it", () => {
    const inside = advanceSession(parked(), useKey(), 0, open);
    expect(inside.riding).toBe("car");
    expect(ridden(inside)?.id).toBe("car");
    expect(promptOf(inside)).toEqual({ action: "leave", kind: "car", ready: true });
    expect(followOf(inside)).toBe(VEHICLES.car.follow);
    let driving = inside;
    for (let i = 0; i < 60; i++) driving = advanceSession(driving, pressing("KeyW"), 1 / 60, open);
    const moved = ridden(driving)!;
    // A second of throttle from a standstill: nearly its full power all the way.
    expect(moved.speed).toBeGreaterThan(0.95 * VEHICLES.car.accelerate);
    expect(moved.speed).toBeLessThan(VEHICLES.car.accelerate);
    expect(driving.body.feet).toEqual(moved.feet);
    expect(driving.speed).toBeCloseTo(moved.speed, 6);
    // Too fast to get out: E does nothing, and the prompt says so.
    expect(promptOf(driving)?.ready).toBe(false);
    expect(advanceSession(driving, useKey(), 0, open).riding).toBe("car");
  });

  it("swings the camera round behind a moving ride, unless the person is looking round", () => {
    let driving = { ...advanceSession(parked(), useKey(), 0, open), orbit: { yaw: 1, pitch: 0.2 } };
    for (let i = 0; i < 60; i++) driving = advanceSession(driving, pressing("KeyW"), 1 / 60, open);
    const swung = driving.orbit.yaw;
    expect(Math.abs(swung)).toBeLessThan(1);
    const looking = { ...newControls(), look: { dx: 1, dy: 0 } };
    looking.keys.add("KeyW");
    expect(advanceSession(driving, looking, 1 / 60, open).orbit.yaw).toBeCloseTo(swung - LOOK_SPEED, 9);
  });

  it("gets out with E once stopped, beside the vehicle, leaving it parked there", () => {
    let driving = advanceSession(parked(), useKey(), 0, open);
    for (let i = 0; i < 30; i++) driving = advanceSession(driving, pressing("KeyW"), 1 / 60, open);
    for (let i = 0; i < 120; i++) driving = advanceSession(driving, pressing("Space"), 1 / 60, open);
    const out = advanceSession(driving, useKey(), 0, open);
    expect(out.riding).toBeNull();
    const left = ridden({ ...out, riding: "car" })!;
    expect(left.speed).toBe(0);
    expect(left.feet.x).toBeGreaterThan(4);
    // Beside it on its left (north, facing east), on foot.
    expect(out.body.feet.z).toBeLessThan(-VEHICLES.car.width / 2);
    expect(out.body.grounded).toBe(true);
    expect(promptOf(out)?.action).toBe("enter");
  });

  it("cannot get in while off the ground", () => {
    const jumping = advanceSession(parked(), pressing("Space"), STEP, open);
    expect(jumping.body.grounded).toBe(false);
    expect(promptOf(jumping)).toBeNull();
    expect(advanceSession(jumping, useKey(), 0, open).riding).toBeNull();
  });

  it("does nothing for E with no vehicle within reach", () => {
    const alone = startSession({ x: 50, y: 0, z: 0 }, 0, [car]);
    expect(advanceSession(alone, useKey(), 0, open)).toEqual(alone);
  });

  it("draws vehicles between their last two steps, and a vehicle without a step where it stands", () => {
    let driving = advanceSession(parked(), useKey(), 0, open);
    for (let i = 0; i < 30; i++) driving = advanceSession(driving, pressing("KeyW"), 1 / 60, open);
    const half = advanceSession(driving, pressing("KeyW"), STEP / 2, open);
    const [shownCar, shownBicycle] = shownVehicles(half);
    const before = half.previousVehicles[0]!.feet.x;
    expect(shownCar!.feet.x).toBeGreaterThan(before);
    expect(shownCar!.feet.x).toBeLessThan(half.vehicles[0]!.feet.x);
    expect(shownBicycle!.feet).toEqual(bicycle.feet);
    const fresh = { ...parked(), previousVehicles: [] };
    expect(shownVehicles(fresh)[0]!.feet).toEqual(car.feet);
  });

  it("walks into a parked vehicle and no further", () => {
    // Running east from 20 m short of the car, for six seconds: well past it, but it is in the way.
    let walking = startSession({ x: -20, y: 0, z: 0 }, 0, [car]);
    for (let i = 0; i < 360; i++) walking = advanceSession(walking, pressing("KeyW", "ShiftLeft"), 1 / 60, open);
    expect(walking.body.feet.x).toBeCloseTo(4 - VEHICLES.car.length / 2 - PERSON_RADIUS, 6);
  });

  it("bumps a ridden vehicle off another, costing most of its speed", () => {
    // On the bicycle, 10 m behind the car, riding at it.
    const bike: Vehicle = { ...bicycle, feet: { x: -8, y: 0, z: 0 } };
    let riding = advanceSession(startSession({ x: -8, y: 0, z: 1 }, 0, [car, bike]), useKey(), 0, open);
    expect(riding.riding).toBe("bicycle");
    let fastest = 0;
    for (let i = 0; i < 600; i++) {
      riding = advanceSession(riding, pressing("KeyW"), 1 / 60, open);
      fastest = Math.max(fastest, ridden(riding)!.speed);
    }
    const stopped = ridden(riding)!;
    expect(stopped.feet.x).toBeLessThan(4 - VEHICLES.car.length / 2);
    expect(stopped.speed).toBeLessThan(fastest);
  });

  it("says what E would do in words", () => {
    expect(promptWords({ action: "enter", kind: "car", ready: true })).toBe("Get in the car");
    expect(promptWords({ action: "enter", kind: "bicycle", ready: true })).toBe("Get on the bicycle");
    expect(promptWords({ action: "leave", kind: "car", ready: true })).toBe("Get out of the car");
    expect(promptWords({ action: "leave", kind: "bicycle", ready: true })).toBe("Get off the bicycle");
    expect(promptWords({ action: "leave", kind: "car", ready: false })).toBe("Slow down to get out of the car");
  });

  it("follows on foot over the shoulder", () => {
    expect(followOf(parked())).toBe(ON_FOOT);
  });
});
