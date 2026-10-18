import type { Walls } from "@citymap/world";
import { describe, expect, it } from "vitest";
import {
  LOOK_SPEED,
  NEAREST,
  ORBIT_DISTANCE,
  PITCH_MAX,
  PITCH_MIN,
  SHOULDER,
  START_PITCH,
  REACH_EASE,
  WALL_GAP,
  behind,
  cameraOf,
  easeReach,
  reachOf,
  turned,
} from "./camera";

const clearFor = (distance: number): Walls => ({
  move: (feet) => ({ feet, grounded: true }),
  clearance: (from, to) => Math.min(distance, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)),
  dispose: () => undefined,
});
const feet = { x: 10, y: 0, z: 5 };

describe("cameraOf", () => {
  it("looks at the shoulder from behind it, as far back as the orbit asks", () => {
    const { eye, target } = cameraOf(feet, { yaw: 0, pitch: 0 }, clearFor(Infinity));
    expect(target).toEqual({ x: 10, y: SHOULDER, z: 5 });
    // Looking east, level: the camera stands to the west of the shoulder.
    expect(eye.x).toBeCloseTo(10 - ORBIT_DISTANCE, 9);
    expect(eye.y).toBeCloseTo(SHOULDER, 9);
    expect(eye.z).toBeCloseTo(5, 9);
  });

  it("rises behind as it looks down", () => {
    const { eye } = cameraOf(feet, { yaw: Math.PI / 2, pitch: 0.5 }, clearFor(Infinity));
    expect(eye.y).toBeCloseTo(SHOULDER + Math.sin(0.5) * ORBIT_DISTANCE, 9);
    // Looking north: the camera is to the south (+z).
    expect(eye.z).toBeCloseTo(5 + Math.cos(0.5) * ORBIT_DISTANCE, 9);
  });

  it("stays back when the line to it is clear but for rounding", () => {
    const rounding = { ...clearFor(Infinity), clearance: () => ORBIT_DISTANCE * (1 - 1e-15) };
    expect(cameraOf(feet, { yaw: 0, pitch: 0 }, rounding).eye.x).toBeCloseTo(10 - ORBIT_DISTANCE, 9);
  });

  it("pulls in short of a wall, but never into the shoulder", () => {
    expect(cameraOf(feet, { yaw: 0, pitch: 0 }, clearFor(2)).eye.x).toBeCloseTo(10 - (2 - WALL_GAP), 9);
    expect(cameraOf(feet, { yaw: 0, pitch: 0 }, clearFor(0.1)).eye.x).toBeCloseTo(10 - NEAREST, 9);
  });

  it("follows from as far back and as high as asked", () => {
    const { eye, target } = cameraOf(feet, { yaw: 0, pitch: 0 }, clearFor(Infinity), { distance: 7, height: 2 });
    expect(target.y).toBe(2);
    expect(eye.x).toBeCloseTo(10 - 7, 9);
  });
});

describe("reachOf and easeReach", () => {
  it("says how far back the camera can sit", () => {
    expect(reachOf(feet, { yaw: 0, pitch: 0 }, clearFor(Infinity))).toBe(ORBIT_DISTANCE);
    expect(reachOf(feet, { yaw: 0, pitch: 0 }, clearFor(2))).toBeCloseTo(2 - WALL_GAP, 9);
  });

  it("goes in to a wall at once, and back out gently", () => {
    expect(easeReach(4.5, 2, 0.01)).toBe(2);
    expect(easeReach(2, 4.5, REACH_EASE)).toBeCloseTo(4.5 - 2.5 * Math.exp(-1), 9);
    expect(easeReach(2, 4.5, 0)).toBe(2);
  });

  it("places the camera at the distance given", () => {
    expect(cameraOf(feet, { yaw: 0, pitch: 0 }, clearFor(Infinity), undefined, 3).eye.x).toBeCloseTo(7, 9);
  });
});

describe("turned and behind", () => {
  it("turns right for a drag right and tilts down for a drag down", () => {
    const orbit = turned({ yaw: 0, pitch: 0 }, 100, 40);
    expect(orbit.yaw).toBeCloseTo(-100 * LOOK_SPEED, 9);
    expect(orbit.pitch).toBeCloseTo(40 * LOOK_SPEED, 9);
  });

  it("never tilts past straight down or under the ground", () => {
    expect(turned({ yaw: 0, pitch: 0 }, 0, 10_000).pitch).toBe(PITCH_MAX);
    expect(turned({ yaw: 0, pitch: 0 }, 0, -10_000).pitch).toBe(PITCH_MIN);
  });

  it("starts behind the walker, looking a little down", () => {
    expect(behind(1.2)).toEqual({ yaw: 1.2, pitch: START_PITCH });
  });
});
