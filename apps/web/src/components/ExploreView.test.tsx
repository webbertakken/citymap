import { buildScene } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { GROUND, type Walls } from "@citymap/world";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Landing } from "../explore/landing";
import { METRE } from "../explore/street";
import {
  ExploreView,
  STICK_REACH,
  type ExploreCanvasProps,
  type ExploreFrame,
  type ExploreViewProps,
} from "./ExploreView";
import { city } from "./testing/fixtures";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Open ground at the walking height: every move is taken. */
const open: Walls = {
  move: (feet, delta) => {
    const y = feet.y + delta.y;
    return { feet: { x: feet.x + delta.x, y: Math.max(GROUND, y), z: feet.z + delta.z }, grounded: y <= GROUND };
  },
  clearance: (from, to) => Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z),
  dispose: () => undefined,
};
const theme = THEMES["paper-atlas"];
const scene = buildScene(city("alpha"), theme);
// On a street running east through the landing: the bicycle parks 4 m ahead at the kerb, the car 10 m.
const landing: Landing = {
  at: { x: 1, z: 2 },
  heading: 0,
  kind: "road",
  road: { at: { x: 1, z: 2 }, along: { x: 1, z: 0 }, width: 1 },
};

let frame: ExploreCanvasProps["frame"] = () => {
  throw new Error("no canvas");
};
/** Hands the walk's frame to the test, as the real canvas calls it each frame. */
function StubCanvas(props: ExploreCanvasProps) {
  useEffect(() => {
    frame = props.frame;
  });
  return <p data-testid="explore-canvas" />;
}

const show = (onLeave = vi.fn<ExploreViewProps["onLeave"]>()) => {
  render(
    <ExploreView
      name="alpha"
      scene={scene}
      table={new Float32Array(4)}
      theme={theme}
      walls={open}
      landing={landing}
      engine="Rapier"
      Canvas={StubCanvas}
      onLeave={onLeave}
    />,
  );
  return onLeave;
};
const view = () => screen.getByRole("application");
/** Holds a key for so many tenths of a second, then lets it go. */
const hold = (code: string, tenths: number) => {
  fireEvent.keyDown(window, { code });
  for (let i = 0; i < tenths; i++) walk();
  fireEvent.keyUp(window, { code });
};
/** Up the street and across to the kerb: 4 m ahead and 3.2 m to the right lies the bicycle, 10 m ahead the car. */
const toTheKerb = (ahead: number) => {
  hold("KeyW", ahead);
  hold("KeyD", 20);
};
const walk = (seconds = 0.1): ExploreFrame => {
  let now: ExploreFrame | null = null;
  act(() => {
    now = frame(seconds);
  });
  return now!;
};

describe("ExploreView", () => {
  it("stands at the landing, says how to walk and which engine it runs on, and has the keyboard", () => {
    show();
    const start = walk(0);
    expect(start.session.body.feet).toEqual({ x: 1 / METRE, y: GROUND, z: 2 / METRE });
    expect(screen.getByRole("region", { name: "On foot" }).textContent).toContain("Physics prototype: Rapier");
    expect(view().getAttribute("aria-label")).toContain("W A S D or the arrow keys walk");
    expect(document.activeElement).toBe(view());
  });

  it("walks while a key is held, and stops when it is let go or the page loses focus", () => {
    show();
    const keyW = new KeyboardEvent("keydown", { code: "KeyW", cancelable: true });
    window.dispatchEvent(keyW);
    expect(keyW.defaultPrevented).toBe(true);
    const x = walk().session.body.feet.x;
    expect(x).toBeGreaterThan(1 / METRE);
    fireEvent.keyUp(window, { code: "KeyW" });
    expect(walk().session.body.feet.x).toBe(x);
    fireEvent.keyDown(window, { code: "KeyW" });
    fireEvent.blur(window);
    expect(walk().session.body.feet.x).toBe(x);
  });

  it("draws the walker between its last two steps, and aims the camera from there", () => {
    show();
    fireEvent.keyDown(window, { code: "KeyW" });
    const now = walk(1.5 / 120);
    expect(now.shown.feet.x).toBeGreaterThan(now.session.previous.feet.x);
    expect(now.shown.feet.x).toBeLessThan(now.session.body.feet.x);
    expect(now.camera.target.x).toBe(now.shown.feet.x);
  });

  it("leaves other keys to the page", () => {
    show();
    const keyQ = new KeyboardEvent("keydown", { code: "KeyQ", key: "q", cancelable: true });
    window.dispatchEvent(keyQ);
    expect(keyQ.defaultPrevented).toBe(false);
  });

  it("goes back to the map by Escape or the button, where the walker stands", () => {
    const onLeave = show();
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onLeave).toHaveBeenCalledWith({ x: 1, z: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Back to the map" }));
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it("turns the camera by a drag, and only by the pointer that started it", () => {
    show();
    fireEvent.pointerDown(view(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(view(), { pointerId: 2, clientX: 500, clientY: 100 });
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 160, clientY: 120 });
    const turned = walk(0).session.orbit;
    expect(turned.yaw).toBeLessThan(0);
    fireEvent.pointerUp(view(), { pointerId: 2 });
    fireEvent.pointerUp(view(), { pointerId: 1 });
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 400, clientY: 120 });
    expect(walk(0).session.orbit).toEqual(turned);
  });

  it("walks by the touch stick while a finger holds it, and only by that finger", () => {
    show();
    const stick = document.querySelector(".explore-stick")!;
    fireEvent.pointerDown(stick, { pointerId: 7, clientX: 50, clientY: 500 });
    fireEvent.pointerMove(stick, { pointerId: 8, clientX: 50, clientY: 300 });
    fireEvent.pointerMove(stick, { pointerId: 7, clientX: 50, clientY: 500 - STICK_REACH });
    const z = walk().session.body.feet.z;
    // Pushed up: forward, which faces east here; the drag never turned the camera.
    expect(walk(0).session.orbit.yaw).toBe(0);
    expect(walk().session.body.feet.x).toBeGreaterThan(1 / METRE);
    fireEvent.pointerUp(stick, { pointerId: 8 });
    fireEvent.pointerUp(stick, { pointerId: 7 });
    const x = walk().session.body.feet.x;
    expect(walk().session.body.feet.x).toBe(x);
    expect(z).toBeCloseTo(2 / METRE, 9);
  });

  it("jumps while the jump button is held", () => {
    show();
    const jump = screen.getByRole("button", { name: "Jump" });
    fireEvent.pointerDown(jump, { pointerId: 3 });
    expect(walk(1 / 60).session.body.grounded).toBe(false);
    fireEvent.pointerUp(jump, { pointerId: 3 });
    for (let i = 0; i < 100; i++) walk();
    expect(walk().session.body.grounded).toBe(true);
  });

  it("parks a bicycle and a car by the road, and offers to get on the bicycle within reach", () => {
    show();
    const start = walk(0);
    expect(start.vehicles.map((v) => v.kind)).toEqual(["bicycle", "car"]);
    expect(start.riding).toBeNull();
    expect(screen.queryByRole("button", { name: /Get on the bicycle/ })).toBeNull();
    toTheKerb(25);
    walk();
    expect(screen.getByRole("button", { name: "Get on the bicycle" })).toBeTruthy();
  });

  it("gets on with E or the prompt's button, rides, and says how; off again once stopped", () => {
    show();
    toTheKerb(25);
    const e = new KeyboardEvent("keydown", { code: "KeyE", key: "e", cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    // A held key repeating gets on once.
    fireEvent.keyDown(window, { code: "KeyE", key: "e", repeat: true });
    fireEvent.keyUp(window, { code: "KeyE", key: "e" });
    expect(walk().riding).toBe("bicycle");
    walk();
    expect(screen.getByRole("region", { name: "On the bicycle" }).textContent).toContain("W pedals");
    const off = screen.getByRole("button", { name: "Get off the bicycle" });
    fireEvent.pointerDown(off, { pointerId: 5 });
    fireEvent.click(off);
    expect(walk().riding).toBeNull();
    walk();
    expect(screen.getByRole("region", { name: "On foot" })).toBeTruthy();
  });

  it("says to slow down before getting off, and will not until then", () => {
    show();
    toTheKerb(25);
    fireEvent.keyDown(window, { code: "KeyE", key: "e" });
    walk();
    // Most of a second of pedalling: faster than a rider gets off at, short of the car parked ahead.
    hold("KeyW", 8);
    const slow = screen.getByRole("button", { name: "Slow down to get off the bicycle" });
    expect(slow).toHaveProperty("disabled", true);
  });

  it("gets in the car, and says so", () => {
    show();
    toTheKerb(62);
    walk();
    fireEvent.click(screen.getByRole("button", { name: "Get in the car" }));
    expect(walk().riding).toBe("car");
    walk();
    expect(screen.getByRole("region", { name: "In the car" }).textContent).toContain("W accelerates");
  });

  it("captures a mouse on a click, turns the camera by its movement while captured, and says so in the log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    show();
    // Browsers reject the lock's promise when they refuse it, as well as firing pointerlockerror.
    const lock = vi.fn<() => Promise<void>>(async () => {
      throw new DOMException("refused", "NotAllowedError");
    });
    const element = view();
    element.requestPointerLock = lock;
    fireEvent.pointerDown(view(), { pointerId: 1, pointerType: "mouse", clientX: 10, clientY: 10 });
    expect(lock).toHaveBeenCalledOnce();
    await lock.mock.results[0]!.value.catch(() => undefined);
    Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => element });
    document.dispatchEvent(new Event("pointerlockchange"));
    fireEvent.pointerMove(view(), { pointerId: 1, pointerType: "mouse", movementX: 40, movementY: 10 });
    expect(walk(0).session.orbit.yaw).toBeLessThan(0);
    // Captured, a click no longer asks again.
    fireEvent.pointerDown(view(), { pointerId: 1, pointerType: "mouse" });
    expect(lock).toHaveBeenCalledOnce();
    const exit = vi.fn<() => void>();
    document.exitPointerLock = exit;
    cleanup();
    expect(exit).toHaveBeenCalledOnce();
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: null });
    show();
    document.dispatchEvent(new Event("pointerlockchange"));
    document.dispatchEvent(new Event("pointerlockerror"));
    const lines = info.mock.calls.map(([line]) => String(line));
    expect(lines).toEqual(
      expect.arrayContaining(["explore/pointer-locked", "explore/pointer-released", "explore/pointer-refused"]),
    );
  });

  it("keeps a press on its card from turning the camera", () => {
    show();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Back to the map" }), { pointerId: 4, clientX: 0 });
    fireEvent.pointerMove(view(), { pointerId: 4, clientX: 300 });
    expect(walk(0).session.orbit.yaw).toBe(0);
  });
});
