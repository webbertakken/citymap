import { describe, expect, it } from "vitest";
import { RUN_SPEED, WALK_SPEED } from "../walker";
import { gaitAt } from "./gait";
import { FASTEST, SLOWEST, SPRINT_CLIP_CADENCE, STANDING, WALK_CLIP_SPEED, motionOf, paceOf } from "./motion";

describe("motionOf", () => {
  it("stands, walks and sprints on the ground by pace", () => {
    expect(motionOf(0, true, 0)).toBe("idle");
    expect(motionOf(STANDING / 2, true, 0)).toBe("idle");
    expect(motionOf(WALK_SPEED, true, 0)).toBe("walk");
    expect(motionOf(RUN_SPEED, true, 0)).toBe("sprint");
  });

  it("jumps while rising and falls otherwise, off the ground", () => {
    expect(motionOf(WALK_SPEED, false, 2)).toBe("jump");
    expect(motionOf(0, false, -1)).toBe("fall");
    expect(motionOf(0, false, 0)).toBe("fall");
  });
});

describe("paceOf", () => {
  it("plays a walk as fast as the ground goes by, within its limits", () => {
    expect(paceOf("walk", WALK_CLIP_SPEED)).toBe(1);
    expect(paceOf("walk", 0)).toBe(SLOWEST);
    expect(paceOf("walk", 100)).toBe(FASTEST);
  });

  it("plays a run at the gait's own steps a second, whose legs the gait sets: not as fast as the ground goes by", () => {
    expect(paceOf("sprint", RUN_SPEED)).toBeCloseTo(gaitAt(RUN_SPEED).cadence / SPRINT_CLIP_CADENCE, 9);
    expect(paceOf("sprint", RUN_SPEED)).toBeLessThan(1);
  });

  it("plays standing, jumping and falling at their own speed", () => {
    for (const motion of ["idle", "jump", "fall", "drive"] as const) expect(paceOf(motion, 3)).toBe(1);
  });
});
