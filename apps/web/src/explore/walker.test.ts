import { describe, expect, it } from "vitest";
import {
  GRAVITY,
  JUMP_SPEED,
  NO_INTENTS,
  RUN_SPEED,
  TURN_RATE,
  WALK_SPEED,
  facing,
  stepWalker,
  turnBetween,
  type Body,
  type Vec3,
  type Walls,
} from "./walker";

/** Open ground at y = 0: every move is taken, and nothing sinks below the ground. */
const open: Walls = {
  move: (feet: Vec3, delta: Vec3) => {
    const y = feet.y + delta.y;
    return { feet: { x: feet.x + delta.x, y: Math.max(0, y), z: feet.z + delta.z }, grounded: y <= 0 };
  },
  clearance: (from, to) => Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z),
  dispose: () => undefined,
};
const standing: Body = { feet: { x: 0, y: 0, z: 0 }, rise: 0, heading: 0, grounded: true };
const dt = 1 / 120;

describe("stepWalker", () => {
  it("walks forward where the camera looks, at a walk or a run", () => {
    const walked = stepWalker(standing, { ...NO_INTENTS, forward: 1 }, 0, dt, open);
    expect(walked.feet.x).toBeCloseTo(WALK_SPEED * dt, 9);
    expect(walked.feet.z).toBeCloseTo(0, 9);
    const ran = stepWalker(standing, { ...NO_INTENTS, forward: 1, run: true }, Math.PI / 2, dt, open);
    // Looking north (heading a quarter turn): forward is −z.
    expect(ran.feet.z).toBeCloseTo(-RUN_SPEED * dt, 9);
  });

  it("steps to the right of where the camera looks, and never faster on a diagonal", () => {
    const right = stepWalker(standing, { ...NO_INTENTS, right: 1 }, 0, dt, open);
    // Looking east, the right is south: +z.
    expect(right.feet.z).toBeCloseTo(WALK_SPEED * dt, 9);
    const diagonal = stepWalker(standing, { ...NO_INTENTS, forward: 1, right: 1 }, 0, dt, open);
    expect(Math.hypot(diagonal.feet.x, diagonal.feet.z)).toBeCloseTo(WALK_SPEED * dt, 9);
    const gentle = stepWalker(standing, { ...NO_INTENTS, forward: 0.5 }, 0, dt, open);
    expect(gentle.feet.x).toBeCloseTo(0.5 * WALK_SPEED * dt, 9);
  });

  it("turns towards where it walks, no faster than its turn rate, and keeps facing when it stops", () => {
    const back = stepWalker(standing, { ...NO_INTENTS, forward: -1 }, 0, dt, open);
    expect(Math.abs(back.heading)).toBeCloseTo(TURN_RATE * dt, 9);
    let body = standing;
    for (let i = 0; i < 120; i++) body = stepWalker(body, { ...NO_INTENTS, right: 1 }, 0, dt, open);
    expect(turnBetween(body.heading, -Math.PI / 2)).toBeCloseTo(0, 6);
    expect(stepWalker(body, NO_INTENTS, 0, dt, open).heading).toBe(body.heading);
  });

  it("jumps from the ground, falls under gravity and lands", () => {
    let body = stepWalker(standing, { ...NO_INTENTS, jump: true }, 0, dt, open);
    expect(body.grounded).toBe(false);
    expect(body.rise).toBe(JUMP_SPEED);
    let top = 0;
    let steps = 1;
    while (!body.grounded && steps < 1000) {
      body = stepWalker(body, { ...NO_INTENTS, jump: true }, 0, dt, open);
      top = Math.max(top, body.feet.y);
      steps++;
    }
    expect(top).toBeCloseTo((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY), 1);
    expect(steps * dt).toBeCloseTo((2 * JUMP_SPEED) / GRAVITY, 1);
    expect(body).toMatchObject({ grounded: true, rise: 0 });
  });

  it("presses on the ground while standing, and stays there", () => {
    const moves: Vec3[] = [];
    const watched: Walls = {
      ...open,
      move: (feet, delta) => {
        moves.push(delta);
        return open.move(feet, delta);
      },
    };
    const body = stepWalker(standing, NO_INTENTS, 0, dt, watched);
    expect(moves[0]?.y).toBeCloseTo(-GRAVITY * dt * dt, 12);
    expect(body).toEqual(standing);
  });

  it("takes only what the walls allow", () => {
    const wall: Walls = { ...open, move: (feet) => ({ feet, grounded: true }) };
    expect(stepWalker(standing, { ...NO_INTENTS, forward: 1 }, 0, dt, wall).feet).toEqual(standing.feet);
  });
});

describe("turnBetween and facing", () => {
  it("turns the short way round", () => {
    expect(turnBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    expect(turnBetween(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("faces east at no turn and north at a quarter turn", () => {
    expect(facing(0).x).toBe(1);
    expect(facing(Math.PI / 2).z).toBeCloseTo(-1, 9);
  });
});
