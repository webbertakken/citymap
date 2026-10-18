import { describe, expect, it } from "vitest";
import { RUN_SPEED, WALK_SPEED } from "../walker";
import { LEAP } from "./bound";
import { FASTEST, SLOWEST, SPRINT_CLIP_SECONDS, STANDING, WALK_CLIP_SPEED, motionOf, paceOf } from "./motion";

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
    expect(paceOf("sprint", 100)).toBe(FASTEST);
  });

  it("strides once every two leaps when bounding", () => {
    // Two leaps' time at a run, played over one stride of the clip.
    const twoLeaps = (2 * LEAP) / RUN_SPEED;
    expect(paceOf("sprint", RUN_SPEED)).toBeCloseTo(SPRINT_CLIP_SECONDS / twoLeaps, 9);
  });

  it("plays standing, jumping and falling at their own speed", () => {
    for (const motion of ["idle", "jump", "fall", "drive"] as const) expect(paceOf(motion, 3)).toBe(1);
  });
});
