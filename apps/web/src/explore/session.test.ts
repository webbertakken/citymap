import type { Walls } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { LOOK_SPEED, START_PITCH } from "./camera";
import { LONGEST_FRAME, STEP, advanceSession, newControls, placeOf, shownOf, startSession } from "./session";
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
