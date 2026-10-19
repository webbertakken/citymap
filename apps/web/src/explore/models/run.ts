// A figure running: its clip played for the body, then its legs, arms and trunk set by the gait. Each foot is put where
// the gait has it (planted on the ground as the body runs over it, or swung through the air), the toes pointed down as
// the foot rises; the trunk leant `LEAN` forward, the head kept as the clip held it; the arms swung against the legs,
// elbows bent; the hips lifted and lowered over each step. Blended with the clip by how far into the run the figure is.
import { Quaternion, Vector3, type Object3D } from "three";
import { armAt, bounceAt, footAt, type Gait, type Side } from "./gait";
import { reachFor, turnInWorld } from "./pedalling";
import { grip, type Figure } from "./seat";

/** The trunk leans this far forward from upright at a run, in radians (about 7°). */
export const LEAN = 0.12;
/** At a run the hip joints are, on the mean, this share of the leg's length above the ankle's standing height. */
export const RUN_HEIGHT = 0.94;
/** The trunk is turned to its lean in this many passes. */
const LEAN_PASSES = 3;
/** A foot lands under its hip this share of the hips' width out: a runner's feet fall near the middle. */
export const FEET_IN = 0.5;
/** A foot's toes point down this far at the top of its swing, in radians, flat again to land. */
export const TOE_DOWN = 0.6;
/** The elbows bend this far, the upper arms this far out from the sides, the hands this far in to the middle. */
export const ELBOW = Math.PI / 2;
export const ARM_OUT = 0.15;
export const HAND_IN = 0.25;
/** A runner's hands close this share of the way to a grip: a loose fist. */
export const FIST = 0.6;

const UP = new Vector3(0, 1, 0);
const ACROSS = new Vector3(0, 0, 1);

/**
 * Poses a running figure (its clip already played) by its gait at a phase of the stride, as far as `weight` (0 the clip
 * as it is, 1 the gait's pose): the walker's own frame is the ground under its hips, facing +x, +z its right.
 */
export function poseRun(walker: Object3D, figure: Figure, gait: Gait, phase: number, weight: number) {
  if (weight <= 0) return;
  walker.updateMatrixWorld(true);
  const bones = [
    figure.spine,
    figure.head,
    ...[figure.left, figure.right].flatMap((s) => [s.leg.thigh, s.leg.shin, s.leg.foot, s.arm.upper, s.arm.fore]),
  ];
  const clip = bones.map((bone) => bone.quaternion.clone());
  const local = (bone: Object3D) => walker.worldToLocal(bone.getWorldPosition(new Vector3()));
  const world = (at: Vector3) => walker.localToWorld(at.clone());
  const towards = (v: Vector3) => world(v).sub(world(new Vector3()));
  // The hips at a runner's height over the step, however high the clip holds them.
  const { thigh, shin, foot } = figure.left.leg;
  const leg = local(thigh).distanceTo(local(shin)) + local(shin).distanceTo(local(foot));
  const lift = (figure.ankle + RUN_HEIGHT * leg + bounceAt(gait, phase) - local(thigh).y) * weight;
  walker.position.add(towards(UP.clone().multiplyScalar(lift)));
  walker.updateMatrixWorld(true);
  // The trunk to its lean, from however the clip leans it (a few passes: the spine bends above the hips); the head
  // turned back as far, so it looks where it looked.
  const across = towards(ACROSS).normalize();
  for (let pass = 0; pass < LEAN_PASSES; pass++) {
    const trunk = local(figure.head).sub(local(figure.hips));
    const leant = Math.atan2(trunk.x, trunk.y) - LEAN;
    turnInWorld(figure.spine, new Quaternion().setFromAxisAngle(across, leant));
    turnInWorld(figure.head, new Quaternion().setFromAxisAngle(across, -leant));
  }
  for (const [side, s] of [
    ["left", figure.left],
    ["right", figure.right],
  ] as const)
    stride(gait, phase, side, s, figure, { local, world, towards, lift }, weight);
  const posed = bones.map((bone) => bone.quaternion.clone());
  bones.forEach((bone, i) => bone.quaternion.copy(clip[i]!).slerp(posed[i]!, weight));
  walker.updateMatrixWorld(true);
}

/**
 * The walker's frame: a bone's place in it, a point of it in the world, a direction of it in the world; and how far it
 * was lifted off the ground (the ground is that far below its own y = 0).
 */
interface Frame {
  readonly lift: number;
  readonly local: (bone: Object3D) => Vector3;
  readonly world: (at: Vector3) => Vector3;
  readonly towards: (v: Vector3) => Vector3;
}

/** One side's leg and arm at a phase: the foot where the gait has it, the arm swung against it. */
function stride(
  gait: Gait,
  phase: number,
  side: Side,
  limbs: Figure["left"],
  figure: Figure,
  frame: Frame,
  weight: number,
) {
  const { local, world, towards, lift } = frame;
  const hip = local(limbs.leg.thigh);
  const foot = footAt(gait, phase, side);
  const ankle = new Vector3(hip.x + foot.ahead, foot.up + figure.ankle - lift, hip.z * FEET_IN);
  reachFor(limbs.leg.thigh, limbs.leg.shin, limbs.leg.foot, world(ankle), towards(new Vector3(1, 0.2, 0)));
  // Planted, the ball kept on the ground as the heel rises; swung, the toes pointed down as the foot rises.
  const reach = figure.toe.length();
  const drop = Math.min(reach, -figure.toe.y + foot.up);
  const toe = foot.planted
    ? new Vector3(Math.sqrt(reach * reach - drop * drop), -drop, figure.toe.z)
    : figure.toe.clone().applyAxisAngle(ACROSS, (-TOE_DOWN * foot.up) / gait.swing);
  const now = local(limbs.ball).sub(local(limbs.leg.foot));
  turnInWorld(limbs.leg.foot, new Quaternion().setFromUnitVectors(towards(now).normalize(), towards(toe).normalize()));
  // The arm: the upper arm swung forward or back from hanging, a little out; the forearm bent up from it, a little in.
  const out = Math.sign(hip.z);
  const shoulder = local(limbs.arm.upper);
  const elbowAt = local(limbs.arm.fore);
  const upper = shoulder.distanceTo(elbowAt);
  const fore = elbowAt.distanceTo(local(limbs.arm.hand));
  const swing = armAt(phase, side);
  const elbow = shoulder
    .clone()
    .addScaledVector(new Vector3(Math.sin(swing), -Math.cos(swing), out * ARM_OUT).normalize(), upper);
  const bent = swing + ELBOW;
  const hand = elbow.addScaledVector(new Vector3(Math.sin(bent), -Math.cos(bent), -out * HAND_IN).normalize(), fore);
  reachFor(limbs.arm.upper, limbs.arm.fore, limbs.arm.hand, world(hand), towards(new Vector3(-1, -0.3, out * 0.3)));
  // A loose fist, as far into the run as the figure is (the fingers are not the clip's: they rest open).
  grip(limbs, towards(ACROSS).normalize(), FIST * weight);
}
