import { describe, expect, it } from "vitest";
import { BENCHMARK, BICYCLE } from "./bicycle";
import { CHOPPER, MOTORBIKE } from "./motorbike";
import { loadsOn, massOf, matricesOf, pitchedOn, upright, type Single } from "./singletrack";
import { GRAVITY } from "./walker";

/** Meijaard et al. (2007), table 2: the benchmark bicycle's matrices, as published. */
const PUBLISHED = {
  M: [
    [80.81722, 2.31941332208709],
    [2.31941332208709, 0.29784188199686],
  ],
  C1: [
    [0, 33.86641391492494],
    [-0.85035641456978, 1.6854039739756],
  ],
  K0: [
    [-80.95, -2.59951685249872],
    [-2.59951685249872, -0.80329488458618],
  ],
  K2: [
    [0, 76.59734589573222],
    [0, 2.65431523794604],
  ],
};

describe("the Whipple matrices from a build", () => {
  it("are the benchmark's own, from the benchmark's parameters", () => {
    const worked = matricesOf(BENCHMARK, GRAVITY);
    for (const name of ["M", "C1", "K0", "K2"] as const)
      worked[name].flat().forEach((value, i) => expect(value).toBeCloseTo(PUBLISHED[name].flat()[i]!, 10));
  });

  it("put the benchmark's middle where the paper does", () => {
    const middle = massOf(BENCHMARK);
    expect(middle.mass).toBe(94);
    expect(middle.x).toBeCloseTo(0.3421, 4);
    expect(middle.z).toBeCloseTo(-0.8612, 4);
  });

  it("make a machine with its build's middle, up from the ground", () => {
    const middle = massOf(CHOPPER);
    expect(MOTORBIKE.mass).toBe(middle.mass);
    expect(MOTORBIKE.massAhead).toBe(middle.x);
    expect(MOTORBIKE.massHeight).toBe(-middle.z);
    expect(MOTORBIKE.wheelbase).toBe(CHOPPER.wheelbase);
  });
});

describe("the weight between the wheels", () => {
  it("moves back pulling away until the front carries none", () => {
    const still = loadsOn(MOTORBIKE, 0);
    const pulling = loadsOn(MOTORBIKE, 5);
    expect(pulling.back).toBeGreaterThan(still.back);
    expect(loadsOn(MOTORBIKE, 30)).toEqual({ front: 0, back: MOTORBIKE.mass * GRAVITY });
  });
});

/** One step of the motorbike's wheel lifting, or not, under an acceleration. */
const lifted = (state: Single, accel: number): Single =>
  Object.assign({}, state, pitchedOn(MOTORBIKE, state, accel, 1 / 120));

describe("a wheel lifted", () => {
  const level = upright();

  it("lifts the front under enough pull, and holds it at the rider's limit", () => {
    let state = level;
    for (let i = 0; i < 600; i++) state = lifted(state, 15);
    expect(state.pitch).toBe(-MOTORBIKE.wheelieMost);
    expect(state.pitchRate).toBeLessThanOrEqual(0);
  });

  it("comes back down with the pull gone, to a pitch of exactly 0", () => {
    let state = { ...level, pitch: -0.3 };
    for (let i = 0; i < 600; i++) state = lifted(state, 0);
    expect(Object.is(state.pitch, 0)).toBe(true);
    expect(Object.is(state.pitchRate, 0)).toBe(true);
  });

  it("never lifts a bicycle's front wheel, whose rider is not built for it", () => {
    expect(pitchedOn(BICYCLE, level, 20, 1 / 120)).toEqual({ pitch: 0, pitchRate: 0 });
  });
});
