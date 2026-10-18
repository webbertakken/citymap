import { AnimationClip, Group, NumberKeyframeTrack } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Animator } from "./animator";
import { BLEND } from "./motion";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A figure whose clips each turn it about y: walk from 0 to 1 over a second, idle held at 5. */
function figure() {
  const model = new Group();
  model.name = "figure";
  const clips = [
    new AnimationClip("walk", 1, [new NumberKeyframeTrack("figure.rotation[y]", [0, 1], [0, 1])]),
    new AnimationClip("idle", 1, [new NumberKeyframeTrack("figure.rotation[y]", [0, 1], [5, 5])]),
  ];
  const names = { idle: "idle", walk: "walk", sprint: "sprint", jump: "jump", fall: "fall", drive: "drive" } as const;
  return { model, animator: new Animator(model, clips, names) };
}

describe("Animator", () => {
  it("plays each motion by the library's clip for it, unless told otherwise", () => {
    const model = new Group();
    model.name = "figure";
    const walk = new AnimationClip("Walk_Loop", 1, [new NumberKeyframeTrack("figure.rotation[y]", [0, 1], [0, 1])]);
    const animator = new Animator(model, [walk]);
    animator.play("walk", 1, 0.5);
    expect(model.rotation.y).toBeCloseTo(0.5, 6);
  });

  it("plays a motion at the pace asked for", () => {
    const { model, animator } = figure();
    expect(animator.playing).toBeNull();
    animator.play("walk", 0.5, 0);
    animator.play("walk", 0.5, 0.5);
    expect(animator.playing).toBe("walk");
    // Half a second at half speed: a quarter of the way through.
    expect(model.rotation.y).toBeCloseTo(0.25, 6);
  });

  it("blends into a new motion, and has it alone once the blend is done", () => {
    const { model, animator } = figure();
    animator.play("walk", 1, 0.5);
    animator.play("idle", 1, BLEND / 2);
    expect(animator.playing).toBe("idle");
    expect(model.rotation.y).toBeGreaterThan(0.5);
    expect(model.rotation.y).toBeLessThan(5);
    animator.play("idle", 1, BLEND);
    expect(model.rotation.y).toBeCloseTo(5, 6);
  });

  it("keeps what it was doing for a motion it has no clip for, and says so once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { animator } = figure();
    animator.play("walk", 1, 0.1);
    animator.play("jump", 1, 0.1);
    animator.play("jump", 1, 0.1);
    expect(animator.playing).toBe("walk");
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).toBe("explore/clip-missing motion=jump");
  });

  it("does nothing before a clip it has", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { model, animator } = figure();
    animator.play("fall", 1, 0.1);
    expect(animator.playing).toBeNull();
    expect(model.rotation.y).toBe(0);
  });
});
