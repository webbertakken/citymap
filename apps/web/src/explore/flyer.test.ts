import { describe, expect, it } from "vitest";
import { FASTEST_FLIGHT, FLY_SPEED, GEAR, SLOWEST_FLIGHT, flyingCamera, geared, lookAlong, stepFlyer } from "./flyer";

const flyer = { at: { x: 0, y: 10, z: 0 }, speed: FLY_SPEED };
const level = { yaw: 0, pitch: 0 };

describe("stepFlyer", () => {
  it("flies forward where it looks, down with the look when it looks down", () => {
    expect(stepFlyer(flyer, { forward: 1, right: 0, up: 0 }, level, 0.5).at).toEqual({ x: 10, y: 10, z: 0 });
    const down = stepFlyer(flyer, { forward: 1, right: 0, up: 0 }, { yaw: 0, pitch: Math.PI / 2 }, 0.5).at;
    expect(down.y).toBeCloseTo(0, 9);
    expect(down.x).toBeCloseTo(0, 9);
  });

  it("strafes right on the level and rises and sinks straight, passing through anything", () => {
    const right = stepFlyer(flyer, { forward: 0, right: 1, up: 0 }, level, 1).at;
    // Looking east, the right is south: +z.
    expect(right.z).toBeCloseTo(FLY_SPEED, 9);
    expect(stepFlyer(flyer, { forward: 0, right: 0, up: -1 }, level, 1).at.y).toBeCloseTo(10 - FLY_SPEED, 9);
  });
});

describe("geared", () => {
  it("goes faster or slower by a gear a wheel step, within its limits", () => {
    expect(geared(flyer, 1).speed).toBeCloseTo(FLY_SPEED * GEAR, 9);
    expect(geared(flyer, -2).speed).toBeCloseTo(FLY_SPEED / GEAR ** 2, 9);
    expect(geared(flyer, 100).speed).toBe(FASTEST_FLIGHT);
    expect(geared(flyer, -100).speed).toBe(SLOWEST_FLIGHT);
  });
});

describe("flyingCamera", () => {
  it("looks from where it is along its look", () => {
    const { eye, target } = flyingCamera(flyer, { yaw: Math.PI / 2, pitch: 0 });
    expect(eye).toBe(flyer.at);
    expect(target.z).toBeCloseTo(-1, 9);
    expect(lookAlong(level)).toEqual({ x: 1, y: -0, z: -0 });
  });
});
