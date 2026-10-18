import {
  AnimationClip,
  Bone,
  Group,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  AnimationMixer,
  LoopOnce,
  type Object3D,
} from "three";
import { describe, expect, it } from "vitest";
import { QUATERNIUS_FROM_UAL, WOBBLE_FROM_UAL, retargetClip } from "./retarget";

/** A rig of a hip and an arm: the hip at a height, the arm reaching out from it, built from bones the given way. */
function rig(names: { readonly hip: string; readonly arm: string }, height: number, armRest: Quaternion) {
  const root = new Group();
  const hip = new Bone();
  hip.name = names.hip;
  hip.position.set(0, height, 0);
  const arm = new Bone();
  arm.name = names.arm;
  arm.position.set(0, 0.5, 0);
  arm.quaternion.copy(armRest);
  hip.add(arm);
  root.add(hip);
  root.updateMatrixWorld(true);
  return { root, hip, arm };
}

const about = (axis: Vector3, angle: number) => new Quaternion().setFromAxisAngle(axis, angle);
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
/** Where an arm's own +y points in the world. */
const pointing = (bone: Object3D) => new Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new Quaternion()));

// The source rig's arm rests pointing along +y; the target's rests the same way but is built turned about its own
// axis and about z, so a copy of the source's rotations would point it elsewhere.
const source = () => rig({ hip: "pelvis", arm: "upperarm_l" }, 1, new Quaternion());
const targetRest = about(Y, Math.PI / 2);
// Named as three.js names a loaded glTF's "UpperArm.L".
const target = () => rig({ hip: "Hips", arm: "UpperArmL" }, 0.5, targetRest);
const rest = new AnimationClip("A_TPose", 1, [new QuaternionKeyframeTrack("upperarm_l.quaternion", [0], [0, 0, 0, 1])]);
// Over a second the arm swings a quarter turn forwards about x, and the hip bobs 10 cm.
const swing = about(X, Math.PI / 2);
const clip = new AnimationClip("Swing", 1, [
  new QuaternionKeyframeTrack("upperarm_l.quaternion", [0, 1], [0, 0, 0, 1, ...swing.toArray()]),
  new VectorKeyframeTrack("pelvis.position", [0, 1], [0, 1, 0, 0, 1.1, 0]),
]);
const names = { Hips: "pelvis", "UpperArm.L": "upperarm_l" };

describe("retargetClip", () => {
  it("turns each target bone as its source turns from rest, whichever way the target's bones are built", () => {
    const from = source();
    const to = target();
    const moved = retargetClip(to.root, from.root, clip, rest, names, { hip: "Hips", fps: 10 });
    const mixer = new AnimationMixer(to.root);
    const action = mixer.clipAction(moved);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(1);
    to.root.updateMatrixWorld(true);
    // The source's arm, swung a quarter about x, points along +z; so must the target's.
    expect(pointing(to.arm).z).toBeCloseTo(1, 4);
    // A copy of the source's rotation would have pointed it along +z only without its own rest turn: the bone's own
    // twist is kept, as it rests.
    expect(to.arm.quaternion.equals(swing)).toBe(false);
  });

  it("turns bones alike however each model stands in the world", () => {
    const from = source();
    const to = target();
    // The target model is turned a quarter round, as a model is turned to face along a street.
    to.root.rotation.y = Math.PI / 2;
    to.root.updateMatrixWorld(true);
    const moved = retargetClip(to.root, from.root, clip, rest, names, { hip: "Hips", fps: 10 });
    const mixer = new AnimationMixer(to.root);
    const action = mixer.clipAction(moved);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(1);
    to.root.updateMatrixWorld(true);
    // Swung forwards in its own frame: +z turned a quarter about y is +x in the world.
    expect(pointing(to.arm).x).toBeCloseTo(1, 4);
  });

  it("moves the hip as the source's moves, scaled by how tall each stands", () => {
    const to = target();
    const moved = retargetClip(to.root, source().root, clip, rest, names, { hip: "Hips", fps: 10 });
    const mixer = new AnimationMixer(to.root);
    const action = mixer.clipAction(moved);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(1);
    // The source's hip rose 10 cm of its 1 m; the target's rises 5 cm of its 0.5 m.
    expect(to.hip.position.y).toBeCloseTo(0.55, 4);
  });

  it("keeps bones it has no source for as they rest, and names the clip as its source", () => {
    const to = target();
    const extra = new Bone();
    extra.name = "Head";
    extra.quaternion.copy(about(Z, 0.3));
    to.hip.add(extra);
    const moved = retargetClip(to.root, source().root, clip, rest, names, { hip: "Hips", fps: 10 });
    expect(moved.name).toBe("Swing");
    const mixer = new AnimationMixer(to.root);
    const action = mixer.clipAction(moved);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(0.5);
    expect(extra.quaternion.angleTo(about(Z, 0.3))).toBeCloseTo(0, 6);
    expect(moved.tracks.some((t) => t.name.startsWith("Head."))).toBe(false);
  });

  it("says so when either skeleton lacks the hip", () => {
    expect(() => retargetClip(target().root, source().root, clip, rest, names, { hip: "Pelvis" })).toThrow(
      "explore/retarget-no-hip Pelvis",
    );
    expect(() => retargetClip(target().root, source().root, clip, rest, { Hips: "hips" }, { hip: "Hips" })).toThrow(
      "explore/retarget-no-hip Hips",
    );
  });

  it("samples the clip at the rate asked for, to its end, thirty times a second unless asked", () => {
    expect(retargetClip(target().root, source().root, clip, rest, names, { hip: "Hips" }).tracks[0]!.times.length).toBe(
      31,
    );
    const moved = retargetClip(target().root, source().root, clip, rest, names, { hip: "Hips", fps: 10 });
    expect(moved.duration).toBeCloseTo(1, 9);
    expect(moved.tracks[0]!.times.length).toBe(11);
  });

  it("maps every walking bone of the library onto both casts", () => {
    for (const map of [WOBBLE_FROM_UAL, QUATERNIUS_FROM_UAL]) {
      for (const bone of ["pelvis", "spine_01", "upperarm_l", "lowerarm_r", "thigh_l", "calf_r", "foot_l"])
        expect(Object.values(map)).toContain(bone);
    }
  });
});
