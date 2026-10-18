// Clips made for one skeleton played on another: each target bone turns, in the world, as its source bone turns from
// its rest pose, so two skeletons whose bones are built along different axes move alike. Both rest poses must match in
// the world (both T-poses here); the hip also moves as the source's does, scaled by how tall each stands.
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  LoopOnce,
  PropertyBinding,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type Object3D,
} from "three";

/** Target bone name to source bone name: the Universal Animation Library's mannequin onto Wobble Blocks' rig. */
export const WOBBLE_FROM_UAL: Readonly<Record<string, string>> = {
  Hips: "pelvis",
  Spine: "spine_01",
  Spine1: "spine_02",
  Spine2: "spine_03",
  Neck: "neck_01",
  Head: "Head",
  "Shoulder.L": "clavicle_l",
  "UpperArm.L": "upperarm_l",
  "ForeArm.L": "lowerarm_l",
  "Hand.L": "hand_l",
  "Shoulder.R": "clavicle_r",
  "UpperArm.R": "upperarm_r",
  "ForeArm.R": "lowerarm_r",
  "Hand.R": "hand_r",
  "UpperLeg.L": "thigh_l",
  "LowerLeg.L": "calf_l",
  "Foot.L": "foot_l",
  "ToeBase.L": "ball_l",
  "UpperLeg.R": "thigh_r",
  "LowerLeg.R": "calf_r",
  "Foot.R": "foot_r",
  "ToeBase.R": "ball_r",
};

/** The same library onto Quaternius' Animated Men and Women. */
export const QUATERNIUS_FROM_UAL: Readonly<Record<string, string>> = {
  Hips: "pelvis",
  Abdomen: "spine_01",
  Torso: "spine_03",
  Neck: "neck_01",
  Head: "Head",
  "Shoulder.L": "clavicle_l",
  "UpperArm.L": "upperarm_l",
  "LowerArm.L": "lowerarm_l",
  "Palm.L": "hand_l",
  "Shoulder.R": "clavicle_r",
  "UpperArm.R": "upperarm_r",
  "LowerArm.R": "lowerarm_r",
  "Palm.R": "hand_r",
  "UpperLeg.L": "thigh_l",
  "LowerLeg.L": "calf_l",
  "Foot.L": "foot_l",
  "UpperLeg.R": "thigh_r",
  "LowerLeg.R": "calf_r",
  "Foot.R": "foot_r",
};

export interface RetargetOptions {
  /** The target's hip bone, whose height scales the source's hip movement. */
  readonly hip: string;
  /** Samples a second. */
  readonly fps?: number;
}

/** Every bone under a root, parents before children. */
function bonesOf(root: Object3D): Bone[] {
  const bones: Bone[] = [];
  root.traverse((node) => {
    if (node instanceof Bone) bones.push(node);
  });
  return bones;
}

const byName = (bones: readonly Bone[]) => new Map(bones.map((b) => [b.name, b]));
/**
 * A node's turn and place in its model's own frame, whatever turns the model in the world: so a model turned to face a
 * street moves as one facing its file's way.
 */
const inModel = (root: Object3D) => {
  const turn = () => root.getWorldQuaternion(new Quaternion()).invert();
  return {
    q: (node: Object3D) => turn().multiply(node.getWorldQuaternion(new Quaternion())),
    p: (node: Object3D) => root.worldToLocal(node.getWorldPosition(new Vector3())),
  };
};

/** Poses a root at a clip's moment; played once and held, so its last moment is its end, not its start again. */
function poseAt(mixer: AnimationMixer, clip: AnimationClip, root: Object3D, time: number) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(time);
  root.updateMatrixWorld(true);
}

/**
 * The clip for the target: sampled `fps` times a second, each mapped bone (`names`, target to source) given the turn its
 * source makes from the source's rest (the `rest` clip's first moment), on top of the target's own rest; unmapped bones
 * keep their rest; the hip moves as the source's hip does, scaled by their heights. The target is left at rest.
 */
export function retargetClip(
  target: Object3D,
  source: Object3D,
  clip: AnimationClip,
  rest: AnimationClip,
  names: Readonly<Record<string, string>>,
  options: RetargetOptions,
): AnimationClip {
  const fps = options.fps ?? 30;
  // Bones are named as three.js names them: glTF's "UpperArm.L" is "UpperArmL", a dot being a track's separator.
  const sanitised = new Map(
    Object.entries(names).map(([to, from]) => [
      PropertyBinding.sanitizeNodeName(to),
      PropertyBinding.sanitizeNodeName(from),
    ]),
  );
  const sourceOf = (bone: Bone) => sanitised.get(bone.name);
  const hipName = PropertyBinding.sanitizeNodeName(options.hip);
  const targetBones = bonesOf(target);
  const sourceBones = byName(bonesOf(source));
  const mixer = new AnimationMixer(source);
  const inTarget = inModel(target);
  const inSource = inModel(source);
  // The target at rest: each bone's rest turn in the world, and its parent's.
  target.updateMatrixWorld(true);
  const targetRest = new Map(targetBones.map((b) => [b, inTarget.q(b)]));
  const restLocal = new Map(targetBones.map((b) => [b, b.quaternion.clone()]));
  // A bone always hangs from something: another bone, or the model it belongs to.
  const parentWorld = new Map(targetBones.map((b) => [b, inTarget.q(b.parent!)]));
  const hip = targetBones.find((b) => b.name === hipName);
  const sourceHip = sourceBones.get(sanitised.get(hipName) ?? "");
  if (!hip || !sourceHip) throw new Error(`explore/retarget-no-hip ${options.hip}`);
  const hipRest = inTarget.p(hip);
  // The source at rest.
  poseAt(mixer, rest, source, 0);
  const sourceRestInverse = new Map([...sourceBones].map(([name, bone]) => [name, inSource.q(bone).invert()] as const));
  const sourceHipRest = inSource.p(sourceHip);
  // Each moves its hip in proportion to how high it stands.
  const scale = hipRest.y / sourceHipRest.y;

  const frames = Math.max(1, Math.round(clip.duration * fps));
  const times = Array.from({ length: frames + 1 }, (_unused, f) => (f / frames) * clip.duration);
  const turns = new Map(targetBones.map((b) => [b, [] as number[]]));
  const hipPath: number[] = [];
  for (const time of times) {
    poseAt(mixer, clip, source, time);
    // Parents before children: each bone's world turn, then its own turn under its parent's.
    const world = new Map<Bone, Quaternion>();
    for (const bone of targetBones) {
      const from = sourceBones.get(sourceOf(bone) ?? "");
      const parent = bone.parent instanceof Bone ? world.get(bone.parent) : undefined;
      const above = parent ?? parentWorld.get(bone)!;
      const turned = from
        ? inSource.q(from).multiply(sourceRestInverse.get(from.name)!).multiply(targetRest.get(bone)!)
        : above.clone().multiply(restLocal.get(bone)!);
      world.set(bone, turned);
      turns.get(bone)!.push(...above.clone().invert().multiply(turned).toArray());
    }
    // The hip's move from its rest, in the world, scaled and taken into its parent's frame.
    const moved = inSource.p(sourceHip).sub(sourceHipRest).multiplyScalar(scale);
    hipPath.push(...hip.parent!.worldToLocal(target.localToWorld(hipRest.clone().add(moved))).toArray());
  }
  mixer.stopAllAction();
  const tracks = [
    ...targetBones
      .filter((b) => sourceOf(b) !== undefined)
      .map((b) => new QuaternionKeyframeTrack(`${b.name}.quaternion`, times, turns.get(b)!)),
    new VectorKeyframeTrack(`${hip.name}.position`, times, hipPath),
  ];
  return new AnimationClip(clip.name, clip.duration, tracks);
}
