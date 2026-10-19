import { PropertyBinding, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { readPublicModel } from "../../testing/models";
import { METRE } from "../street";
import { RUN_SPEED } from "../walker";
import { ARM_BACK, ARM_SWING, footAt, gaitAt } from "./gait";
import { GLTF_MODELS, loadModel, pose, type Loaded } from "./gltf";
import { LEAN, poseRun } from "./run";
import { figureOf } from "./seat";

let person: Loaded;
beforeAll(async () => {
  person = await loadModel("", GLTF_MODELS.figure, readPublicModel);
});

const gait = gaitAt(RUN_SPEED);
/** Phases sampled over a stride. */
const PHASES = 40;
const deg = (r: number) => (r * 180) / Math.PI;
/** Whether a number is strictly between two others. */
const between = (a: number, b: number, x: number) => x > Math.min(a, b) && x < Math.max(a, b);

/**
 * The runner at each phase of a stride, its clip played then the gait laid over it by `weight`, carried along the
 * ground at its speed: each side's hip flexion and knee flexion (degrees), its ankle in the world (metres), its upper
 * arm's swing and its elbow's bend; and the trunk's lean.
 */
function strideOf(weight = 1) {
  const walker = person.make();
  const figure = figureOf(walker)!;
  walker.scale.setScalar(METRE);
  const bone = (name: string) => walker.getObjectByName(PropertyBinding.sanitizeNodeName(name))!;
  const at = (name: string) => bone(name).getWorldPosition(new Vector3()).divideScalar(METRE);
  return Array.from({ length: PHASES }, (_, i) => {
    const phase = i / PHASES;
    const along = phase * 2 * gait.step;
    walker.position.set(along * METRE, 0, 0);
    pose(walker, person.clips, "Sprint_Loop", phase);
    poseRun(walker, figure, gait, phase, weight);
    const side = (s: "L" | "R") => {
      const [hip, knee, ankle] = [`UpperLeg.${s}`, `LowerLeg.${s}`, `Foot.${s}`].map(at);
      const [shoulder, elbow, wrist] = [`UpperArm.${s}`, `ForeArm.${s}`, `Hand.${s}`].map(at);
      const thigh = knee!.clone().sub(hip!);
      const upper = elbow!.clone().sub(shoulder!);
      return {
        hip: deg(Math.atan2(thigh.x, -thigh.y)),
        knee: deg(thigh.angleTo(ankle!.clone().sub(knee!))),
        ankle: ankle!,
        arm: deg(Math.atan2(upper.x, -upper.y)),
        elbow: deg(upper.angleTo(wrist!.clone().sub(elbow!))),
      };
    };
    const trunk = at("Head").sub(at("Hips"));
    const left = footAt(gait, phase, "left");
    return { phase, left: side("L"), right: side("R"), lean: deg(Math.atan2(trunk.x, trunk.y)), planted: left, figure };
  });
}

describe("poseRun", () => {
  it("plants each foot where it lands and leaves it there as the body runs over it", () => {
    const stride = strideOf();
    const planted = stride.filter((s) => s.planted.planted);
    expect(planted.length).toBeGreaterThan(4);
    const first = planted[0]!.left.ankle;
    // Flat on the ground, then the heel rising: the ankle never slides along it.
    for (const s of planted) expect(Math.abs(s.left.ankle.x - first.x)).toBeLessThan(0.01);
    for (const s of planted.slice(0, 3)) expect(s.left.ankle.y).toBeCloseTo(s.figure.ankle, 2);
  });

  it("has both feet off the ground between steps: the flight", () => {
    const stride = strideOf();
    const ankle = stride[0]!.figure.ankle;
    const flying = stride.filter(
      (s) => !footAt(gait, s.phase, "left").planted && !footAt(gait, s.phase, "right").planted,
    );
    expect(flying.length).toBeGreaterThan(PHASES / 5);
    for (const s of flying) expect(Math.min(s.left.ankle.y, s.right.ankle.y)).toBeGreaterThan(ankle + 0.02);
  });

  it("bends hips and knees within a runner's ranges (Novacheck 1998; Muybridge's plate 60 for the trailing leg)", () => {
    const stride = strideOf();
    const left = stride.map((s) => s.left);
    const stance = stride.filter((s) => s.planted.planted).map((s) => s.left);
    // Landing on a nearly straight knee, bending under the load, straightening to push off.
    expect(stance[0]!.knee).toBeGreaterThan(5);
    expect(stance[0]!.knee).toBeLessThan(25);
    const loaded = Math.max(...stance.map((s) => s.knee));
    expect(loaded).toBeGreaterThan(35);
    expect(loaded).toBeLessThan(55);
    // The hip extended behind as the foot trails on after toe-off, flexed well ahead late in the swing; the knee
    // folded high in the swing.
    expect(Math.min(...left.map((s) => s.hip))).toBeGreaterThan(-35);
    expect(Math.min(...left.map((s) => s.hip))).toBeLessThan(-15);
    expect(Math.max(...left.map((s) => s.hip))).toBeGreaterThan(45);
    expect(Math.max(...left.map((s) => s.hip))).toBeLessThan(65);
    expect(Math.max(...left.map((s) => s.knee))).toBeGreaterThan(90);
    expect(Math.max(...left.map((s) => s.knee))).toBeLessThan(120);
  });

  it("leans the trunk a little forward, bends the elbows square, and swings the arms against the legs", () => {
    const stride = strideOf();
    for (const s of stride) {
      expect(s.lean).toBeCloseTo(deg(LEAN), 0);
      expect(s.left.elbow).toBeGreaterThan(80);
      expect(s.left.elbow).toBeLessThan(100);
    }
    const arms = stride.map((s) => s.left.arm);
    expect(Math.max(...arms)).toBeCloseTo(deg(ARM_SWING - ARM_BACK), -1);
    expect(Math.min(...arms)).toBeCloseTo(-deg(ARM_SWING + ARM_BACK), -1);
    // The left arm back as the left foot lands, forward as the right does.
    expect(stride[0]!.left.arm).toBeLessThan(0);
    expect(stride[PHASES / 2]!.left.arm).toBeGreaterThan(0);
  });

  it("leaves the clip as it is at no weight, and blends halfway at half", () => {
    const clip = strideOf(0);
    const half = strideOf(0.5);
    const full = strideOf(1);
    expect(clip[10]!.left.knee).not.toBeCloseTo(full[10]!.left.knee, 0);
    expect(between(clip[10]!.left.knee, full[10]!.left.knee, half[10]!.left.knee)).toBe(true);
  });
});
