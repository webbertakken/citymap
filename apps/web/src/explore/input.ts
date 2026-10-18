// Devices as intents: held keys, a touch stick and a jump button become what the walker means to do. Pure.
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

/** Every key the walker answers to: the view keeps them from the page while exploring. */
export const WALK_KEYS: ReadonlySet<string> = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT, ...RUN, ...JUMP]);

/** A stick pushed at least this far runs. */
export const RUN_PUSH = 0.9;

const held = (keys: ReadonlySet<string>, codes: readonly string[]) => codes.some((code) => keys.has(code));
const axis = (keys: ReadonlySet<string>, plus: readonly string[], minus: readonly string[]) =>
  (held(keys, plus) ? 1 : 0) - (held(keys, minus) ? 1 : 0);

/** What the held keys, the stick (when pushed) and the jump button mean: the stick wins over the keys. */
export function intentsOf(keys: ReadonlySet<string>, stick: Stick | null, jumping: boolean): Intents {
  const pushed = stick && (stick.x !== 0 || stick.y !== 0) ? stick : null;
  return {
    forward: pushed ? pushed.y : axis(keys, FORWARD, BACK),
    right: pushed ? pushed.x : axis(keys, RIGHT, LEFT),
    run: pushed ? Math.hypot(pushed.x, pushed.y) >= RUN_PUSH : held(keys, RUN),
    jump: jumping || held(keys, JUMP),
  };
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
