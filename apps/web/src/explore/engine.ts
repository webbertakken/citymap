// An engine and its gearbox: torque by a curve over the engine's speed, through gears that change by themselves, to a
// push at the driven wheel's contact. Shared by the car and the motorbike. Pure. Revolutions a minute, newton metres,
// metres, seconds.

/** An engine: its idle and red line, its torque curve (rpm to N·m, rising rpm), its drag off the throttle, and the
 * speed its clutch slips at to pull away. */
export interface Engine {
  readonly idle: number;
  readonly redline: number;
  readonly curve: readonly (readonly [number, number])[];
  readonly braking: number;
  readonly launch: number;
}

/** A gearbox: each forward gear's overall ratio (the final drive in it), first to top; reverse; and the engine speeds it
 * changes up at and down at. */
export interface Gearbox {
  readonly ratios: readonly number[];
  readonly reverse: number;
  readonly up: number;
  readonly down: number;
}

const RPM_PER_RADIAN = 60 / (2 * Math.PI);

/** The engine's torque at a speed: along its curve, its first point's below it, none past the red line. */
export function torqueAt(engine: Engine, rpm: number): number {
  if (rpm > engine.redline) return 0;
  const { curve } = engine;
  const after = curve.findIndex(([at]) => at >= rpm);
  if (after === 0) return curve[0]![1];
  if (after < 0) return curve.at(-1)![1];
  const [a, ta] = curve[after - 1]!;
  const [b, tb] = curve[after]!;
  return ta + ((tb - ta) * (rpm - a)) / (b - a);
}

/** The engine's speed for a wheel turning at a road speed, through a ratio. */
export const rpmOf = (speed: number, radius: number, ratio: number) =>
  (Math.abs(speed) / radius) * ratio * RPM_PER_RADIAN;

/** The gear after the engine's speed in it: up near the red line, down when it would labour; never past either end. */
export function automatic(box: Gearbox, gear: number, rpm: number): number {
  if (rpm > box.up && gear < box.ratios.length - 1) return gear + 1;
  if (rpm < box.down && gear > 0) return gear - 1;
  return gear;
}

/** What the engine gives through a ratio: its speed, and the push at the wheel's contact (newtons, negative braking). */
export interface Drive {
  readonly rpm: number;
  readonly force: number;
}

/**
 * The drive at a road speed through a ratio, the throttle open by `throttle` (0 to 1): pulling away, the clutch slips so
 * the engine runs at its launch speed (part of it, part throttle); past the red line the limiter cuts it; off the
 * throttle above idle, the engine drags.
 */
export function driveOf(engine: Engine, ratio: number, radius: number, speed: number, throttle: number): Drive {
  const turning = rpmOf(speed, radius, ratio);
  const slipping = engine.idle + (engine.launch - engine.idle) * throttle;
  const rpm = Math.max(turning, engine.idle, throttle > 0 ? slipping : 0);
  if (throttle > 0) return { rpm, force: (throttle * torqueAt(engine, rpm) * ratio) / radius };
  return { rpm, force: turning > engine.idle ? (-engine.braking * ratio) / radius : 0 };
}
