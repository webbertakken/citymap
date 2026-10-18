import { describe, expect, it } from "vitest";
import type { Flight } from "./flyer";
import {
  CEILING,
  CLIMB_MOST,
  HARD_HIT,
  HELI_MASS,
  HOVER_TILT,
  LAND_SINK,
  PAD_CENTRED,
  PAD_PULL,
  PITCH_MOST,
  ROLL_MOST,
  ROTOR_RADIUS,
  SINK_MOST,
  SPIN_DOWN,
  SPIN_UP,
  THRUST_MOST,
  YAW_MOST,
  flyHeli,
  groundEffect,
  heliHud,
  hoverShare,
  parkedHeli,
  started,
  thrustDirection,
  touched,
  type Heli,
} from "./helicopter";
import { GRAVITY } from "./walker";

const DT = 1 / 120;
const STILL: Flight = { forward: 0, right: 0, up: 0 };
const UP: Flight = { ...STILL, up: 1 };
const DOWN: Flight = { ...STILL, up: -1 };

/** A helicopter hovering at full rotor speed, engine on, at a height. */
const hovering = (y: number): Heli => ({ ...started(parkedHeli()), rotor: 1, grounded: false, hold: y });

interface Flown {
  readonly heli: Heli;
  readonly y: number;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly lost: number;
}

/**
 * Flies `seconds` from a state over flat ground at y = 0 with nothing in the way: each step flown, then moved by its
 * velocity, landing on the ground below. Every step kept.
 */
function fly(
  start: Heli,
  flight: Flight,
  seconds: number,
  from: { y: number; heading?: number },
  pad: { x: number; z: number } | null = null,
) {
  const path: Flown[] = [];
  let heli = start;
  let { y } = from;
  let x = 0;
  let z = 0;
  let heading = from.heading ?? 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const step = flyHeli(heli, { y, heading }, flight, y, DT, pad && { x: pad.x - x, z: pad.z - z });
    const v = step.heli.velocity;
    const next = y + v.y * DT;
    const grounded = next <= 0;
    const moved = { x: v.x * DT, y: grounded ? -y : v.y * DT, z: v.z * DT };
    const contact = touched(step.heli, moved, DT, grounded, step.heading);
    heli = contact.heli;
    x += moved.x;
    z += moved.z;
    y += moved.y;
    heading = step.heading;
    path.push({ heli, y, x, z, heading, lost: contact.lost });
  }
  return path;
}
const last = <T>(path: readonly T[]) => path.at(-1)!;
const speedOf = (heli: Heli) => Math.hypot(heli.velocity.x, heli.velocity.z);

describe("the rotor", () => {
  it("spins up with the engine on, over five seconds, and stays on the ground with the collective down", () => {
    const path = fly(started(parkedHeli()), STILL, 6, { y: 0 });
    const full = path.findIndex((s) => s.heli.rotor === 1);
    expect(full * DT).toBeCloseTo(1 / SPIN_UP, 1);
    expect(path.every((s) => s.y === 0 && s.heli.grounded)).toBe(true);
    expect(last(path).heli.collective).toBe(0);
  });

  it("spins down with the engine off, more slowly than it spun up", () => {
    const path = fly({ ...hovering(0), grounded: true, engine: false, hold: null }, STILL, 20, { y: 0 });
    const still = path.findIndex((s) => s.heli.rotor === 0);
    expect(still * DT).toBeCloseTo(1 / SPIN_DOWN, 1);
    expect(1 / SPIN_DOWN).toBeGreaterThan(1 / SPIN_UP);
  });

  it("turns the blades and the tail rotor as fast as the rotor spins", () => {
    const slow = flyHeli({ ...hovering(0), grounded: true, rotor: 0.5 }, { y: 0, heading: 0 }, STILL, 0, DT).heli;
    const fast = flyHeli({ ...hovering(0), grounded: true }, { y: 0, heading: 0 }, STILL, 0, DT).heli;
    expect(fast.blades).toBeGreaterThan(slow.blades * 1.9);
    expect(fast.tail).toBeGreaterThan(fast.blades);
    const parked = flyHeli(parkedHeli(), { y: 0, heading: 0 }, STILL, 0, DT).heli;
    expect(parked.blades).toBe(0);
  });

  it("cannot lift until the rotor turns fast enough to hold the helicopter up", () => {
    const path = fly(started(parkedHeli()), UP, 8, { y: 0 });
    const off = path.findIndex((s) => s.y > 0);
    expect(off).toBeGreaterThan(0);
    expect(path[off]!.heli.rotor).toBeGreaterThanOrEqual(hoverShare(0) - 0.01);
    expect(hoverShare(0)).toBeGreaterThan(0.6);
    expect(last(path).y).toBeGreaterThan(5);
  });
});

describe("ground effect", () => {
  it("adds most lift with the skids on the ground, fading to nothing a rotor's breadth up", () => {
    expect(groundEffect(0)).toBeGreaterThan(1.2);
    expect(groundEffect(0)).toBeLessThan(1.3);
    expect(groundEffect(2)).toBeLessThan(groundEffect(0));
    expect(groundEffect(2 * ROTOR_RADIUS)).toBeLessThan(1.02);
    expect(groundEffect(Infinity)).toBe(1);
  });

  it("lifts a hover held near the ground a little higher: a cushion, where high up it holds", () => {
    const low = last(fly(hovering(1), STILL, 20, { y: 1 }));
    expect(low.y).toBeGreaterThan(1.3);
    expect(low.y).toBeLessThan(3);
    const high = last(fly(hovering(50), STILL, 20, { y: 50 }));
    expect(Math.abs(high.y - 50)).toBeLessThan(0.05);
  });
});

describe("the collective, assisted", () => {
  it("holds its height, level and still, when nothing is held", () => {
    const end = last(fly(hovering(50), STILL, 10, { y: 50 }));
    expect(Math.abs(end.y - 50)).toBeLessThan(0.05);
    expect(Math.abs(end.heli.velocity.y)).toBeLessThan(0.01);
    expect(Math.abs(end.heli.pitch)).toBeLessThan(0.001);
    expect(Math.abs(end.heli.roll)).toBeLessThan(0.001);
  });

  it("climbs at its most when Up is held, and holds about where it was let go", () => {
    const climb = fly(hovering(50), UP, 6, { y: 50 });
    expect(last(climb).heli.velocity.y).toBeCloseTo(CLIMB_MOST, 0);
    const released = last(climb);
    const after = fly(released.heli, STILL, 15, { y: released.y });
    const highest = Math.max(...after.map((s) => s.y));
    expect(highest - released.y).toBeLessThan(5);
    expect(Math.abs(last(after).y - highest)).toBeLessThan(5);
    expect(Math.abs(last(after).heli.velocity.y)).toBeLessThan(0.05);
  });

  it("sinks at its most when Down is held, slows near the ground, and lands softly", () => {
    const path = fly(hovering(60), DOWN, 30, { y: 60 });
    expect(Math.min(...path.map((s) => s.heli.velocity.y))).toBeCloseTo(-SINK_MOST, 0);
    const down = path.findIndex((s) => s.heli.grounded);
    expect(down).toBeGreaterThan(0);
    expect(path[down - 1]!.heli.velocity.y).toBeGreaterThan(-LAND_SINK - 0.5);
    expect(path.every((s) => s.lost < HARD_HIT)).toBe(true);
    // Down on its skids, the collective lowered: it stays down.
    expect(last(path).y).toBe(0);
    expect(last(path).heli.collective).toBe(0);
  });

  it("climbs no higher than its ceiling", () => {
    const end = last(fly(hovering(CEILING - 20), UP, 30, { y: CEILING - 20 }));
    expect(end.y).toBeLessThanOrEqual(CEILING + 0.5);
    expect(end.y).toBeGreaterThan(CEILING - 1);
  });

  it("holds its height while it flies forward, the collective making up for the tilt", () => {
    const path = fly(hovering(80), { ...STILL, forward: 1 }, 20, { y: 80 });
    expect(Math.max(...path.map((s) => Math.abs(s.y - 80)))).toBeLessThan(1);
  });
});

describe("the cyclic, assisted", () => {
  it("tilts its nose down as far as forward asks, and flies along its heading", () => {
    const path = fly(hovering(80), { ...STILL, forward: 1 }, 4, { y: 80, heading: Math.PI / 2 });
    const end = last(path);
    expect(Math.max(...path.map((s) => s.heli.pitch))).toBeCloseTo(PITCH_MOST, 2);
    // A heading of π/2 faces −z.
    expect(end.z).toBeLessThan(-5);
    expect(Math.abs(end.x)).toBeLessThan(0.01);
  });

  it("tops out at about 200 km/h", () => {
    const end = last(fly(hovering(80), { ...STILL, forward: 1 }, 90, { y: 80 }));
    expect(speedOf(end.heli) * 3.6).toBeGreaterThan(185);
    expect(speedOf(end.heli) * 3.6).toBeLessThan(215);
  });

  it("flies backwards, nose up, when back is held", () => {
    const end = last(fly(hovering(80), { ...STILL, forward: -1 }, 3, { y: 80 }));
    expect(end.heli.pitch).toBeCloseTo(-PITCH_MOST, 2);
    expect(end.x).toBeLessThan(-2);
  });

  it("levels itself and slows to a hover when let go at speed", () => {
    const fast = last(fly(hovering(80), { ...STILL, forward: 1 }, 15, { y: 80 }));
    const after = fly(fast.heli, STILL, 40, { y: fast.y });
    expect(Math.max(...after.slice(120).map((s) => s.heli.pitch))).toBeLessThanOrEqual(0.001);
    expect(Math.min(...after.map((s) => s.heli.pitch))).toBeGreaterThanOrEqual(-HOVER_TILT - 0.01);
    expect(speedOf(last(after).heli)).toBeLessThan(0.5);
    expect(Math.abs(last(after).heli.pitch)).toBeLessThan(0.01);
  });

  it("answers the cyclic only as far as the rotor turns", () => {
    const slow = flyHeli({ ...hovering(80), rotor: 0 }, { y: 80, heading: 0 }, { ...STILL, forward: 1 }, 80, DT).heli;
    expect(slow.pitchRate).toBe(0);
  });
});

describe("the tail rotor", () => {
  it("turns on the spot in a hover, right clockwise from above, as fast as it turns", () => {
    const path = fly(hovering(50), { ...STILL, right: 1 }, 3, { y: 50 });
    const end = last(path);
    expect(end.heli.yawRate).toBeCloseTo(-YAW_MOST, 1);
    expect(end.heading).toBeLessThan(-2);
    expect(Math.hypot(end.x, end.z)).toBeLessThan(0.05);
    expect(Math.abs(end.heli.roll)).toBeLessThan(0.01);
  });

  it("holds its heading against the main rotor's torque", () => {
    const path = fly(hovering(50), UP, 5, { y: 50, heading: 1 });
    expect(Math.max(...path.map((s) => Math.abs(s.heading - 1)))).toBeLessThan(0.01);
  });

  it("banks into a turn at speed, its way following its nose", () => {
    const fast = last(fly(hovering(80), { ...STILL, forward: 1 }, 10, { y: 80 }));
    const path = fly(fast.heli, { forward: 1, right: 1, up: 0 }, 8, { y: fast.y });
    const end = last(path);
    expect(Math.max(...path.map((s) => s.heli.roll))).toBeGreaterThan(0.2);
    expect(Math.max(...path.map((s) => s.heli.roll))).toBeLessThanOrEqual(ROLL_MOST + 0.01);
    const way = Math.atan2(-end.heli.velocity.z, end.heli.velocity.x);
    expect(Math.abs(Math.atan2(Math.sin(way - end.heading), Math.cos(way - end.heading)))).toBeLessThan(0.3);
    expect(end.heading).toBeLessThan(-1);
    expect(Math.abs(end.y - fast.y)).toBeLessThan(3);
  });

  it("levels its bank once the turn is let go", () => {
    const turning = last(fly(hovering(80), { forward: 1, right: 1, up: 0 }, 12, { y: 80 }));
    const end = last(fly(turning.heli, STILL, 10, { y: turning.y, heading: turning.heading }));
    expect(Math.abs(end.heli.roll)).toBeLessThan(0.01);
    expect(Math.abs(end.heli.yawRate)).toBeLessThan(0.01);
  });
});

describe("the landing assist", () => {
  it("sets it down on a marked roof's middle when it sinks within reach of it, nothing else asked", () => {
    const pad = { x: 2.5, z: -1.5 };
    const path = fly(hovering(20), DOWN, 30, { y: 20, heading: 0.7 }, pad);
    const down = path.find((s) => s.heli.grounded)!;
    expect(down).toBeDefined();
    expect(Math.hypot(down.x - pad.x, down.z - pad.z)).toBeLessThan(0.1);
    expect(Math.max(...path.map((s) => Math.abs(s.heli.pitch)))).toBeLessThanOrEqual(HOVER_TILT + 0.01);
  });

  it("sets it down on the middle from near the edge of its reach, never far past it", () => {
    const pad = { x: -8, z: 4 };
    const path = fly(hovering(30), DOWN, 60, { y: 30, heading: 2 }, pad);
    const down = path.find((s) => s.heli.grounded)!;
    expect(Math.hypot(down.x - pad.x, down.z - pad.z)).toBeLessThan(0.1);
    expect(Math.max(...path.map((s) => Math.hypot(s.x - pad.x, s.z - pad.z)))).toBeLessThan(PAD_PULL);
  });

  it("sinks no faster than a landing until it is over the mark's middle", () => {
    const pad = { x: 3, z: 0 };
    const path = fly(hovering(30), DOWN, 30, { y: 30 }, pad);
    const off = path.filter((s) => Math.hypot(s.x - pad.x, s.z - pad.z) > PAD_CENTRED);
    expect(off.length).toBeGreaterThan(0);
    expect(Math.min(...off.map((s) => s.heli.velocity.y))).toBeGreaterThan(-LAND_SINK - 0.2);
    // Once over it, it sinks at its most.
    expect(Math.min(...path.map((s) => s.heli.velocity.y))).toBeLessThan(-SINK_MOST + 0.5);
  });

  it("pulls nothing beyond its reach, nor while the cyclic or a turn is asked, nor holding height", () => {
    const far = last(fly(hovering(20), DOWN, 3, { y: 20 }, { x: PAD_PULL + 0.5, z: 0 }));
    expect(Math.hypot(far.x, far.z)).toBeLessThan(0.01);
    const turning = last(fly(hovering(20), { ...DOWN, right: 1 }, 3, { y: 20 }, { x: 2, z: 0 }));
    expect(Math.hypot(turning.x, turning.z)).toBeLessThan(0.01);
    const held = last(fly(hovering(20), STILL, 3, { y: 20 }, { x: 2, z: 0 }));
    expect(Math.hypot(held.x, held.z)).toBeLessThan(0.01);
  });
});

describe("on its skids", () => {
  it("neither turns nor tilts on the ground, and stops sliding", () => {
    const path = fly(
      { ...hovering(0), grounded: true, hold: null, velocity: { x: 3, y: 0, z: 0 } },
      {
        forward: 1,
        right: 1,
        up: 0,
      },
      2,
      { y: 0 },
    );
    const end = last(path);
    expect(end.heading).toBe(0);
    expect(end.heli.pitch).toBe(0);
    expect(end.heli.roll).toBe(0);
    expect(speedOf(end.heli)).toBe(0);
  });
});

describe("thrust", () => {
  it("points up the rotor's axis: tilted ahead nose down, to the right with the right side down", () => {
    const up = thrustDirection(0, 0, 0);
    expect(up).toEqual({ x: 0, y: 1, z: 0 });
    const ahead = thrustDirection(0, 0.3, 0);
    expect(ahead.x).toBeCloseTo(Math.sin(0.3));
    const right = thrustDirection(0, 0, 0.3);
    // A heading of 0 faces +x; its right is +z.
    expect(right.z).toBeCloseTo(Math.sin(0.3));
    const tilted = thrustDirection(1, 0.2, -0.4);
    expect(Math.hypot(tilted.x, tilted.y, tilted.z)).toBeCloseTo(1, 12);
  });

  it("can lift its weight with a margin to climb, and no more", () => {
    expect(THRUST_MOST / (HELI_MASS * GRAVITY)).toBeGreaterThan(1.3);
    expect(hoverShare(Infinity)).toBeCloseTo(Math.sqrt((HELI_MASS * GRAVITY) / THRUST_MOST), 10);
    expect(hoverShare(0)).toBeLessThan(hoverShare(Infinity));
  });
});

describe("contact", () => {
  it("keeps its velocity on a free move", () => {
    const heli = { ...hovering(10), velocity: { x: 10, y: 1, z: 0 } };
    const { heli: after, lost } = touched(heli, { x: 10 * DT, y: DT, z: 0 }, DT, false, 0);
    expect(after).toEqual(heli);
    expect(lost).toBe(0);
  });

  it("loses the speed a wall takes, a soft touch sliding on", () => {
    const heli = { ...hovering(10), velocity: { x: 3, y: 0, z: 1 } };
    const { heli: after, lost } = touched(heli, { x: 0, y: 0, z: DT }, DT, false, 0);
    expect(after.velocity.x).toBe(0);
    expect(after.velocity.z).toBeCloseTo(1, 10);
    expect(lost).toBeCloseTo(3, 10);
    expect(after.rotor).toBe(1);
  });

  it("strikes its rotor on a hard hit: it loses rotor speed and is jolted", () => {
    const heli = { ...hovering(10), velocity: { x: 20, y: 0, z: 0 } };
    const { heli: after, lost } = touched(heli, { x: 0, y: 0, z: 0 }, DT, false, 0);
    expect(lost).toBe(20);
    expect(after.rotor).toBeLessThan(0.7);
    expect(after.rotor).toBeGreaterThanOrEqual(0.5);
    expect(after.pitchRate).toBeLessThan(0);
    expect(after.hits).toBe(1);
    expect(after.hit).toBe(20);
  });

  it("settles level on its skids when it lands, its fall the speed lost", () => {
    const heli = { ...hovering(1), velocity: { x: 0, y: -1.2, z: 0 }, pitch: 0.05, rollRate: 0.2, yawRate: 0.3 };
    const { heli: after, lost } = touched(heli, { x: 0, y: -0.01, z: 0 }, DT, true, 0);
    expect(after.grounded).toBe(true);
    expect(after.velocity.y).toBe(0);
    expect(after.pitch).toBe(0);
    expect(after.rollRate).toBe(0);
    expect(after.yawRate).toBe(0);
    expect(after.hold).toBeNull();
    expect(lost).toBeCloseTo(1.2, 10);
  });

  it("is airborne again once its skids leave the ground", () => {
    const heli = { ...hovering(0), grounded: true, velocity: { x: 0, y: 0.5, z: 0 } };
    expect(touched(heli, { x: 0, y: 0.5 * DT, z: 0 }, DT, false, 0).heli.grounded).toBe(false);
  });

  it("stops falling when its rotor rests on a building beside it, as a hit", () => {
    const heli = { ...hovering(10), velocity: { x: 0, y: -8, z: 0 } };
    const { heli: after, lost } = touched(heli, { x: 0, y: 0, z: 0 }, DT, false, 0);
    expect(after.velocity.y).toBe(0);
    expect(lost).toBe(8);
    expect(after.grounded).toBe(false);
  });
});

describe("the helicopter's HUD", () => {
  it("shows its height, its climb, its speed and its rotor", () => {
    const heli = { ...hovering(42.4), rotor: 0.874, velocity: { x: 10, y: -2.46, z: 0 } };
    expect(heliHud(heli, 42.4)).toEqual({ altitude: 42, climb: -2.5, speed: 36, rotor: 87 });
    expect(heliHud({ ...heli, velocity: { x: 0, y: 0.04, z: 0 } }, 0.2).climb).toBe(0);
  });
});
