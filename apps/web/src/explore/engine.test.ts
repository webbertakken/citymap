import { describe, expect, it } from "vitest";
import { automatic, driveOf, rpmOf, torqueAt, type Engine, type Gearbox } from "./engine";

const ENGINE: Engine = {
  idle: 1000,
  redline: 6000,
  curve: [
    [1000, 100],
    [3000, 200],
    [6000, 150],
  ],
  braking: 30,
  launch: 2000,
};
const BOX: Gearbox = { ratios: [12, 8, 5], reverse: 13, up: 5500, down: 2000 };

describe("the engine", () => {
  it("pulls along its torque curve, its first point below it and none past the red line", () => {
    expect(torqueAt(ENGINE, 500)).toBe(100);
    expect(torqueAt(ENGINE, 1000)).toBe(100);
    expect(torqueAt(ENGINE, 2000)).toBe(150);
    expect(torqueAt(ENGINE, 4500)).toBe(175);
    expect(torqueAt(ENGINE, 6000)).toBe(150);
    expect(torqueAt(ENGINE, 6001)).toBe(0);
    expect(torqueAt({ ...ENGINE, redline: 9000 }, 7000)).toBe(150);
  });

  it("turns with the wheel through the ratio, either way", () => {
    expect(rpmOf(10, 0.5, 3)).toBeCloseTo(((10 / 0.5) * 3 * 60) / (2 * Math.PI), 9);
    expect(rpmOf(-10, 0.5, 3)).toBe(rpmOf(10, 0.5, 3));
  });

  it("slips its clutch pulling away, so a standstill still pulls", () => {
    const away = driveOf(ENGINE, 12, 0.3, 0, 1);
    expect(away.rpm).toBe(2000);
    expect(away.force).toBeCloseTo((150 * 12) / 0.3, 9);
    // Half throttle slips at half way between idle and the launch speed.
    expect(driveOf(ENGINE, 12, 0.3, 0, 0.5).rpm).toBe(1500);
  });

  it("drives through the ratio once the wheel turns the engine faster than its slip", () => {
    const speed = 20;
    const drive = driveOf(ENGINE, 5, 0.3, speed, 1);
    expect(drive.rpm).toBeGreaterThan(ENGINE.launch);
    expect(drive.rpm).toBeCloseTo(rpmOf(speed, 0.3, 5), 9);
    expect(drive.force).toBeCloseTo((torqueAt(ENGINE, drive.rpm) * 5) / 0.3, 9);
  });

  it("cuts out past the red line", () => {
    expect(driveOf(ENGINE, 12, 0.3, 20, 1).force).toBe(0);
  });

  it("drags off the throttle above idle, and idles at a standstill", () => {
    expect(driveOf(ENGINE, 8, 0.3, 10, 0).force).toBeCloseTo((-30 * 8) / 0.3, 9);
    expect(driveOf(ENGINE, 8, 0.3, 0, 0)).toEqual({ rpm: 1000, force: 0 });
  });
});

describe("the automatic gearbox", () => {
  it("changes up near the red line and down when the engine would labour", () => {
    expect(automatic(BOX, 0, 5600)).toBe(1);
    expect(automatic(BOX, 1, 1900)).toBe(0);
    expect(automatic(BOX, 1, 3000)).toBe(1);
  });

  it("never goes past its first or top gear", () => {
    expect(automatic(BOX, 2, 9000)).toBe(2);
    expect(automatic(BOX, 0, 500)).toBe(0);
  });
});
