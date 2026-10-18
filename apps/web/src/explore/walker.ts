// A person on foot, as pure motion: what they mean to do (intents) and where the camera looks become a step, and the
// city's walls decide how much of that step they can take. Metres and seconds; y up, a heading is a turn about y from
// +x (so a heading h faces cos h, 0, −sin h).

import type { Vec3, Walls } from "@citymap/world";

/**
 * What the person means to do: walk forward (−1 to 1) and to the right (−1 to 1), run, jump (or rise, flying), and sink
 * (flying: the helicopter or the free camera).
 */
export interface Intents {
  readonly forward: number;
  readonly right: number;
  readonly run: boolean;
  readonly jump: boolean;
  readonly sink: boolean;
}

export const NO_INTENTS: Intents = { forward: 0, right: 0, run: false, jump: false, sink: false };

/** Where the person's feet are, how fast they rise or fall, which way they face, and whether they stand on something. */
export interface Body {
  readonly feet: Vec3;
  readonly rise: number;
  readonly heading: number;
  readonly grounded: boolean;
}

/** A brisk walk and an easy run, in metres a second. */
export const WALK_SPEED = 1.6;
export const RUN_SPEED = 4.5;
/** Leaving the ground at this speed lifts the feet about 0.6 m. */
export const JUMP_SPEED = 3.5;
export const GRAVITY = 9.81;
/** How fast a person turns to face where they walk, in radians a second. */
export const TURN_RATE = 10;

/** The shortest turn from one heading to another, in radians (−π to π). */
export const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** The ground direction a heading faces. */
export const facing = (heading: number) => ({ x: Math.cos(heading), z: -Math.sin(heading) });

/**
 * One step of `dt` seconds: the intents, relative to where the camera looks (`look`, a heading), become a move along
 * the ground at a walk or a run; the body turns towards where it moves, at most `TURN_RATE`; a jump leaves the ground
 * and gravity brings it back. The walls take what they allow of the move.
 */
export function stepWalker(body: Body, intents: Intents, look: number, dt: number, walls: Walls): Body {
  const ahead = facing(look);
  // To the right of where the camera looks: ahead turned a quarter clockwise, seen from above.
  const right = { x: -ahead.z, z: ahead.x };
  let x = ahead.x * intents.forward + right.x * intents.right;
  let z = ahead.z * intents.forward + right.z * intents.right;
  const amount = Math.hypot(x, z);
  if (amount > 1) {
    x /= amount;
    z /= amount;
  }
  const speed = intents.run ? RUN_SPEED : WALK_SPEED;
  const moving = amount > 0;
  const heading = moving
    ? body.heading + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turnBetween(body.heading, Math.atan2(-z, x))))
    : body.heading;
  // Standing, the feet press on the ground as gravity would for one step, so the walls keep finding it under them.
  const rise = body.grounded ? (intents.jump ? JUMP_SPEED : -GRAVITY * dt) : body.rise - GRAVITY * dt;
  const moved = walls.move(body.feet, { x: x * speed * dt, y: rise * dt, z: z * speed * dt });
  // Landing ends a fall; a jump this step has not landed yet.
  const grounded = moved.grounded && rise <= 0;
  return { feet: moved.feet, rise: grounded ? 0 : rise, heading, grounded };
}
