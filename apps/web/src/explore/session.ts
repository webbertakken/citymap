import type { Vec3, Walls } from "@citymap/world";
// A walk through the city, frame by frame: what the devices hold, and the walker and camera they move. The walker
// steps at a fixed rate, whatever the screen's, so a walk is the same on every device. Metres.
import { behind, turned, type Orbit } from "./camera";
import { intentsOf, type Stick } from "./input";
import { facing, stepWalker, turnBetween, type Body } from "./walker";

/** What the devices hold now: the view's listeners write it, each frame reads it. */
export interface Controls {
  readonly keys: Set<string>;
  stick: Stick | null;
  jump: boolean;
  /** Pixels dragged since the last frame. */
  look: { dx: number; dy: number };
}

export const newControls = (): Controls => ({ keys: new Set(), stick: null, jump: false, look: { dx: 0, dy: 0 } });

/**
 * The walker after its last step and before it, the camera's orbit, the time not yet stepped, how far the walker has
 * walked (for its stride) and its pace over the last step, in metres a second.
 */
export interface Session {
  readonly body: Body;
  readonly previous: Body;
  readonly speed: number;
  readonly orbit: Orbit;
  readonly spare: number;
  readonly walked: number;
}

/** The walker steps 120 times a second. */
export const STEP = 1 / 120;
/** A frame longer than this (a tab in the background, a pause) counts as this long, so nobody leaps through a wall. */
export const LONGEST_FRAME = 0.1;

/** A walk starting with feet at a point, facing a heading, the camera behind. */
export const startSession = (feet: Vec3, heading: number): Session => {
  const body: Body = { feet, rise: 0, heading, grounded: true };
  return { body, previous: body, speed: 0, orbit: behind(heading), spare: 0, walked: 0 };
};

/** The walk after a frame of `seconds`: the drag turns the camera, then the walker takes every whole step due. */
export function advanceSession(session: Session, controls: Readonly<Controls>, seconds: number, walls: Walls): Session {
  const orbit = turned(session.orbit, controls.look.dx, controls.look.dy);
  const intents = intentsOf(controls.keys, controls.stick, controls.jump);
  let { body, previous, speed, walked } = session;
  let spare = session.spare + Math.min(seconds, LONGEST_FRAME);
  while (spare >= STEP) {
    const next = stepWalker(body, intents, orbit.yaw, STEP, walls);
    const stride = Math.hypot(next.feet.x - body.feet.x, next.feet.z - body.feet.z);
    walked += stride;
    speed = stride / STEP;
    previous = body;
    body = next;
    spare -= STEP;
  }
  return { body, previous, speed, orbit, spare, walked };
}

/**
 * Where to draw the walker this frame: between its last two steps, as far as the time not yet stepped reaches into the
 * next. Steps come at a fixed rate and frames do not, so drawing the last step itself would jolt it by a step whenever a
 * frame holds one step more or less than the one before; drawn between, it moves exactly as far as each frame lasts.
 */
export function shownOf(session: Session): { readonly feet: Vec3; readonly heading: number } {
  const share = session.spare / STEP;
  const { previous: a, body: b } = session;
  return {
    feet: {
      x: a.feet.x + (b.feet.x - a.feet.x) * share,
      y: a.feet.y + (b.feet.y - a.feet.y) * share,
      z: a.feet.z + (b.feet.z - a.feet.z) * share,
    },
    heading: a.heading + turnBetween(a.heading, b.heading) * share,
  };
}

/** Where the walker stands and faces, on the ground: for the map to come back to. */
export const placeOf = (session: Session) => ({ feet: session.body.feet, ahead: facing(session.body.heading) });
