import { describe, expect, it } from "vitest";
import { RUN_SPEED } from "../walker";
import {
  ARM_BACK,
  ARM_SWING,
  BOUNCE,
  HEEL_RISE,
  RUN_BLEND,
  armAt,
  NOT_RUNNING,
  blendTowards,
  bounceAt,
  footAt,
  gaitAt,
  phaseAfter,
  runAfter,
  type Side,
} from "./gait";

const run = gaitAt(RUN_SPEED);

describe("gaitAt", () => {
  it("runs at 4.5 m/s as runners do: about 175 steps a minute of about 1.55 m, a sixth of a second on the ground", () => {
    // Weyand et al. 2000 and Cavanagh & Kram 1989: about 2.8 to 3 steps a second, contact under 0.2 s, at 4 to 5 m/s.
    expect(run.cadence * 60).toBeGreaterThan(168);
    expect(run.cadence * 60).toBeLessThan(180);
    expect(run.step).toBeCloseTo(RUN_SPEED / run.cadence, 9);
    expect(run.contact).toBeGreaterThan(0.15);
    expect(run.contact).toBeLessThan(0.2);
    // Both feet off the ground between steps: a flight of about 0.18 s.
    expect(run.flight).toBeGreaterThan(0.15);
    expect(run.flight).toBeCloseTo(1 / run.cadence - run.contact, 9);
  });

  it("steps quicker and longer the faster it runs, and lands without a flight at a slow jog", () => {
    const fast = gaitAt(6);
    expect(fast.cadence).toBeGreaterThan(run.cadence);
    expect(fast.step).toBeGreaterThan(run.step);
    const jog = gaitAt(1.5);
    expect(jog.flight).toBe(0);
    expect(jog.contact).toBeCloseTo(1 / jog.cadence, 9);
  });

  it("lifts the heel higher the faster it runs, up to half a metre", () => {
    expect(run.swing).toBeCloseTo(0.45, 9);
    expect(gaitAt(9).swing).toBe(0.5);
  });
});

/** Where a foot is over a stride, sampled finely. */
const sampled = (side: Side) =>
  Array.from({ length: 1000 }, (_, i) => ({ phase: i / 1000, ...footAt(run, i / 1000, side) }));

describe("footAt", () => {
  it("plants each foot on the ground as the body runs over it, going back at its speed, the heel rising to push off", () => {
    const stride = 2 / run.cadence;
    const planted = sampled("left").filter((s) => s.planted);
    expect(planted.length / 1000).toBeCloseTo(run.contact / stride, 2);
    for (const [a, b] of planted.slice(1).map((s, i) => [planted[i]!, s] as const)) {
      expect(b.up).toBeLessThanOrEqual(HEEL_RISE);
      expect((a.ahead - b.ahead) / ((b.phase - a.phase) * stride)).toBeCloseTo(RUN_SPEED, 6);
    }
    // Flat on the ground the first half; the heel up by HEEL_RISE as the toes leave.
    expect(planted.filter((s) => s.phase < planted.at(-1)!.phase / 2).every((s) => s.up === 0)).toBe(true);
    expect(planted.at(-1)!.up).toBeCloseTo(HEEL_RISE, 2);
    // Landing a little ahead of the hips, leaving well behind them.
    expect(planted[0]!.ahead).toBeGreaterThan(0.2);
    expect(planted.at(-1)!.ahead).toBeLessThan(-0.4);
  });

  it("swings it forward through the air, the heel up behind first, then reaching to land where it planted", () => {
    const swing = sampled("left").filter((s) => !s.planted);
    const highest = swing.reduce((top, s) => (s.up > top.up ? s : top));
    expect(highest.up).toBeCloseTo(run.swing, 2);
    // The heel is highest early in the swing, still behind the hips.
    expect(highest.ahead).toBeLessThan(0);
    expect(swing.at(-1)!.up).toBeLessThan(0.01);
    expect(swing.at(-1)!.ahead).toBeCloseTo(footAt(run, 0, "left").ahead, 2);
  });

  it("keeps the right foot half a stride from the left: flight between the steps, never both down", () => {
    const left = sampled("left");
    const right = sampled("right");
    expect(right[500]!.ahead).toBeCloseTo(left[0]!.ahead, 9);
    const both = left.filter((s, i) => s.planted && right[i]!.planted);
    const neither = left.filter((s, i) => !s.planted && !right[i]!.planted);
    expect(both).toHaveLength(0);
    expect(neither.length / 1000).toBeCloseTo((2 * run.flight) / (2 / run.cadence), 2);
  });
});

describe("bounceAt", () => {
  it("lowers the hips mid-stance and raises them mid-flight, by BOUNCE each way", () => {
    const share = (run.contact * run.cadence) / 2;
    expect(bounceAt(run, share / 2)).toBeCloseTo(-BOUNCE, 9);
    expect(bounceAt(run, share / 2 + 0.25)).toBeCloseTo(BOUNCE, 9);
    expect(bounceAt(run, share / 2 + 0.5)).toBeCloseTo(-BOUNCE, 9);
  });
});

describe("armAt", () => {
  it("swings each arm against its leg, about a little behind hanging: back as its foot lands, forward a step on", () => {
    expect(armAt(0, "left")).toBeCloseTo(-ARM_BACK - ARM_SWING, 9);
    expect(armAt(0.5, "left")).toBeCloseTo(ARM_SWING - ARM_BACK, 9);
    expect(armAt(0, "right")).toBeCloseTo(ARM_SWING - ARM_BACK, 9);
  });
});

describe("phaseAfter", () => {
  it("moves on by the ground covered over a stride's length, round and round", () => {
    expect(phaseAfter(0.2, run.step, run)).toBeCloseTo(0.7, 9);
    expect(phaseAfter(0.9, run.step, run)).toBeCloseTo(0.4, 9);
    expect(phaseAfter(0.3, 0, run)).toBe(0.3);
  });
});

describe("blendTowards", () => {
  it("eases into a run over RUN_BLEND and out of it as fast", () => {
    expect(blendTowards(0, true, RUN_BLEND / 2)).toBeCloseTo(0.5, 9);
    expect(blendTowards(0.5, true, RUN_BLEND)).toBe(1);
    expect(blendTowards(1, false, RUN_BLEND / 4)).toBeCloseTo(0.75, 9);
    expect(blendTowards(0.1, false, RUN_BLEND)).toBe(0);
  });
});

describe("runAfter", () => {
  it("eases into a run and strides on by the ground covered", () => {
    const after = runAfter({ ...NOT_RUNNING, walked: 10 }, "run", RUN_SPEED, 10 + run.step, RUN_BLEND / 2);
    expect(after).toEqual({ phase: expect.closeTo(0.5, 9), weight: 0.5, walked: 10 + run.step });
  });

  it("eases out walking, lets go at once in the air, and never strides backwards or on nothing", () => {
    expect(runAfter({ phase: 0.2, weight: 1, walked: 0 }, "ground", 1.6, 0, RUN_BLEND / 2).weight).toBeCloseTo(0.5, 9);
    expect(runAfter({ phase: 0.2, weight: 1, walked: 0 }, "air", RUN_SPEED, 0, 0.01).weight).toBe(0);
    expect(runAfter({ phase: 0.2, weight: 1, walked: 5 }, "run", 0, 3, 0.01).phase).toBe(0.2);
  });
});
