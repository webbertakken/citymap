import { buildScene } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Landing } from "../explore/landing";
import { GROUND } from "../explore/physics/rapier";
import { METRE } from "../explore/street";
import type { Walls } from "../explore/walker";
import {
  ExploreView,
  STICK_REACH,
  type ExploreCanvasProps,
  type ExploreFrame,
  type ExploreViewProps,
} from "./ExploreView";
import { city } from "./testing/fixtures";

afterEach(cleanup);

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
const landing: Landing = { at: { x: 1, z: 2 }, heading: 0, kind: "road" };

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
const walk = (seconds = 0.1): ExploreFrame => frame(seconds);

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

  it("keeps a press on its card from turning the camera", () => {
    show();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Back to the map" }), { pointerId: 4, clientX: 0 });
    fireEvent.pointerMove(view(), { pointerId: 4, clientX: 300 });
    expect(walk(0).session.orbit.yaw).toBe(0);
  });
});
