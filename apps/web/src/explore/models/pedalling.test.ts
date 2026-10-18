import { Group, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DOWN, FALLING, RISING, type Fall } from "../bicycle";
import { THROWN, THROWN_ASIDE, legsOf, pedalsOf, reachFor, thrownPose } from "./pedalling";
import { PROCEDURAL_RIGS, RIGS } from "./rig";

describe("pedalsOf", () => {
  it("hangs the right pedal down and the left up at rest, opposite each other, out to each side", () => {
    const { right, left } = pedalsOf(0, RIGS.bicycle.pedals);
    expect(right).toEqual({ x: -0, y: -0.133, z: 0.165 });
    expect(left).toEqual({ x: 0, y: 0.133, z: -0.165 });
  });

  it("turns them forwards: a quarter turn on, the right pedal is behind (as a wheel's foot goes back)", () => {
    const { right, left } = pedalsOf(Math.PI / 2, PROCEDURAL_RIGS.bicycle.pedals);
    expect(right.x).toBeCloseTo(-0.17, 9);
    expect(right.y).toBeCloseTo(0, 9);
    expect(left.x).toBeCloseTo(0.17, 9);
  });
});

/** A leg: a hip, a thigh down to a knee 0.45 m below, a shin to a foot 0.45 m below that, turned oddly in its frames. */
function leg() {
  const root = new Group();
  root.rotation.set(0.3, -0.7, 0.2);
  const thigh = new Object3D();
  thigh.position.set(0.1, 1, 0);
  thigh.rotation.set(0, 0, -Math.PI / 2);
  const shin = new Object3D();
  shin.position.set(0.45, 0, 0);
  shin.rotation.set(0.4, 0, 0);
  const foot = new Object3D();
  foot.position.set(0.45, 0, 0);
  root.add(thigh);
  thigh.add(shin);
  shin.add(foot);
  root.updateMatrixWorld(true);
  return { root, thigh, shin, foot };
}
const at = (part: Object3D) => part.getWorldPosition(new Vector3());

describe("reachFor", () => {
  it("puts the foot on a target within reach, the knee bent the way asked, the bones their lengths", () => {
    const { thigh, shin, foot } = leg();
    const hip = at(thigh);
    const target = hip.clone().add(new Vector3(0.3, -0.6, 0.1));
    const bend = new Vector3(1, 0, 0);
    reachFor(thigh, shin, foot, target, bend);
    expect(at(foot).distanceTo(target)).toBeLessThan(1e-6);
    expect(at(shin).distanceTo(hip)).toBeCloseTo(0.45, 6);
    expect(at(foot).distanceTo(at(shin))).toBeCloseTo(0.45, 6);
    // The knee is out towards the bend, past the line from hip to foot.
    const line = target.clone().sub(hip).normalize();
    const knee = at(shin).sub(hip);
    expect(knee.sub(line.multiplyScalar(knee.dot(line))).dot(bend)).toBeGreaterThan(0.1);
  });

  it("reaches with a leg standing on its own, without a body above it", () => {
    const { thigh, shin, foot } = leg();
    thigh.removeFromParent();
    thigh.updateMatrixWorld(true);
    const target = at(thigh).add(new Vector3(0.2, -0.7, 0));
    reachFor(thigh, shin, foot, target, new Vector3(1, 0, 0));
    expect(at(foot).distanceTo(target)).toBeLessThan(1e-6);
  });

  it("points the leg straight at a target out of reach", () => {
    const { thigh, shin, foot } = leg();
    const hip = at(thigh);
    const target = hip.clone().add(new Vector3(0, -2, 0));
    reachFor(thigh, shin, foot, target, new Vector3(1, 0, 0));
    expect(at(foot).distanceTo(hip.clone().add(new Vector3(0, -0.9, 0)))).toBeLessThan(1e-6);
  });

  it("bends somewhere sensible when asked to bend along the leg itself", () => {
    const { thigh, shin, foot } = leg();
    const hip = at(thigh);
    const target = hip.clone().add(new Vector3(0, -0.6, 0));
    reachFor(thigh, shin, foot, target, new Vector3(0, -1, 0));
    expect(at(foot).distanceTo(target)).toBeLessThan(1e-6);
    // Straight along z, too.
    const other = leg();
    const ahead = at(other.thigh).add(new Vector3(0, 0, 0.6));
    reachFor(other.thigh, other.shin, other.foot, ahead, new Vector3(0, 0, 1));
    expect(at(other.foot).distanceTo(ahead)).toBeLessThan(1e-6);
  });
});

describe("legsOf", () => {
  it("finds a person's thighs, shins and feet by their bones' names, or nothing in a figure without them", () => {
    const body = new Group();
    for (const name of ["UpperLegL", "LowerLegL", "FootL", "UpperLegR", "LowerLegR", "FootR"]) {
      const bone = new Object3D();
      bone.name = name;
      body.add(bone);
    }
    const legs = legsOf(body)!;
    expect(legs.left.thigh.name).toBe("UpperLegL");
    expect(legs.right.foot.name).toBe("FootR");
    expect(legsOf(new Group())).toBeNull();
  });
});

/** A fall to the right, so long under way. */
const fall = (time: number): Fall => ({ time, side: -1, cause: "hit", speed: 5 });

describe("thrownPose", () => {
  it("throws the rider ahead and to the side the bicycle falls, lying, and brings them back to the saddle", () => {
    expect(thrownPose(fall(0))).toEqual({ down: 0, ahead: 0, aside: -0, roll: -0 });
    const lying = thrownPose(fall(FALLING + 0.5));
    expect(lying).toEqual({ down: 1, ahead: THROWN, aside: -THROWN_ASIDE, roll: -Math.PI / 2 });
    expect(thrownPose(fall(DOWN - RISING / 2)).down).toBeCloseTo(0.5, 9);
  });
});
