// The single-track core: a two-wheeled machine's lean and steering by the linearised Whipple equations, with the
// matrices worked out from its build (Meijaard, Papadopoulos, Ruina and Schwab 2007, appendix A), so the bicycle and
// the motorbike are one physics with two builds. A simulated rider balances it (steering asks for a turn, the rider
// leans into it by torque on the bars, and at walking pace helps with the body); the weight moves between the wheels
// as it speeds up and slows, lifting one when the other takes it all; the tyres hold what their grip allows; a foot
// goes down at a stop; and a rider is thrown, lies a moment and gets back up. Pure. The build's own axes are the
// paper's: x ahead from the back contact, z down; lean and steer here are positive to the left, turns anticlockwise
// (the equations are linear, so flipping both leaves the matrices as they are). Metres, kilograms, seconds.

/** A wheel: its radius, mass, and its moments of inertia about its diameter and its axle. */
export interface Wheel {
  readonly radius: number;
  readonly mass: number;
  readonly ixx: number;
  readonly iyy: number;
}

/** A frame (the back frame with its rider, or the front frame: fork and bars): its middle, mass and inertia. */
export interface Frame {
  readonly x: number;
  readonly z: number;
  readonly mass: number;
  readonly ixx: number;
  readonly iyy: number;
  readonly izz: number;
  readonly ixz: number;
}

/** A single-track machine's build: the paper's 25 parameters, gravity aside. */
export interface Build {
  readonly wheelbase: number;
  readonly trail: number;
  /** The steering axis' tilt from upright, in radians. */
  readonly tilt: number;
  readonly back: Wheel;
  readonly body: Frame;
  readonly fork: Frame;
  readonly front: Wheel;
}

/** A two by two matrix, rows first. */
export type Matrix = readonly [readonly [number, number], readonly [number, number]];

/** The equations' matrices: mass, the speed's damping, gravity's stiffness and the speed's stiffness. */
export interface Matrices {
  readonly M: Matrix;
  readonly C1: Matrix;
  readonly K0: Matrix;
  readonly K2: Matrix;
}

/** The whole machine's mass, its middle (ahead and down, the paper's z), from its build. */
export function massOf(build: Build) {
  const { back, body, fork, front, wheelbase: w } = build;
  const mass = back.mass + body.mass + fork.mass + front.mass;
  const x = (body.x * body.mass + fork.x * fork.mass + w * front.mass) / mass;
  const z = (-back.radius * back.mass + body.z * body.mass + fork.z * fork.mass - front.radius * front.mass) / mass;
  return { mass, x, z };
}

/** The Whipple matrices of a build: appendix A of the paper, term by term. */
export function matricesOf(build: Build, gravity: number): Matrices & { readonly gravity: number } {
  const { back: R, body: B, fork: H, front: F, wheelbase: w, trail: c, tilt: lambda } = build;
  const T = massOf(build);
  const sin = Math.sin(lambda);
  const cos = Math.cos(lambda);
  // The whole machine about the back contact.
  const ITxx =
    R.ixx +
    B.ixx +
    H.ixx +
    F.ixx +
    R.mass * R.radius ** 2 +
    B.mass * B.z ** 2 +
    H.mass * H.z ** 2 +
    F.mass * F.radius ** 2;
  const ITxz = B.ixz + H.ixz - B.mass * B.x * B.z - H.mass * H.x * H.z + F.mass * w * F.radius;
  const ITzz = R.ixx + B.izz + H.izz + F.ixx + B.mass * B.x ** 2 + H.mass * H.x ** 2 + F.mass * w ** 2;
  // The front assembly: fork and front wheel together.
  const mA = H.mass + F.mass;
  const xA = (H.x * H.mass + w * F.mass) / mA;
  const zA = (H.z * H.mass - F.radius * F.mass) / mA;
  const IAxx = H.ixx + F.ixx + H.mass * (H.z - zA) ** 2 + F.mass * (F.radius + zA) ** 2;
  const IAxz = H.ixz - H.mass * (H.x - xA) * (H.z - zA) + F.mass * (w - xA) * (F.radius + zA);
  const IAzz = H.izz + F.ixx + H.mass * (H.x - xA) ** 2 + F.mass * (w - xA) ** 2;
  // Its middle's distance from the steering axis, and its inertia about that axis.
  const uA = (xA - w - c) * cos - zA * sin;
  const IAll = mA * uA ** 2 + IAxx * sin ** 2 + 2 * IAxz * sin * cos + IAzz * cos ** 2;
  const IAlx = -mA * uA * zA + IAxx * sin + IAxz * cos;
  const IAlz = mA * uA * xA + IAxz * sin + IAzz * cos;
  const mu = (c / w) * cos;
  // The wheels' spin: their gyroscopic part.
  const SR = R.iyy / R.radius;
  const SF = F.iyy / F.radius;
  const ST = SR + SF;
  const SA = mA * uA + mu * T.mass * T.x;
  const mixed = IAlx + mu * ITxz;
  return {
    gravity,
    M: [
      [ITxx, mixed],
      [mixed, IAll + 2 * mu * IAlz + mu ** 2 * ITzz],
    ],
    K0: [
      [T.mass * T.z, -SA],
      [-SA, -SA * sin],
    ],
    K2: [
      [0, ((ST - T.mass * T.z) / w) * cos],
      [0, ((SA + SF * sin) / w) * cos],
    ],
    C1: [
      [0, mu * ST + SF * cos + (ITxz / w) * cos - mu * T.mass * T.z],
      [-(mu * ST + SF * cos), (IAlz / w) * cos + mu * (SA + (ITzz / w) * cos)],
    ],
  };
}

/** The machine's lean and steering: angles in radians and their rates, positive to the left. */
export interface Lean {
  readonly lean: number;
  readonly leanRate: number;
  readonly steer: number;
  readonly steerRate: number;
}

/** Why a rider came off: a hard hit, asking more of the tyres than they hold, or leaning past saving. */
export type FallCause = "hit" | "grip" | "lean";

/** A fall: seconds since the rider was thrown, the side it fell to (1 left, −1 right), why, and how fast it was going. */
export interface Fall {
  readonly time: number;
  readonly side: 1 | -1;
  readonly cause: FallCause;
  readonly speed: number;
}

/**
 * A single-track machine's own state, beyond where it is and what drives it: its lean and steering, the lean the rider
 * aims at, a wheel lifted (`pitch` radians: positive the back wheel, about the front contact; negative the front wheel,
 * about the back one), whether a foot is down, a fall under way, and the phase of the rider's searching at walking pace.
 */
export interface Single extends Lean {
  readonly aim: number;
  readonly pitch: number;
  readonly pitchRate: number;
  readonly footDown: boolean;
  readonly fall: Fall | null;
  readonly wobble: number;
}

/** How the simulated rider rides a machine. */
export interface Rider {
  /** The tightest turn asked for, the most lean asked for (short of grip), and how fast the aim moves (rad/s). */
  readonly turnRadius: number;
  readonly maxLean: number;
  readonly leanSlew: number;
  /**
   * Steering torque per radian of lean off the aim, per radian a second of lean, per radian off the steer that holds
   * the turn, per radian a second of steer; and the most the rider puts through the bars.
   */
  readonly leanGain: number;
  readonly leanRateGain: number;
  readonly steerGain: number;
  readonly steerDamping: number;
  readonly torqueMost: number;
  /** At walking pace the body helps: torque per radian off the aim and per radian a second, fading out by `until`. */
  readonly assistLean: number;
  readonly assistDamping: number;
  readonly assistUntil: number;
  /** The searching at walking pace: a steering torque this strong at a standstill, at this rate, gone by `from`. */
  readonly wobbleTorque: number;
  readonly wobbleHz: number;
  readonly wobbleFrom: number;
  /**
   * A foot goes down below `down` and comes up above `up` (m/s); down, the machine leans onto it at a stop by `lean`
   * (less as it gets going), eased at `ease` rad/s, the bars turned up to `steer` as asked, at `barEase` rad/s.
   */
  readonly foot: {
    readonly down: number;
    readonly up: number;
    readonly lean: number;
    readonly ease: number;
    readonly steer: number;
    readonly barEase: number;
  };
}

/** A single-track machine: its equations, its geometry and weight, its tyres, its rider, and its falls. */
export interface Machine {
  readonly matrices: Matrices & { readonly gravity: number };
  readonly wheelbase: number;
  readonly trail: number;
  readonly tilt: number;
  /** The bars turn this far either way, and stop. */
  readonly steerStop: number;
  /** The machine and rider together, their middle ahead of the back contact and up. */
  readonly mass: number;
  readonly massAhead: number;
  readonly massHeight: number;
  /** How much of its load a tyre holds; turning harder than `leaned` m/s², a skidding tyre slides it from under. */
  readonly grip: number;
  readonly leaned: number;
  /** The most the rider lets each wheel lift: the back under braking, the front under power. */
  readonly stoppieMost: number;
  readonly wheelieMost: number;
  readonly fallLean: number;
  readonly rider: Rider;
}

/** A machine from its build and how it is ridden. */
export function machineOf(
  build: Build,
  gravity: number,
  rest: Omit<Machine, "matrices" | "wheelbase" | "trail" | "tilt" | "mass" | "massAhead" | "massHeight">,
): Machine {
  const middle = massOf(build);
  return {
    ...rest,
    matrices: matricesOf(build, gravity),
    wheelbase: build.wheelbase,
    trail: build.trail,
    tilt: build.tilt,
    mass: middle.mass,
    massAhead: middle.x,
    massHeight: -middle.z,
  };
}

/** Fallen: it slides to a stop at this share of g, lies on its side at this lean, reached over `FALLING`, left over the
 * last `RISING` of `DOWN` seconds, when the rider is back up. */
export const SLIDE = 0.5;
export const LYING = 1.35;
export const FALLING = 0.4;
export const RISING = 0.6;
export const DOWN = 2.5;

export const clamp = (value: number, most: number) => Math.max(-most, Math.min(most, value));
export const towards = (value: number, target: number, step: number) =>
  value < target ? Math.min(target, value + step) : Math.max(target, value - step);

/** A machine standing still, upright, on a foot. */
export const upright = (): Single => ({
  lean: 0,
  leanRate: 0,
  steer: 0,
  steerRate: 0,
  aim: 0,
  pitch: 0,
  pitchRate: 0,
  footDown: true,
  fall: null,
  wobble: 0,
});

/** The stiffness at a speed: gravity's pull and the speed's, on lean (row 0) and steer (row 1). */
export function stiffnessOf(machine: Machine, speed: number): Matrix {
  const { K0, K2, gravity: g } = machine.matrices;
  const v2 = speed * speed;
  return [
    [g * K0[0][0] + v2 * K2[0][0], g * K0[0][1] + v2 * K2[0][1]],
    [g * K0[1][0] + v2 * K2[1][0], g * K0[1][1] + v2 * K2[1][1]],
  ];
}

/**
 * One step of the bare machine at a speed: M q̈ + v C1 q̇ + (g K0 + v² K2) q = T, a lean torque (the rider's body) and a
 * steering torque (the bars), by semi-implicit Euler; the bars stop at the machine's stop.
 */
export function whippleOf(
  machine: Machine,
  q: Lean,
  speed: number,
  leanTorque: number,
  steerTorque: number,
  dt: number,
): Lean {
  const { M, C1 } = machine.matrices;
  const k = stiffnessOf(machine, speed);
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const f0 =
    leanTorque - speed * (C1[0][0] * q.leanRate + C1[0][1] * q.steerRate) - (k[0][0] * q.lean + k[0][1] * q.steer);
  const f1 =
    steerTorque - speed * (C1[1][0] * q.leanRate + C1[1][1] * q.steerRate) - (k[1][0] * q.lean + k[1][1] * q.steer);
  const leanRate = q.leanRate + ((M[1][1] * f0 - M[0][1] * f1) / det) * dt;
  let steerRate = q.steerRate + ((M[0][0] * f1 - M[1][0] * f0) / det) * dt;
  let steer = q.steer + steerRate * dt;
  if (Math.abs(steer) >= machine.steerStop) {
    steer = Math.sign(steer) * machine.steerStop;
    steerRate = 0;
  }
  return { lean: q.lean + leanRate * dt, leanRate, steer, steerRate };
}

/** How fast it turns (anticlockwise, radians a second) at a speed, for its steer: the front wheel's path. */
export const turnOn = (machine: Machine, q: Lean, speed: number) =>
  ((speed * q.steer + machine.trail * q.steerRate) * Math.cos(machine.tilt)) / machine.wheelbase;

/** The lean a turn asks for (right positive asks a right turn): what holds a turn of the radius asked at this speed. */
export const leanAsked = (machine: Machine, right: number, speed: number) =>
  -clamp(
    Math.atan((speed * speed * right) / (machine.rider.turnRadius * machine.matrices.gravity)),
    machine.rider.maxLean,
  );

/**
 * The rider's steering torque towards the lean aimed at: what holds the turn that lean makes (the steady turn's steer
 * and torque), and more for being off the lean, falling, and off that steer.
 */
function riderTorque(machine: Machine, state: Single, speed: number): number {
  const k = stiffnessOf(machine, speed);
  const { rider } = machine;
  const held = clamp((-k[0][0] * state.aim) / k[0][1], machine.steerStop);
  const holding = k[1][0] * state.aim + k[1][1] * held;
  return clamp(
    holding +
      rider.leanGain * (state.lean - state.aim) +
      rider.leanRateGain * state.leanRate +
      rider.steerGain * (held - state.steer) -
      rider.steerDamping * state.steerRate,
    rider.torqueMost,
  );
}

/**
 * One step of the machine's balance at a speed, asked to turn `right`: on a foot, it leans onto it and the bars turn as
 * asked; riding, the rider aims at a lean and steers for it, the body helps at walking pace, and the bars search.
 */
export function balanceOn<S extends Single>(machine: Machine, state: S, speed: number, right: number, dt: number): S {
  const { rider } = machine;
  const { foot } = rider;
  if (state.footDown) {
    const steer = towards(state.steer, -right * foot.steer, foot.barEase * dt);
    // Pushing off, the rider comes upright, so the machine leaves the foot balanced and holds its line.
    const lean = towards(state.lean, foot.lean * Math.max(0, 1 - speed / foot.up), foot.ease * dt);
    return { ...state, lean, leanRate: 0, steer, steerRate: (steer - state.steer) / dt, aim: lean };
  }
  const aim = towards(state.aim, leanAsked(machine, right, speed), rider.leanSlew * dt);
  const aiming = { ...state, aim };
  const fade = Math.max(0, 1 - speed / rider.assistUntil);
  const body = -fade * (rider.assistLean * (state.lean - aim) + rider.assistDamping * state.leanRate);
  const wobble = state.wobble + dt;
  const searching =
    rider.wobbleTorque *
    Math.max(0, 1 - speed / rider.wobbleFrom) ** 2 *
    Math.sin(2 * Math.PI * rider.wobbleHz * wobble);
  return {
    ...aiming,
    ...whippleOf(machine, state, speed, body, riderTorque(machine, aiming, speed) + searching, dt),
    wobble,
  };
}

/**
 * How the weight sits on each wheel, in newtons, accelerating at `a` (forwards positive): braking moves it forwards and
 * pulling away backwards, until all of it is on one wheel and the other would lift.
 */
export function loadsOn(machine: Machine, a: number): { readonly front: number; readonly back: number } {
  const { mass, wheelbase, massAhead, massHeight } = machine;
  const g = machine.matrices.gravity;
  const weight = mass * g;
  const back = (mass * (g * (wheelbase - massAhead) + a * massHeight)) / wheelbase;
  const held = Math.max(0, Math.min(weight, back));
  return { front: weight - held, back: held };
}

/**
 * The acceleration that gives itself: the loads depend on the acceleration they allow, and `net(a) − a` falls as `a`
 * rises (a tyre's hold moves at most grip · h / w < 1 of the acceleration), so it is found by halving between ±3 g.
 */
export function settled(net: (accel: number) => number, gravity: number, rounds: number): number {
  let low = -3 * gravity;
  let high = 3 * gravity;
  for (let i = 0; i < rounds; i++) {
    const mid = (low + high) / 2;
    if (net(mid) > mid) low = mid;
    else high = mid;
  }
  // Its own net force at that acceleration: exactly nothing when nothing pushes or holds it.
  return net((low + high) / 2);
}

/**
 * One step of a wheel lifting: the back about the front contact under a deceleration (`pitch` positive), or the front
 * about the back contact under an acceleration (`pitch` negative); held by the rider short of going over, and by the
 * road below.
 */
export function pitchedOn(machine: Machine, state: Single, accel: number, dt: number) {
  const g = machine.matrices.gravity;
  const h = machine.massHeight;
  const lifting = (arm: number, push: number, angle: number, rate: number, most: number) => {
    const height = arm * Math.sin(angle) + h * Math.cos(angle);
    const lever = arm * Math.cos(angle) - h * Math.sin(angle);
    const next = rate + ((push * height - g * lever) / (arm * arm + h * h)) * dt;
    const at = angle + next * dt;
    if (at <= 0) return { angle: 0, rate: 0 };
    if (at >= most) return { angle: most, rate: Math.min(0, next) };
    return { angle: at, rate: next };
  };
  if (state.pitch > 0 || (state.pitch === 0 && accel < 0)) {
    const back = lifting(
      machine.wheelbase - machine.massAhead,
      -accel,
      state.pitch,
      state.pitchRate,
      machine.stoppieMost,
    );
    return { pitch: back.angle, pitchRate: back.rate };
  }
  const front = lifting(machine.massAhead, accel, -state.pitch, -state.pitchRate, machine.wheelieMost);
  // Taken from nothing, so a front wheel on the road is a pitch of 0, never −0.
  return { pitch: 0 - front.angle, pitchRate: 0 - front.rate };
}

/**
 * What the tyres hold sideways in a turn, in m/s²: what a lean balances, g tan φ. Below a walking pace a lean is the
 * machine falling over, not turning, and asks nothing of them. (The path's own curvature, v times the turn, spikes as
 * the rider countersteers, while the tyres' load follows the lean.)
 */
export const sidewaysOn = (machine: Machine, lean: number, speed: number) =>
  Math.abs(speed) > machine.rider.foot.up ? machine.matrices.gravity * Math.tan(lean) : 0;

/** What a tyre holds along its way, as a share of its load, beside what a turn already takes (its friction circle). */
export const besideOn = (machine: Machine, sideways: number) =>
  Math.sqrt(Math.max(0, machine.grip * machine.grip - (sideways / machine.matrices.gravity) ** 2));

/** The machine thrown down at a speed, falling the way it leans (left when upright). */
export function thrownOn<S extends Single>(state: S, cause: FallCause, speed: number): S {
  const side = state.lean < 0 ? -1 : 1;
  return { ...state, fall: { time: 0, side, cause, speed: Math.abs(speed) }, pitch: 0, pitchRate: 0 };
}

/**
 * One step of a fall: it slides to a stop on its side, lies, and rises; then the rider is back up, on it, a foot down
 * (`up` gives that state).
 */
export function fallingOn<S extends Single>(
  machine: Machine,
  state: S,
  fall: Fall,
  speed: number,
  dt: number,
  up: (state: S) => S,
): { readonly state: S; readonly speed: number; readonly turn: number } {
  const time = fall.time + dt;
  if (time >= DOWN) return { state: up(state), speed: 0, turn: 0 };
  const down = Math.min(1, time / FALLING, (DOWN - time) / RISING);
  const lean = fall.side * LYING * down;
  const slid = towards(speed, 0, SLIDE * machine.matrices.gravity * dt);
  return {
    state: { ...state, lean, leanRate: 0, steerRate: 0, aim: lean, fall: { ...fall, time } },
    speed: slid,
    turn: 0,
  };
}

/**
 * The machine after its balance at a new speed, and its turn: the foot (down below a walking pace, up above it), then
 * whether the tyres held (`slid`: a brake skidding in a turn) and whether it leaned past saving. A lifted front wheel
 * steers nothing, and the rider holds it upright meanwhile.
 */
export function ridden<S extends Single>(
  machine: Machine,
  state: S,
  speed: number,
  right: number,
  slid: boolean,
  dt: number,
): { readonly state: S; readonly turn: number } {
  const { foot } = machine.rider;
  const footDown = state.footDown ? Math.abs(speed) < foot.up : Math.abs(speed) < foot.down;
  const wheelie = state.pitch < 0;
  const balance = balanceOn(machine, { ...state, footDown }, Math.max(0, speed), wheelie ? 0 : right, dt);
  const turn = wheelie ? 0 : turnOn(machine, balance, speed);
  const overGrip = slid || Math.abs(sidewaysOn(machine, balance.lean, speed)) > machine.grip * machine.matrices.gravity;
  const fallen =
    Math.abs(balance.lean) > machine.fallLean
      ? thrownOn(balance, "lean", speed)
      : overGrip
        ? thrownOn(balance, "grip", speed)
        : balance;
  return { state: fallen, turn: fallen.fall ? 0 : turn };
}
