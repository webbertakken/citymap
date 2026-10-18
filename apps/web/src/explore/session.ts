// A walk through the city, frame by frame: what the devices hold, and the walker and camera they move. The walker
// steps at a fixed rate, whatever the screen's, so a walk is the same on every device. Metres.
import { behind, turned, type Orbit } from "./camera";
import { intentsOf, type Stick } from "./input";
import { facing, stepWalker, type Body, type Vec3, type Walls } from "./walker";

/** What the devices hold now: the view's listeners write it, each frame reads it. */
export interface Controls {
  readonly keys: Set<string>;
  stick: Stick | null;
  jump: boolean;
  /** Pixels dragged since the last frame. */
  look: { dx: number; dy: number };
}

export const newControls = (): Controls => ({ keys: new Set(), stick: null, jump: false, look: { dx: 0, dy: 0 } });

/** The walker, the camera's orbit, the time not yet stepped, and how far the walker has walked (for its stride). */
export interface Session {
  readonly body: Body;
  readonly orbit: Orbit;
  readonly spare: number;
  readonly walked: number;
}

/** The walker steps 120 times a second. */
export const STEP = 1 / 120;
/** A frame longer than this (a tab in the background, a pause) counts as this long, so nobody leaps through a wall. */
export const LONGEST_FRAME = 0.1;

/** A walk starting with feet at a point, facing a heading, the camera behind. */
export const startSession = (feet: Vec3, heading: number): Session => ({
  body: { feet, rise: 0, heading, grounded: true },
  orbit: behind(heading),
  spare: 0,
  walked: 0,
});

/** The walk after a frame of `seconds`: the drag turns the camera, then the walker takes every whole step due. */
export function advanceSession(session: Session, controls: Readonly<Controls>, seconds: number, walls: Walls): Session {
  const orbit = turned(session.orbit, controls.look.dx, controls.look.dy);
  const intents = intentsOf(controls.keys, controls.stick, controls.jump);
  let body = session.body;
  let walked = session.walked;
  let spare = session.spare + Math.min(seconds, LONGEST_FRAME);
  while (spare >= STEP) {
    const next = stepWalker(body, intents, orbit.yaw, STEP, walls);
    walked += Math.hypot(next.feet.x - body.feet.x, next.feet.z - body.feet.z);
    body = next;
    spare -= STEP;
  }
  return { body, orbit, spare, walked };
}

/** Where the walker stands and faces, on the ground: for the map to come back to. */
export const placeOf = (session: Session) => ({ feet: session.body.feet, ahead: facing(session.body.heading) });
