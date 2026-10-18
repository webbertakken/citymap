import { describe, expect, it } from "vitest";
import { DEAD_ZONE, PAD_LOOK, RUN_PUSH, WALK_KEYS, intentsOf, padOf, stickAt, type PadState } from "./input";

const keys = (...codes: string[]) => new Set(codes);

describe("intentsOf", () => {
  it("walks by WASD and the arrows, by the keys' places", () => {
    expect(intentsOf(keys("KeyW"), null, false)).toEqual({
      forward: 1,
      right: 0,
      run: false,
      jump: false,
      sink: false,
    });
    expect(intentsOf(keys("ArrowDown", "ArrowLeft"), null, false)).toMatchObject({ forward: -1, right: -1 });
    expect(intentsOf(keys("KeyD"), null, false).right).toBe(1);
    // Opposite keys cancel.
    expect(intentsOf(keys("KeyW", "KeyS"), null, false).forward).toBe(0);
  });

  it("runs with either Shift and jumps with Space or the jump button", () => {
    expect(intentsOf(keys("KeyW", "ShiftRight"), null, false).run).toBe(true);
    expect(intentsOf(keys("Space"), null, false).jump).toBe(true);
    expect(intentsOf(keys(), null, true).jump).toBe(true);
  });

  it("follows a pushed stick over the keys, running when pushed nearly all the way", () => {
    expect(intentsOf(keys("KeyW"), { x: 0.3, y: -0.4 }, false)).toEqual({
      forward: -0.4,
      right: 0.3,
      run: false,
      jump: false,
      sink: false,
    });
    expect(intentsOf(keys(), { x: 0, y: RUN_PUSH }, false).run).toBe(true);
    // A stick at rest leaves the keys in charge.
    expect(intentsOf(keys("KeyW"), { x: 0, y: 0 }, false).forward).toBe(1);
  });

  it("sinks with C, either Control or either Shift, the Down button, or a pad's B", () => {
    for (const code of ["KeyC", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight"])
      expect(intentsOf(keys(code), null, false).sink).toBe(true);
    expect(intentsOf(keys(), null, false, null, true).sink).toBe(true);
    expect(intentsOf(keys(), null, false, { stick: { x: 0, y: 0 }, jump: false, sink: true }).sink).toBe(true);
    expect(intentsOf(keys("KeyW"), null, false).sink).toBe(false);
  });

  it("knows every key it answers to, sinking's too", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ShiftLeft", "Space", "KeyC", "ControlLeft"])
      expect(WALK_KEYS.has(code)).toBe(true);
    expect(WALK_KEYS.has("Escape")).toBe(false);
  });
});

describe("stickAt", () => {
  it("pushes forward for a finger moved up, right for a finger moved right", () => {
    expect(stickAt({ x: 100, y: 100 }, { x: 120, y: 70 }, 40)).toEqual({ x: 0.5, y: 0.75 });
  });

  it("never pushes beyond its reach", () => {
    const stick = stickAt({ x: 0, y: 0 }, { x: 300, y: -400 }, 50);
    expect(stick.x).toBeCloseTo(0.6, 9);
    expect(stick.y).toBeCloseTo(0.8, 9);
  });
});

/** A standard gamepad at rest, with some buttons and axes set. */
const pad = (axes: Partial<Record<number, number>> = {}, held: Partial<Record<number, number>> = {}): PadState => ({
  mapping: "standard",
  axes: [0, 1, 2, 3].map((i) => axes[i] ?? 0),
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (held[i] ?? 0) > 0.5, value: held[i] ?? 0 })),
});
const NONE: readonly boolean[] = [];

describe("padOf", () => {
  it("reads nothing from a pad without the standard mapping", () => {
    expect(padOf({ ...pad(), mapping: "" }, NONE, 1 / 60)).toBeNull();
  });

  it("walks or steers by the left stick, forward up, and rests within its dead zone", () => {
    const read = padOf(pad({ 0: 1, 1: -1 }), NONE, 1 / 60)!;
    expect(read.pad.stick).toEqual({ x: 1, y: 1 });
    expect(padOf(pad({ 0: DEAD_ZONE / 2, 1: -DEAD_ZONE / 2 }), NONE, 1 / 60)!.pad.stick).toEqual({ x: 0, y: 0 });
    // Past the dead zone, it rises from nothing.
    expect(padOf(pad({ 0: (1 + DEAD_ZONE) / 2 }), NONE, 1 / 60)!.pad.stick.x).toBeCloseTo(0.5, 9);
  });

  it("pedals by the right trigger and brakes by the left, as the stick pushed up and pulled down", () => {
    expect(padOf(pad({}, { 7: 0.6 }), NONE, 1 / 60)!.pad.stick.y).toBeCloseTo(0.6, 9);
    expect(padOf(pad({}, { 6: 1 }), NONE, 1 / 60)!.pad.stick.y).toBe(-1);
    expect(padOf(pad({ 1: -1 }, { 7: 1 }), NONE, 1 / 60)!.pad.stick.y).toBe(1);
  });

  it("jumps (or rises) while A is held, sinks while B is, and looks by the right stick, as far as the frame lasts", () => {
    const read = padOf(pad({ 2: 1, 3: -0.5 }, { 0: 1 }), NONE, 0.5)!;
    expect(read.pad.jump).toBe(true);
    expect(read.pad.sink).toBe(false);
    expect(padOf(pad({}, { 1: 1 }), NONE, 0.5)!.pad.sink).toBe(true);
    expect(read.look.dx).toBeCloseTo(PAD_LOOK * 0.5, 9);
    expect(read.look.dy).toBeCloseTo(-PAD_LOOK * 0.5 * ((0.5 - DEAD_ZONE) / (1 - DEAD_ZONE)), 9);
  });

  it("reads a pad with fewer axes and buttons as at rest where it has none", () => {
    const bare = padOf({ mapping: "standard", axes: [], buttons: [] }, NONE, 1 / 60)!;
    expect(bare.pad).toEqual({ stick: { x: 0, y: 0 }, jump: false, sink: false });
    expect(bare.look).toEqual({ dx: 0, dy: 0 });
    expect(bare.presses).toEqual({ use: false, ring: false, fly: false, gears: 0 });
  });

  it("presses each button once, on the frame it goes down", () => {
    const first = padOf(pad({}, { 3: 1, 2: 1, 5: 1, 8: 1 }), NONE, 1 / 60)!;
    expect(first.presses).toEqual({ use: true, ring: true, fly: true, gears: 1 });
    const held = padOf(pad({}, { 3: 1, 2: 1, 5: 1, 8: 1 }), first.pressed, 1 / 60)!;
    expect(held.presses).toEqual({ use: false, ring: false, fly: false, gears: 0 });
    expect(padOf(pad({}, { 4: 1 }), NONE, 1 / 60)!.presses.gears).toBe(-1);
  });
});

describe("intentsOf with a pad", () => {
  it("takes the touch stick first, else the pad's, and jumps on either", () => {
    expect(intentsOf(new Set(), null, false, { stick: { x: 0.5, y: 0 }, jump: true, sink: false })).toEqual({
      forward: 0,
      right: 0.5,
      run: false,
      jump: true,
      sink: false,
    });
    expect(
      intentsOf(new Set(), { x: 0, y: 1 }, false, { stick: { x: 0.5, y: 0 }, jump: false, sink: false }).forward,
    ).toBe(1);
  });
});
