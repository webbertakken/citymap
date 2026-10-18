// A runner's gait, as the reference describes it: how many steps a second and how long each is at a speed (Weyand et
// al. 2000; Cavanagh & Kram 1989), how long a foot stays on the ground and how long both are off it, where each foot is
// through a stride (planted, the body running over it; then swung through the air, the heel up behind first), how the
// hips rise and fall, and how the arms swing against the legs. Muybridge's "Running at a half-mile gait" (Animal
// Locomotion, plate 60, 1887) is the footage it is checked against. Metres and seconds; a stride is two steps, its phase
// 0 to 1 from the left foot landing.

/** Steps a second at a speed: `STEP_RATE_AT_REST` and `STEP_RATE_PER_SPEED` more for each metre a second. */
export const STEP_RATE_AT_REST = 2.45;
export const STEP_RATE_PER_SPEED = 0.1;
/**
 * The hip joint travels this far over a planted ankle: the foot down for about a sixth of a second at 4.5 m/s (Weyand et
 * al. 2000 measure about a metre of the body's travel over the whole foot, heel to toe, at running speeds).
 */
export const CONTACT_LENGTH = 0.72;
/** A foot lands this share of the contact length ahead of the hip, and leaves the rest of it behind (Novacheck 1998). */
export const LANDING_AHEAD = 0.38;
/**
 * Leaving the ground the foot trails on behind the hip, this far at most, over the first `TRAIL_SHARE` of its swing,
 * before the knee folds and brings it through: the long trailing leg of Muybridge's runner.
 */
export const TRAIL = 0.3;
export const TRAIL_SHARE = 0.4;
/** The heel rises this many metres for each metre a second, at most `SWING_MOST`. */
export const SWING_PER_SPEED = 0.1;
export const SWING_MOST = 0.5;
/** The swing's height peaks this early: its share of the swing raised to this power is half a sine. */
export const HEEL_EARLY = 0.45;
/** Pushing off, the heel rises this far by the time the toes leave, from halfway through the stance. */
export const HEEL_RISE = 0.06;
/** The hips rise and fall this far each way over a step (6 cm in all at a run). */
export const BOUNCE = 0.03;
/** Each arm swings this far forward and back, in radians (about 26°), about `ARM_BACK` behind hanging (about 11°). */
export const ARM_SWING = 0.45;
export const ARM_BACK = 0.2;
/** Walking into a run, or out of one, takes this long, in seconds. */
export const RUN_BLEND = 0.2;

/** A gait at a speed: steps a second, a step's length, a foot's time on the ground and both feet's off it, the heel's rise. */
export interface Gait {
  readonly speed: number;
  readonly cadence: number;
  readonly step: number;
  readonly contact: number;
  readonly flight: number;
  readonly swing: number;
}

export type Side = "left" | "right";

/** The gait at a speed (metres a second): at a slow jog a foot lands as the other leaves, with no flight. */
export function gaitAt(speed: number): Gait {
  const cadence = STEP_RATE_AT_REST + STEP_RATE_PER_SPEED * speed;
  const contact = Math.min(CONTACT_LENGTH / speed, 1 / cadence);
  return {
    speed,
    cadence,
    step: speed / cadence,
    contact,
    flight: 1 / cadence - contact,
    swing: Math.min(SWING_MOST, SWING_PER_SPEED * speed),
  };
}

/** A foot's own phase in the stride: the left's from its landing, the right's half a stride on. */
const own = (phase: number, side: Side) => (side === "left" ? phase : (phase + 0.5) % 1);

/**
 * Where a foot is at a phase of the stride, from the ground under the hips: how far its ankle is ahead (behind,
 * negative) and up, and whether it is planted. Planted, it goes back at the body's speed, the heel rising over the second
 * half of the stance as the foot pushes off its ball; swung, it comes forward the contact length, eased, the heel
 * rising early to the gait's swing and down again to land.
 */
export function footAt(gait: Gait, phase: number, side: Side) {
  const p = own(phase, side);
  const stance = (gait.contact * gait.cadence) / 2;
  const length = gait.speed * gait.contact;
  const landing = LANDING_AHEAD * length;
  if (p < stance) {
    const u = p / stance;
    return { ahead: landing - u * length, up: HEEL_RISE * Math.max(0, 2 * u - 1) ** 2, planted: true };
  }
  const u = (p - stance) / (1 - stance);
  // From the pushed-off heel's height, eased in, so the swing begins where the stance ends.
  const lift = HEEL_RISE * (1 - u) ** 2;
  return {
    ahead:
      landing -
      length +
      (length * (1 - Math.cos(Math.PI * u))) / 2 -
      TRAIL * Math.sin(Math.PI * Math.min(1, u / TRAIL_SHARE)),
    up: Math.max(lift, gait.swing * Math.sin(Math.PI * u ** HEEL_EARLY)),
    planted: false,
  };
}

/** How far the hips are above their mean at a phase: lowest mid-stance, highest a half step on. */
export function bounceAt(gait: Gait, phase: number) {
  const midStance = (gait.contact * gait.cadence) / 4;
  return -BOUNCE * Math.cos(4 * Math.PI * (phase - midStance));
}

/** How far an arm swings forward from hanging at a phase (radians): back as its own foot lands, forward a step on. */
export const armAt = (phase: number, side: Side) => -ARM_BACK - ARM_SWING * Math.cos(2 * Math.PI * own(phase, side));

/** The stride's phase after covering some ground: on by the ground over a stride (two steps), round and round. */
export const phaseAfter = (phase: number, ground: number, gait: Gait) => (phase + ground / (2 * gait.step)) % 1;

/** How much of the run is drawn after a frame: towards all of it while running, none walking, over `RUN_BLEND`. */
export function blendTowards(weight: number, running: boolean, seconds: number): number {
  const step = seconds / RUN_BLEND;
  return running ? Math.min(1, weight + step) : Math.max(0, weight - step);
}

/** A gait is never taken slower than this, in metres a second: a stride's length must stay above nothing. */
export const SLOWEST_GAIT = 1;

/** Where a figure is in its run: its stride's phase, how far into the run it is drawn, and the ground it had covered. */
export interface Running {
  readonly phase: number;
  readonly weight: number;
  readonly walked: number;
}

export const NOT_RUNNING: Running = { phase: 0, weight: 0, walked: 0 };

/**
 * A figure's run after a frame, from how far it has walked in all (metres) and how it moves: running, it eases in and
 * its stride goes on by the ground covered; on the ground otherwise, it eases out; in the air (jumping or falling), the
 * run lets go at once, so no leg reaches for the ground. Its gait is taken at its speed.
 */
export function runAfter(
  running: Running,
  how: "run" | "ground" | "air",
  speed: number,
  walked: number,
  seconds: number,
): Running {
  const gait = gaitAt(Math.max(SLOWEST_GAIT, speed));
  const ground = Math.max(0, walked - running.walked);
  const weight = how === "air" ? 0 : blendTowards(running.weight, how === "run", seconds);
  return { phase: phaseAfter(running.phase, ground, gait), weight, walked };
}
