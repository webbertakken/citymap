import { describe, expect, it } from "vitest";
import {
  CADENCE_MOST,
  DOWN,
  FALL_LEAN,
  FOOT_DOWN,
  FOOT_LEAN,
  FOOT_UP,
  GEARS,
  GRIP,
  LYING,
  MASS,
  MAX_LEAN,
  START_GEAR,
  STEER_STOP,
  STOPPIE_MOST,
  WALK_BACK,
  WHEEL_RADIUS,
  aimedLean,
  balanced,
  hudOf,
  loadsOf,
  resting,
  rideCycle,
  shift,
  thrown,
  turnOf,
  whipple,
  type Cycle,
  type Lean,
} from "./bicycle";
import { GRAVITY, NO_INTENTS, type Intents } from "./walker";

const DT = 1 / 120;
const upright: Lean = { lean: 0, leanRate: 0, steer: 0, steerRate: 0 };
/** A bicycle rolling along, its foot up, at no lean. */
const rolling = (gear = START_GEAR): Cycle => ({ ...resting(gear), footDown: false });

/** Steps the bare bicycle, no rider, `seconds` long, with a lean torque (the body) and a steering torque. */
function handsFree(start: Lean, speed: number, seconds: number, leanTorque = 0): Lean[] {
  const path: Lean[] = [];
  let q = start;
  for (let t = 0; t < seconds; t += DT) {
    q = whipple(q, speed, leanTorque, 0, DT);
    path.push(q);
  }
  return path;
}

/** Steps the ridden bicycle at a held speed, steering as asked: the balance alone. */
function balancing(speed: number, right: number, seconds: number, start = rolling()): Cycle[] {
  const path: Cycle[] = [];
  let cycle = start;
  for (let t = 0; t < seconds; t += DT) {
    cycle = balanced(cycle, speed, right, DT);
    path.push(cycle);
  }
  return path;
}

/** Rides the bicycle under intents for `seconds`; every step's cycle, speed and turn. */
function riding(cycle: Cycle, speed: number, intents: Intents, seconds: number) {
  const path: { cycle: Cycle; speed: number; turn: number }[] = [];
  let now = { cycle, speed, turn: 0 };
  for (let t = 0; t < seconds; t += DT) {
    now = rideCycle(now.cycle, now.speed, intents, DT);
    path.push(now);
  }
  return path;
}
const last = <T>(path: readonly T[]) => path[path.length - 1]!;

describe("whipple", () => {
  it("rides on straight with no hands within its self-stable speeds, its lean dying away", () => {
    for (const speed of [4.5, 5]) {
      const path = handsFree({ ...upright, lean: 0.05 }, speed, 10);
      expect(Math.abs(last(path).lean)).toBeLessThan(0.01);
    }
    // Near its capsize speed (6 m/s), it rights itself only slowly.
    expect(Math.abs(last(handsFree({ ...upright, lean: 0.05 }, 5.5, 10)).lean)).toBeLessThan(0.025);
  });

  it("falls over with no hands below them", () => {
    for (const speed of [0, 1, 2, 3.5]) {
      const path = handsFree({ ...upright, lean: 0.05 }, speed, 6);
      expect(path.some((q) => Math.abs(q.lean) > FALL_LEAN)).toBe(true);
    }
  });

  it("steers into a lean by itself, so leaning the body turns it that way", () => {
    // The rider leans their body left (a lean torque), hands off the bars.
    const path = handsFree(upright, 5, 3, 3);
    expect(last(path).lean).toBeGreaterThan(0);
    expect(last(path).steer).toBeGreaterThan(0);
    expect(turnOf(last(path), 5)).toBeGreaterThan(0);
    const right = handsFree(upright, 5, 3, -3);
    expect(turnOf(last(right), 5)).toBeLessThan(0);
  });

  it("stops the bars at their stop", () => {
    const q = whipple({ ...upright, steer: STEER_STOP - 0.001, steerRate: 5 }, 3, 0, 0, DT);
    expect(q.steer).toBe(STEER_STOP);
    expect(q.steerRate).toBe(0);
    expect(whipple({ ...upright, steer: -STEER_STOP, steerRate: -5 }, 3, 0, 0, DT).steer).toBe(-STEER_STOP);
  });
});

describe("turnOf", () => {
  it("turns with the steer and the speed, and not at all standing", () => {
    expect(turnOf({ ...upright, steer: 0.1 }, 5)).toBeGreaterThan(0);
    expect(turnOf({ ...upright, steer: -0.1 }, 5)).toBeLessThan(0);
    expect(turnOf({ ...upright, steer: 0.1 }, 0)).toBe(0);
  });
});

describe("aimedLean", () => {
  it("leans right for a right turn and left for a left, more the faster, never past its limit", () => {
    expect(aimedLean(1, 3)).toBeLessThan(0);
    expect(aimedLean(-1, 3)).toBeCloseTo(-aimedLean(1, 3), 12);
    expect(Math.abs(aimedLean(1, 4))).toBeGreaterThan(Math.abs(aimedLean(1, 3)));
    expect(aimedLean(1, 20)).toBe(-MAX_LEAN);
    expect(aimedLean(0, 8)).toBeCloseTo(0, 12);
    expect(aimedLean(1, 0)).toBeCloseTo(0, 12);
  });

  it("stays short of what the tyres can hold", () => {
    expect(Math.tan(MAX_LEAN)).toBeLessThan(GRIP);
  });
});

/** How the bars swing riding straight at a held speed, after the first two seconds: how far, how often across, and
 * whether it stays up. */
function swing(speed: number) {
  const path = balancing(speed, 0, 4).slice(240);
  const flips = path.filter((c, i) => i > 0 && Math.sign(c.steer) !== Math.sign(path[i - 1]!.steer)).length;
  return {
    size: Math.max(...path.map((c) => Math.abs(c.steer))),
    flips,
    upright: path.every((c) => Math.abs(c.lean) < 0.1),
  };
}

describe("balanced", () => {
  it("holds the lean it aims at, from a walking pace to a sprint", () => {
    for (const speed of [1.5, 3, 5, 8, 12]) {
      const path = balancing(speed, 1, 4);
      const aim = aimedLean(1, speed);
      expect(Math.abs(last(path).lean - aim)).toBeLessThan(0.03);
      // Never far past it on the way.
      expect(Math.min(...path.map((c) => c.lean))).toBeGreaterThan(aim - 0.08);
    }
  });

  it("countersteers: asked to turn right, it first steers left, then leans and turns right", () => {
    const path = balancing(7, 1, 2);
    const first = path.find((c) => Math.abs(c.steer) > 0.005)!;
    expect(first.steer).toBeGreaterThan(0);
    expect(last(path).lean).toBeLessThan(-0.3);
    expect(last(path).steer).toBeLessThan(0);
    expect(turnOf(last(path), 7)).toBeLessThan(0);
  });

  it("wobbles its bars at walking pace, but stays up, and rides steadily above a run", () => {
    const slow = swing(1.2);
    expect(slow.size).toBeGreaterThan(0.05);
    expect(slow.flips).toBeGreaterThanOrEqual(3);
    expect(slow.upright).toBe(true);
    expect(swing(5).size).toBeLessThan(0.01);
  });

  it("rests on a foot, leaned onto it, the bars turned as asked", () => {
    const path = balancing(0, 1, 3, { ...resting(), lean: 0, footDown: true });
    expect(last(path).lean).toBeCloseTo(FOOT_LEAN, 9);
    expect(last(path).steer).toBeLessThan(0);
    expect(last(path).aim).toBe(last(path).lean);
  });
});

describe("loadsOf", () => {
  it("shares the weight between the wheels, moving it forwards under braking until the back wheel lifts", () => {
    const still = loadsOf(0);
    expect(still.front + still.back).toBeCloseTo(MASS * GRAVITY, 9);
    expect(still.back).toBeGreaterThan(still.front);
    const braking = loadsOf(-5);
    expect(braking.front).toBeGreaterThan(still.front);
    expect(braking.back).toBeLessThan(still.back);
    expect(loadsOf(-8).back).toBe(0);
    expect(loadsOf(-8).front).toBe(MASS * GRAVITY);
    expect(loadsOf(20).front).toBe(0);
  });
});

/** Speed lost in a second's coasting (as one long step). */
const loss = (speed: number) => speed - rideCycle(rolling(), speed, NO_INTENTS, 1).speed;

describe("the drivetrain", () => {
  it("turns the crank in step with the back wheel through the gear while pedalling", () => {
    const path = riding(rolling(), 4, { ...NO_INTENTS, forward: 1 }, 0.5);
    // The step's crank speed is its starting speed's.
    const { cycle } = last(path);
    const { speed } = path[path.length - 2]!;
    expect(cycle.cadence).toBeCloseTo(speed / (GEARS[START_GEAR] * WHEEL_RADIUS), 9);
    expect(cycle.crank).toBeGreaterThan(0);
    // A higher gear at the same speed turns the crank slower.
    const higher = rideCycle(rolling(START_GEAR + 1), 4, { ...NO_INTENTS, forward: 1 }, DT).cycle;
    const lower = rideCycle(rolling(START_GEAR), 4, { ...NO_INTENTS, forward: 1 }, DT).cycle;
    expect(higher.cadence).toBeLessThan(lower.cadence);
  });

  it("freewheels: let go, the crank stops and the bicycle rolls on", () => {
    const pedalled = last(riding(rolling(), 4, { ...NO_INTENTS, forward: 1 }, 0.5));
    const coasting = riding(pedalled.cycle, pedalled.speed, NO_INTENTS, 1);
    expect(last(coasting).cycle.cadence).toBe(0);
    expect(last(coasting).cycle.crank).toBe(coasting[0]!.cycle.crank);
    expect(last(coasting).speed).toBeGreaterThan(pedalled.speed - 0.5);
  });

  it("pushes hardest from a slow cadence, and not at all once spun out", () => {
    const from = (speed: number) => rideCycle(rolling(), speed, { ...NO_INTENTS, forward: 1 }, DT).speed - speed;
    const spunOut = CADENCE_MOST * GEARS[START_GEAR] * WHEEL_RADIUS;
    expect(from(0.5)).toBeGreaterThan(from(4));
    expect(from(spunOut + 0.5)).toBeCloseTo(
      rideCycle(rolling(), spunOut + 0.5, NO_INTENTS, DT).speed - spunOut - 0.5,
      12,
    );
    // Gently pedalled, gently driven.
    const gently = rideCycle(rolling(), 2, { ...NO_INTENTS, forward: 0.5 }, DT).speed;
    expect(gently).toBeGreaterThan(rideCycle(rolling(), 2, NO_INTENTS, DT).speed);
    expect(gently).toBeLessThan(rideCycle(rolling(), 2, { ...NO_INTENTS, forward: 1 }, DT).speed);
  });

  it("reaches a city rider's top speed in top gear, held there by the air", () => {
    const top = last(riding(rolling(GEARS.length - 1), 8, { ...NO_INTENTS, forward: 1 }, 60)).speed;
    expect(top).toBeGreaterThan(9);
    expect(top).toBeLessThan(13);
  });

  it("slows more the faster it coasts: the tyres and, more and more, the air", () => {
    expect(loss(10)).toBeCloseTo((0.006 * MASS * GRAVITY + 0.5 * 1.2 * 0.5 * 100) / MASS, 3);
    expect(loss(2)).toBeLessThan(loss(10) / 3);
  });
});

describe("shift", () => {
  it("moves through the gears and no further", () => {
    expect(shift(resting(), 1).gear).toBe(START_GEAR + 1);
    expect(shift(resting(), -1).gear).toBe(START_GEAR - 1);
    expect(shift(resting(), 99).gear).toBe(GEARS.length - 1);
    expect(shift(resting(), -99).gear).toBe(0);
  });
});

/** Six seconds from 8 m/s under intents. */
const stopping = (intents: Intents) => riding(rolling(), 8, intents, 6);

describe("the brakes", () => {
  it("stops on the back brake alone, skidding before anything lifts", () => {
    const path = stopping({ ...NO_INTENTS, forward: -1 });
    expect(path.some((s) => s.speed === 0)).toBe(true);
    expect(path.every((s) => s.cycle.pitch === 0)).toBe(true);
    // No harder than the back tyre's grip under the weight left on it.
    const decel = (8 - path[0]!.speed) / DT;
    // Its own drag and rolling resistance besides (0.27 m/s² at 8 m/s).
    expect(decel).toBeCloseTo((GRIP * loadsOf(-decel).back) / MASS + 0.27, 1);
  });

  it("stops hardest on the front brake, which lifts the back wheel, held short of going over the bars", () => {
    const front = stopping({ ...NO_INTENTS, jump: true });
    const back = stopping({ ...NO_INTENTS, forward: -1 });
    const stopped = (path: typeof front) => path.findIndex((s) => s.speed === 0);
    expect(stopped(front)).toBeLessThan(stopped(back));
    const highest = Math.max(...front.map((s) => s.cycle.pitch));
    expect(highest).toBeGreaterThan(0.1);
    expect(highest).toBeLessThanOrEqual(STOPPIE_MOST);
    // Stopped, it comes back down.
    expect(last(front).cycle.pitch).toBe(0);
    expect(front.every((s) => s.cycle.fall === null)).toBe(true);
  });

  it("never reverses on its brakes", () => {
    expect(rideCycle(rolling(), 0.01, { ...NO_INTENTS, jump: true }, DT).speed).toBe(0);
    expect(rideCycle({ ...rolling(), footDown: true }, -0.01, NO_INTENTS, DT).speed).toBe(0);
  });

  it("walks backwards on the back brake once stopped, no faster than a walk back", () => {
    const back = riding(resting(), 0, { ...NO_INTENTS, forward: -1 }, 2);
    expect(last(back).speed).toBeCloseTo(-WALK_BACK, 9);
    const settled = riding(last(back).cycle, last(back).speed, NO_INTENTS, 1);
    expect(last(settled).speed).toBe(0);
  });
});

describe("the rider's foot", () => {
  it("goes down coming to a stop and up once pedalled away", () => {
    const halting = riding(rolling(), 3, { ...NO_INTENTS, forward: -1 }, 3);
    const down = halting.find((s) => s.cycle.footDown)!;
    expect(down.speed).toBeLessThan(FOOT_DOWN);
    expect(last(halting).cycle.footDown).toBe(true);
    const away = riding(last(halting).cycle, 0, { ...NO_INTENTS, forward: 1 }, 3);
    const up = away.find((s) => !s.cycle.footDown)!;
    expect(up.speed).toBeGreaterThan(FOOT_UP);
    // Pedalled away from a stop, it never falls.
    expect(away.every((s) => s.cycle.fall === null)).toBe(true);
  });

  it("stands at a stop on its foot for as long as it likes", () => {
    const standing = riding(resting(), 0, NO_INTENTS, 30);
    expect(last(standing).cycle.lean).toBeCloseTo(FOOT_LEAN, 9);
    expect(last(standing).cycle.fall).toBeNull();
  });
});

describe("falls", () => {
  it("throws the rider when braking hard leaned over asks more than the tyres hold", () => {
    const leaned = last(riding(rolling(), 8, { ...NO_INTENTS, forward: 0.4, right: 1 }, 2));
    expect(leaned.cycle.fall).toBeNull();
    const braked = riding(leaned.cycle, leaned.speed, { ...NO_INTENTS, right: 1, forward: -1, jump: true }, 1);
    const fell = braked.find((s) => s.cycle.fall !== null)!;
    expect(fell.cycle.fall).toMatchObject({ cause: "grip", side: -1 });
  });

  it("throws the rider leaned past what can be held", () => {
    const over = rideCycle({ ...rolling(), lean: FALL_LEAN + 0.01 }, 5, NO_INTENTS, DT);
    expect(over.cycle.fall).toMatchObject({ cause: "lean", side: 1 });
  });

  it("slides to a stop on its side, lies a moment, and is back up with its gear", () => {
    const fallen = thrown({ ...rolling(4), lean: -0.2 }, "hit", -6);
    expect(fallen.fall).toEqual({ time: 0, side: -1, cause: "hit", speed: 6 });
    expect(thrown(rolling(), "hit", 6).fall?.side).toBe(1);
    const path = riding(fallen, 6, { ...NO_INTENTS, forward: 1, right: 1 }, DOWN + 2 * DT);
    const lying = path[Math.round(1.5 / DT)]!;
    expect(lying.speed).toBe(0);
    expect(lying.cycle.lean).toBeCloseTo(-LYING, 9);
    expect(lying.turn).toBe(0);
    expect(path[Math.round(0.2 / DT)]!.cycle.lean).toBeLessThan(-0.2);
    // Rising: on its way back up near the end.
    expect(Math.abs(path[Math.round((DOWN - 0.2) / DT)]!.cycle.lean)).toBeLessThan(LYING);
    const up = path.find((s) => s.cycle.fall === null)!;
    expect(up.cycle).toEqual({ ...resting(4), crank: fallen.crank });
    expect(up.speed).toBe(0);
  });
});

describe("hudOf", () => {
  it("shows the speed in km/h, the gear from one and the cadence in turns a minute", () => {
    expect(hudOf({ ...rolling(), cadence: (72 * 2 * Math.PI) / 60 }, 5)).toEqual({
      speed: 18,
      gear: START_GEAR + 1,
      gears: GEARS.length,
      cadence: 72,
    });
    expect(hudOf(resting(), -0.8).speed).toBe(3);
  });
});
