// Devices as intents: held keys, a touch stick, jump and down buttons and a gamepad become what the walker means to do.
// Pure.
import type { Intents } from "./walker";

/** A touch stick's push: right and forward, each −1 to 1, never beyond the unit circle. */
export interface Stick {
  readonly x: number;
  readonly y: number;
}

/** Keys by their physical place (`KeyboardEvent.code`), so a layout other than QWERTY walks the same. */
const FORWARD = ["KeyW", "ArrowUp"];
const BACK = ["KeyS", "ArrowDown"];
const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const RUN = ["ShiftLeft", "ShiftRight"];
const JUMP = ["Space"];
/** Flying (the helicopter or the free camera), these sink as Space rises. */
const SINK = ["KeyC", "ControlLeft", "ControlRight", ...RUN];

/** Every key the walker answers to: the view keeps them from the page while exploring. */
export const WALK_KEYS: ReadonlySet<string> = new Set([
  ...FORWARD,
  ...BACK,
  ...LEFT,
  ...RIGHT,
  ...RUN,
  ...JUMP,
  ...SINK,
]);

/** A stick pushed at least this far runs. */
export const RUN_PUSH = 0.9;

const held = (keys: ReadonlySet<string>, codes: readonly string[]) => codes.some((code) => keys.has(code));
const axis = (keys: ReadonlySet<string>, plus: readonly string[], minus: readonly string[]) =>
  (held(keys, plus) ? 1 : 0) - (held(keys, minus) ? 1 : 0);

/**
 * What the held keys, the touch stick (when pushed), the jump and down buttons and a gamepad mean: the touch stick wins
 * over the pad's, and either over the keys.
 */
export function intentsOf(
  keys: ReadonlySet<string>,
  stick: Stick | null,
  jumping: boolean,
  pad: Pad | null = null,
  sinking = false,
): Intents {
  const touched = stick && (stick.x !== 0 || stick.y !== 0) ? stick : null;
  const padded = pad && (pad.stick.x !== 0 || pad.stick.y !== 0) ? pad.stick : null;
  const pushed = touched ?? padded;
  return {
    forward: pushed ? pushed.y : axis(keys, FORWARD, BACK),
    right: pushed ? pushed.x : axis(keys, RIGHT, LEFT),
    run: pushed ? Math.hypot(pushed.x, pushed.y) >= RUN_PUSH : held(keys, RUN),
    jump: jumping || (pad?.jump ?? false) || held(keys, JUMP),
    sink: sinking || (pad?.sink ?? false) || held(keys, SINK),
  };
}

/** What a gamepad gives, as the browser reads it: the standard mapping's axes and buttons. */
export interface PadState {
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

/** A pad's part in the intents: its stick (the left stick, with the triggers pedalling and braking), A and B held. */
export interface Pad {
  readonly stick: Stick;
  readonly jump: boolean;
  readonly sink: boolean;
}

/** What a pad's buttons asked for on the frame they went down: get on or off, ring, fly, and gear steps. */
export interface PadPresses {
  readonly use: boolean;
  readonly ring: boolean;
  readonly fly: boolean;
  readonly gears: number;
}

/** A stick resting within this much of its middle counts as at rest: worn sticks never quite centre. */
export const DEAD_ZONE = 0.15;
/** The right stick turns the camera as a drag of this many pixels a second would, pushed fully. */
export const PAD_LOOK = 900;

/** The standard mapping's buttons and axes. */
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8 } as const;

/** An axis with its dead zone taken out: zero within it, rising from zero past it to one at the end. */
const live = (value: number) =>
  Math.abs(value) < DEAD_ZONE ? 0 : (Math.sign(value) * (Math.abs(value) - DEAD_ZONE)) / (1 - DEAD_ZONE);

/**
 * A gamepad over a frame of `seconds`, given which buttons were down the frame before: its part in the intents, how
 * far it turns the camera (pixels, as a drag), the buttons pressed this frame, and which are down now. Null for a pad
 * without the standard mapping, whose buttons mean nothing known.
 */
export function padOf(state: PadState, before: readonly boolean[], seconds: number) {
  if (state.mapping !== "standard") return null;
  const value = (button: number) => state.buttons[button]?.value ?? 0;
  const pressed = state.buttons.map((b) => b.pressed);
  const down = (button: number) => (pressed[button] ?? false) && !(before[button] ?? false);
  const pad: Pad = {
    stick: {
      x: live(state.axes[0] ?? 0),
      // The stick's y grows downwards; pushed up, or the right trigger, is forward; the left trigger, back.
      y: Math.max(-1, Math.min(1, -live(state.axes[1] ?? 0) + value(PAD.rt) - value(PAD.lt))),
    },
    jump: pressed[PAD.a] ?? false,
    sink: pressed[PAD.b] ?? false,
  };
  const presses: PadPresses = {
    use: down(PAD.y),
    ring: down(PAD.x),
    fly: down(PAD.view),
    gears: (down(PAD.rb) ? 1 : 0) - (down(PAD.lb) ? 1 : 0),
  };
  const look = { dx: live(state.axes[2] ?? 0) * PAD_LOOK * seconds, dy: live(state.axes[3] ?? 0) * PAD_LOOK * seconds };
  return { pad, look, presses, pressed };
}

/** A stick's push for a finger at `point`, from where it first touched (`origin`), with a reach of `radius` pixels. */
export function stickAt(
  origin: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
  radius: number,
): Stick {
  const x = (point.x - origin.x) / radius;
  // Screen y grows downwards; pushing up is forward.
  const y = (origin.y - point.y) / radius;
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}
