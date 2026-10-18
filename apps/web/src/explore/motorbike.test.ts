import { describe, expect, it } from "vitest";
import {
  MOTORBIKE,
  MOTO_ENGINE,
  MOTO_GEARBOX,
  PADDLE_BACK,
  THROTTLE_RATE,
  motoHud,
  parkedMoto,
  rideMotorbike,
  thrownMoto,
  type Moto,
} from "./motorbike";
import { DOWN, leanAsked } from "./singletrack";
import { NO_INTENTS, type Intents } from "./walker";

const DT = 1 / 120;
const rolling = (gear = 2): Moto => ({ ...parkedMoto(), footDown: false, gear });

/** Rides `seconds` under intents from a state and speed, every step kept. */
function ride(start: Moto, speed: number, intents: Intents, seconds: number, held = false) {
  const path: { moto: Moto; speed: number; turn: number }[] = [];
  let moto = start;
  let v = speed;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const step = rideMotorbike(moto, v, intents, DT);
    moto = step.moto;
    v = held ? speed : step.speed;
    path.push({ ...step, speed: v });
  }
  return path;
}
const last = <T>(path: readonly T[]) => path.at(-1)!;
const THROTTLE: Intents = { ...NO_INTENTS, forward: 1 };

describe("the motorbike's engine and gearbox", () => {
  it("pulls away in first, lifting its front wheel, held short of going over, until the red line lets it down", () => {
    const path = ride(parkedMoto(), 0, THROTTLE, 4);
    const highest = Math.min(...path.map((s) => s.moto.pitch));
    expect(highest).toBeLessThan(-0.3);
    expect(highest).toBeGreaterThanOrEqual(-MOTORBIKE.wheelieMost);
    // First is held while the front is up; it comes down at the limiter, then shifts.
    const up = path.filter((s) => s.moto.pitch < 0);
    expect(up.every((s) => s.moto.gear === 0)).toBe(true);
    expect(last(path).moto.pitch).toBe(0);
    expect(last(path).moto.gear).toBeGreaterThan(0);
    expect(path.every((s) => s.moto.fall === null)).toBe(true);
  });

  it("reaches 100 km/h in under five seconds and changes up through its gears", () => {
    const path = ride(parkedMoto(), 0, THROTTLE, 8);
    const at = path.findIndex((s) => s.speed >= 100 / 3.6);
    expect(at * DT).toBeLessThan(5);
    expect(at * DT).toBeGreaterThan(2.5);
    const gears = [...new Set(path.map((s) => s.moto.gear))];
    expect(gears).toEqual([0, 1, 2, 3, 4]);
  });

  it("tops out at its red line in top gear", () => {
    const end = last(ride(rolling(4), 40, THROTTLE, 30));
    expect(end.moto.gear).toBe(MOTO_GEARBOX.ratios.length - 1);
    expect(end.moto.rpm).toBeLessThanOrEqual(MOTO_ENGINE.redline + 10);
    expect(end.speed * 3.6).toBeGreaterThan(140);
    expect(end.speed * 3.6).toBeLessThan(175);
  });

  it("opens and closes its throttle at a twist's rate", () => {
    const [first] = ride(rolling(), 10, THROTTLE, DT);
    expect(first!.moto.throttle).toBeCloseTo(THROTTLE_RATE * DT, 9);
  });

  it("changes down as it slows off the throttle", () => {
    const end = last(ride(rolling(4), 30, NO_INTENTS, 20));
    expect(end.moto.gear).toBeLessThan(4);
  });
});

/** Braking from 20 m/s, upright, until it stops; and when it stopped. */
const stopping = (intents: Intents) => ride(rolling(3), 20, intents, 6);
const stoppedAt = (path: ReturnType<typeof stopping>) => path.findIndex((s) => s.speed === 0);

describe("the motorbike's brakes", () => {
  it("stops harder on the front brake than the back, its back wheel kept down by its length", () => {
    const front = stopping({ ...NO_INTENTS, jump: true });
    const back = stopping({ ...NO_INTENTS, forward: -1 });
    expect(stoppedAt(front)).toBeGreaterThan(0);
    expect(stoppedAt(front)).toBeLessThan(stoppedAt(back));
    expect(front.every((s) => s.moto.pitch === 0)).toBe(true);
    expect(front.every((s) => s.moto.fall === null)).toBe(true);
  });

  it("never reverses on its brakes, and once stopped the rider paddles it back", () => {
    const path = ride(rolling(0), 3, { ...NO_INTENTS, forward: -1 }, 6);
    const stop = path.findIndex((s) => s.speed === 0);
    expect(stop).toBeGreaterThan(0);
    expect(last(path).speed).toBeCloseTo(-PADDLE_BACK, 6);
    // Space held with S stops the paddling.
    const held = ride(last(path).moto, last(path).speed, { ...NO_INTENTS, forward: -1, jump: true }, 2);
    expect(last(held).speed).toBe(0);
  });

  it("carries all its weight on the front with the back wheel up, so the back brake holds nothing", () => {
    const tipped: Moto = { ...rolling(3), pitch: 0.1 };
    const [step] = ride(tipped, 10, { ...NO_INTENTS, forward: -1 }, 1 / 120);
    // Only the air and the road slow it, not the back brake.
    expect(10 - step!.speed).toBeLessThan(0.01);
  });

  it("slides from under its rider braking hard leaned over", () => {
    const leaned: Moto = { ...rolling(2), lean: -0.6, aim: -0.6 };
    const path = ride(leaned, 15, { ...NO_INTENTS, forward: -1, jump: true, right: 1 }, 1);
    expect(path.some((s) => s.moto.fall?.cause === "grip")).toBe(true);
  });
});

describe("the motorbike's balance", () => {
  it("leans into a turn asked for, at every speed, turning that way", () => {
    for (const speed of [6, 10, 20, 40]) {
      const path = ride(rolling(), speed, { ...NO_INTENTS, right: 1 }, 5, true);
      const end = last(path);
      expect(end.moto.fall).toBeNull();
      expect(end.moto.lean).toBeCloseTo(leanAsked(MOTORBIKE, 1, speed), 1);
      expect(end.turn).toBeLessThan(0);
    }
  });

  it("rides on straight upright with nothing asked", () => {
    const end = last(ride(rolling(), 15, NO_INTENTS, 10, true));
    expect(Math.abs(end.moto.lean)).toBeLessThan(1e-6);
    expect(end.moto.fall).toBeNull();
  });

  it("puts a foot down at a stop and lifts it moving off", () => {
    const stopped = ride(rolling(1), 2, { ...NO_INTENTS, forward: -1 }, 3);
    expect(last(stopped).moto.footDown).toBe(true);
    const away = ride(last(stopped).moto, 0, THROTTLE, 2);
    expect(last(away).moto.footDown).toBe(false);
  });

  it("falls when leaned past saving, and the rider gets back up after a moment, in first", () => {
    const over: Moto = { ...rolling(3), lean: 1.2, aim: 1.2 };
    const path = ride(over, 8, NO_INTENTS, DOWN + 0.1);
    expect(path[0]!.moto.fall?.cause).toBe("lean");
    expect(path[0]!.turn).toBe(0);
    const up = last(path);
    expect(up.moto.fall).toBeNull();
    expect(up.moto.footDown).toBe(true);
    expect(up.moto.gear).toBe(0);
    expect(up.speed).toBe(0);
  });

  it("is thrown with its throttle shut", () => {
    const thrown = thrownMoto({ ...rolling(), throttle: 1 }, "hit", 9);
    expect(thrown.throttle).toBe(0);
    expect(thrown.fall).toEqual({ time: 0, side: 1, cause: "hit", speed: 9 });
  });
});

describe("the motorbike's HUD", () => {
  it("says the speed in km/h, the gear from one of five, and the engine's speed to the hundred", () => {
    expect(motoHud({ ...rolling(2), rpm: 3456 }, 10)).toEqual({ speed: 36, gear: "3", gears: 5, rpm: 3500 });
    expect(motoHud(parkedMoto(), -0.5).speed).toBe(2);
  });
});
