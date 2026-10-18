import { Group, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DOWN, FALLING, RISING, type Fall } from "../bicycle";
import { THROWN, THROWN_ASIDE, armsOf, legsOf, reachFor, thrownPose, tiltToReach } from "./pedalling";

describe("tiltToReach", () => {
  const pivot = { x: 0, y: 0, z: 0 };

  it("leans an upright body forward until its shoulder is within reach of a grip ahead", () => {
    // Body, reach and the base to the grip all 0.5 m: an even triangle, the body 60° up from the grip's line.
    const tilt = tiltToReach(pivot, { x: 0, y: 0.5, z: 0 }, { x: 0.5, y: 0, z: 0 }, 0.5);
    expect(tilt).toBeCloseTo(-Math.PI / 6, 9);
  });

  it("leans a body back when its grips are nearer than its reach, and counts the distance across", () => {
    // Shoulder and grip 0.3 m apart across: a reach of 0.5 leaves 0.4 along, as the body leans back to 90° + 37°.
    const shoulder = { x: 0.5, y: 0.5, z: -0.3 };
    const tilt = tiltToReach(pivot, shoulder, { x: 0.5, y: 0, z: 0 }, 0.5);
    const turned = { x: Math.cos(Math.PI / 4 + tilt), y: Math.sin(Math.PI / 4 + tilt) };
    const reached = Math.hypot(turned.x * Math.SQRT2 * 0.5 - 0.5, turned.y * Math.SQRT2 * 0.5, 0.3);
    expect(reached).toBeCloseTo(0.5, 9);
    expect(turned.y).toBeGreaterThan(0);
  });

  it("leans straight at a grip out of reach, and straight away from one too near to be held", () => {
    expect(tiltToReach(pivot, { x: 0, y: 0.5, z: 0 }, { x: 2, y: 0, z: 0 }, 0.5)).toBeCloseTo(-Math.PI / 2, 9);
    expect(tiltToReach(pivot, { x: 0, y: 0.5, z: 0 }, { x: 0.1, y: 0, z: 0 }, 1)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("takes the nearest way round", () => {
    expect(tiltToReach(pivot, { x: -0.5, y: -0.01, z: 0 }, { x: 0.5, y: 0, z: 0 }, 0.5)).toBeLessThan(0);
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

describe("armsOf", () => {
  it("finds a person's upper arms, forearms and hands by their bones' names, or nothing in a figure without them", () => {
    const body = new Group();
    for (const name of ["UpperArmL", "ForeArmL", "HandL", "UpperArmR", "ForeArmR", "HandR"]) {
      const bone = new Object3D();
      bone.name = name;
      body.add(bone);
    }
    const arms = armsOf(body)!;
    expect(arms.left.upper.name).toBe("UpperArmL");
    expect(arms.right.hand.name).toBe("HandR");
    expect(armsOf(new Group())).toBeNull();
  });
});

describe("thrownPose", () => {
  it("throws the rider ahead and to the side the bicycle falls, lying, and brings them back to the saddle", () => {
    expect(thrownPose(fall(0))).toEqual({ down: 0, ahead: 0, aside: -0, roll: -0 });
    const lying = thrownPose(fall(FALLING + 0.5));
    expect(lying).toEqual({ down: 1, ahead: THROWN, aside: -THROWN_ASIDE, roll: -Math.PI / 2 });
    expect(thrownPose(fall(DOWN - RISING / 2)).down).toBeCloseTo(0.5, 9);
  });
});
