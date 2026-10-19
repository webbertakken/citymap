import { buildScene } from "@citymap/scene";
import type { Hit } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { GROUND, cityWalls, type Footprint, type Walls } from "@citymap/world";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArcadeWhy } from "../explore/descent";
import { SHADOW_DARKEST, SHADOW_LIFT } from "../explore/helicopter";
import type { Inspect } from "../explore/inspect";
import type { Landing } from "../explore/landing";
import type { Garage } from "../explore/physics/garage";
import { roadGrid } from "../explore/signs";
import { METRE } from "../explore/street";
import { parkedBy, standing, type Vehicle } from "../explore/vehicles";
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
  vi.unstubAllGlobals();
  pads = [];
});

/** The gamepads the page sees: none, unless a test connects one. */
let pads: unknown[] = [];
Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads });

/** A standard gamepad at rest but for the axes and buttons given (by index), named as a browser names one. */
const gamepad = (axes: Partial<Record<number, number>> = {}, held: Partial<Record<number, number>> = {}) => ({
  id: "Test pad (STANDARD GAMEPAD)",
  mapping: "standard",
  axes: [0, 1, 2, 3].map((i) => axes[i] ?? 0),
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (held[i] ?? 0) > 0.5, value: held[i] ?? 0 })),
});

/** Web Audio that counts the tones the bell plays. */
let tones = 0;
class CountingAudio {
  readonly currentTime = 0;
  readonly destination = {};
  createOscillator() {
    tones += 1;
    return { frequency: { value: 0 }, connect: () => undefined, start: () => undefined, stop: () => undefined };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: () => undefined,
    };
  }
}

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
/** Hands the walk's frame and signs to the test, as the real canvas calls them each frame. */
let signage: ExploreCanvasProps["signs"] | null = null;
let reportSigns: ExploreCanvasProps["onSigns"] = () => undefined;
function StubCanvas(props: ExploreCanvasProps) {
  useEffect(() => {
    frame = props.frame;
    signage = props.signs;
    reportSigns = props.onSigns;
  });
  return <p data-testid="explore-canvas" />;
}

/**
 * A building straight ahead of the landing (10 m east, 20 m south), where the crosshair looks past the right shoulder
 * (0.6 m further south): 13 m to 23 m east, 16.6 m to 26.6 m south.
 */
const facing: Footprint = {
  lot: 0,
  corners: [
    { x: 13, z: 16.6 },
    { x: 23, z: 16.6 },
    { x: 23, z: 26.6 },
    { x: 13, z: 26.6 },
  ],
  top: 10.3,
};
const lotHit: Hit = {
  kind: "lot",
  town: "alpha",
  townKey: "alpha",
  root: "",
  key: "a",
  path: "src/a.ts",
  use: "source",
  address: "#lots:0.0.0.0",
  vacant: false,
  folder: "src",
  folderLots: 1,
};
/** Four floors, every window lit. */
const lookTable = Float32Array.from([4, 1, 0, 0]);
const inspectAhead: Inspect = (lot) =>
  lot === 0 ? { hit: lotHit, files: ["src/a.ts", "src/b.ts"] } : { hit: null, files: [] };

const show = (
  onLeave = vi.fn<ExploreViewProps["onLeave"]>(),
  sights: {
    footprints?: readonly Footprint[];
    inspect?: Inspect;
    walls?: Walls;
    garage?: Garage | null;
    arcade?: ArcadeWhy | null;
    parked?: readonly Vehicle[];
    engine?: string;
  } = {},
) => {
  render(
    <ExploreView
      name="alpha"
      scene={scene}
      table={lookTable}
      theme={theme}
      walls={sights.walls ?? open}
      footprints={sights.footprints ?? []}
      roads={roadGrid([])}
      inspect={sights.inspect ?? (() => ({ hit: null, files: [] }))}
      landing={landing}
      parked={[...parkedBy(landing, sights.walls ?? open), ...(sights.parked ?? [])]}
      engine={sights.engine ?? "Rapier"}
      garage={sights.garage ?? null}
      arcade={sights.arcade ?? null}
      Canvas={StubCanvas}
      onLeave={onLeave}
    />,
  );
  return onLeave;
};
const view = () => screen.getByRole("application");
const sight = () => screen.getByRole("region", { name: "In sight" });
/** Holds a key for so many tenths of a second, then lets it go. */
const hold = (code: string, tenths: number) => {
  fireEvent.keyDown(window, { code });
  for (let i = 0; i < tenths; i++) walk();
  fireEvent.keyUp(window, { code });
};
/**
 * Up the street and across to a kerb: 4 m ahead and 3.2 m to the right lies the bicycle; 10 m ahead and across the
 * street, to the left, the car.
 */
const toTheKerb = (ahead: number, side = "KeyD") => {
  hold("KeyW", ahead);
  hold(side, 20);
};
const walk = (seconds = 0.1): ExploreFrame => {
  let now: ExploreFrame | null = null;
  act(() => {
    now = frame(seconds);
  });
  return now!;
};

/** The helicopter parked beside the landing (10 m east, 20 m south), its cabin's door within reach, facing east. */
const helicopterAt = (y: number) => standing("helicopter", "helicopter", { x: 10, y, z: 22.3 }, 0);
/** Frames of a tenth of a second until the log says what is wanted, at most so many. */
const until = (lines: () => readonly string[], wanted: string, most: number) => {
  for (let i = 0; i < most && !lines().some((l) => l.startsWith(wanted)); i++) walk();
};
const press = (button: HTMLElement, down: boolean) =>
  down ? fireEvent.pointerDown(button) : fireEvent.pointerUp(button);

/** The prompt's button to get out of the helicopter, once it offers it. */
const getOut = () => screen.queryByRole("button", { name: "Get out of the helicopter" });

/** The bicycle's HUD, while it shows. */
const hud = () => document.querySelector<HTMLElement>(".explore-hud")!;

describe("ExploreView", () => {
  it("hears Escape the moment it is on screen, before its passive effects have run", async () => {
    // Rendered at default priority outside act, as a walk that begins when its walls resolve, React commits, then runs
    // the passive effects in a later task: the gap a busy machine stretches, in which a key must not be lost. The press
    // comes as the commit's mutations are observed, as Testing Library's findBy sees them.
    const acting = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onLeave = vi.fn<ExploreViewProps["onLeave"]>();
    const committed = new Promise<void>((resolve) => {
      const watch = new MutationObserver(() => {
        watch.disconnect();
        resolve();
      });
      watch.observe(host, { childList: true });
    });
    root.render(
      <ExploreView
        name="alpha"
        scene={scene}
        table={lookTable}
        theme={theme}
        walls={open}
        footprints={[]}
        roads={roadGrid([])}
        inspect={() => ({ hit: null, files: [] })}
        landing={landing}
        parked={parkedBy(landing, open)}
        garage={null}
        arcade={null}
        engine="Rapier"
        Canvas={StubCanvas}
        onLeave={onLeave}
      />,
    );
    await committed;
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onLeave).toHaveBeenCalledOnce();
    flushSync(() => root.unmount());
    host.remove();
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", acting);
  });

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
    const keyZ = new KeyboardEvent("keydown", { code: "KeyZ", key: "z", cancelable: true });
    window.dispatchEvent(keyZ);
    expect(keyZ.defaultPrevented).toBe(false);
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

  it("flies the camera freely by F, at a speed the wheel sets, and lands it on the walker by F again", () => {
    show();
    fireEvent.keyDown(window, { code: "KeyF" });
    // A held F lifts once.
    fireEvent.keyDown(window, { code: "KeyF", repeat: true });
    const lifted = walk();
    expect(lifted.session.flyer).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Flying" })).toBeTruthy();
    expect(screen.getByText(/F lands/)).toBeTruthy();
    fireEvent.keyUp(window, { code: "KeyF" });
    fireEvent.wheel(view(), { deltaY: -100 });
    fireEvent.wheel(view(), { deltaY: 0 });
    const faster = walk();
    expect(faster.session.flyer!.speed).toBeGreaterThan(lifted.session.flyer!.speed);
    fireEvent.keyDown(window, { code: "KeyW" });
    const ahead = walk(0.5);
    fireEvent.keyUp(window, { code: "KeyW" });
    expect(ahead.camera.eye).toEqual(ahead.session.flyer!.at);
    expect(ahead.session.body.feet).toEqual(lifted.session.body.feet);
    fireEvent.keyDown(window, { code: "KeyF" });
    expect(walk().session.flyer).toBeNull();
    expect(screen.getByRole("heading", { name: "On foot" })).toBeTruthy();
  });

  it("flies by the touch buttons: Fly, then Up and Down while held, and Fly again to land", () => {
    show();
    expect(screen.queryByRole("button", { name: "Down" })).toBeNull();
    const fly = screen.getByRole("button", { name: "Fly" });
    fireEvent.pointerDown(fly, { pointerId: 4 });
    fireEvent.click(fly);
    const lifted = walk();
    expect(fly.getAttribute("aria-pressed")).toBe("true");
    const up = screen.getByRole("button", { name: "Up" });
    fireEvent.pointerDown(up, { pointerId: 3 });
    const risen = walk(0.5);
    fireEvent.pointerUp(up, { pointerId: 3 });
    expect(risen.session.flyer!.at.y).toBeGreaterThan(lifted.session.flyer!.at.y);
    const down = screen.getByRole("button", { name: "Down" });
    fireEvent.pointerDown(down, { pointerId: 3 });
    const sunk = walk(0.5);
    fireEvent.pointerCancel(down, { pointerId: 3 });
    expect(sunk.session.flyer!.at.y).toBeLessThan(risen.session.flyer!.at.y);
    expect(walk(0.5).session.flyer!.at.y).toBe(sunk.session.flyer!.at.y);
    fireEvent.click(fly);
    walk();
    expect(fly.getAttribute("aria-pressed")).toBe("false");
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
    expect(start.vehicles.map((v) => v.kind)).toEqual(["bicycle", "car", "motorbike"]);
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
    toTheKerb(62, "KeyA");
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

  it("reads the building in the crosshair, and a window as its file, lit or dark", () => {
    show(undefined, { footprints: [facing], inspect: inspectAhead });
    expect(screen.getByText("", { selector: ".explore-crosshair" })).toBeTruthy();
    // Looking a little down along the street, the line meets the building's wall below its first windows.
    walk(0);
    expect(sight().dataset.kind).toBe("building");
    expect(sight().textContent).toContain("a.ts");
    // Looking level, it meets a window on the ground floor: the first of the building's two files, lit.
    fireEvent.pointerDown(view(), { pointerId: 1, clientX: 0, clientY: 100 });
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 0, clientY: 50 });
    walk(0);
    expect(sight().dataset.kind).toBe("window");
    expect(sight().textContent).toContain("Floor 1 of 4");
    expect(sight().textContent).toContain("File 1 of 2");
    expect(sight().textContent).toContain("Lit");
  });

  it("lets a finger scroll the panel without turning the camera, and a click on it capture no mouse", () => {
    show(undefined, { footprints: [facing], inspect: inspectAhead });
    walk(0);
    const lock = vi.fn<() => Promise<void>>(async () => undefined);
    view().requestPointerLock = lock;
    fireEvent.pointerDown(sight(), { pointerId: 9, pointerType: "touch", clientX: 0, clientY: 300 });
    fireEvent.pointerMove(sight(), { pointerId: 9, pointerType: "touch", clientX: 0, clientY: 200 });
    fireEvent.pointerUp(sight(), { pointerId: 9, pointerType: "touch" });
    fireEvent.pointerDown(sight(), { pointerId: 1, pointerType: "mouse" });
    expect(walk(0).session.orbit.pitch).toBeCloseTo(0.25, 9);
    expect(lock).not.toHaveBeenCalled();
  });

  it("shows nothing in sight with nothing in line, or a building it cannot name", () => {
    show(undefined, { footprints: [facing], inspect: () => ({ hit: null, files: [] }) });
    walk(0);
    expect(screen.queryByRole("region", { name: "In sight" })).toBeNull();
    cleanup();
    show();
    walk(0);
    expect(screen.queryByRole("region", { name: "In sight" })).toBeNull();
  });

  it("gives the canvas the buildings to sign and their names, and shows how many signs it put up", () => {
    show(undefined, { footprints: [facing], inspect: inspectAhead });
    expect(signage?.footprints).toEqual([facing]);
    expect(signage?.name(0)).toBe("a.ts +1");
    expect(signage?.roads.nearest(0, 0)).toBeNull();
    expect(view().dataset.signs).toBe("0");
    act(() => reportSigns(3));
    expect(view().dataset.signs).toBe("3");
  });

  it("keeps a press on its card from turning the camera", () => {
    show();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Back to the map" }), { pointerId: 4, clientX: 0 });
    fireEvent.pointerMove(view(), { pointerId: 4, clientX: 300 });
    expect(walk(0).session.orbit.yaw).toBe(0);
  });

  it("shows the bicycle's speed, gear and cadence while riding it, a foot down at a stop, and none on foot", () => {
    show();
    toTheKerb(25);
    expect(screen.queryByRole("region", { name: "Speed, gear and cadence" })).toBeNull();
    fireEvent.keyDown(window, { code: "KeyE" });
    walk();
    expect(hud().getAttribute("aria-label")).toBe("Speed, gear and cadence");
    expect(hud().dataset.foot).toBe("down");
    expect(hud().textContent).toContain("0 km/h");
    expect(hud().textContent).toContain("3 of 7");
    hold("KeyW", 8);
    expect(hud().dataset.foot).toBe("up");
    expect(hud().textContent).not.toContain("0 rpm");
    expect(hud().textContent).not.toContain(" 0 km/h");
    // Shown afresh no more often than the HUD's beat: a frame within it changes nothing.
    const before = hud().textContent;
    fireEvent.keyDown(window, { code: "KeyW" });
    walk(0.01);
    expect(hud().textContent).toBe(before);
    fireEvent.keyUp(window, { code: "KeyW" });
    fireEvent.keyDown(window, { code: "Space" });
    for (let i = 0; i < 30; i++) walk();
    fireEvent.keyUp(window, { code: "Space" });
    fireEvent.keyDown(window, { code: "KeyE" });
    walk();
    walk();
    expect(document.querySelector(".explore-hud")).toBeNull();
  });

  it("changes gear by Q and R, once a press, and by the touch buttons", () => {
    show();
    toTheKerb(25);
    fireEvent.keyDown(window, { code: "KeyE" });
    walk();
    const gear = () => {
      const now = walk();
      return now.session.vehicles.find((v) => v.id === now.session.riding);
    };
    const keyR = new KeyboardEvent("keydown", { code: "KeyR", cancelable: true });
    window.dispatchEvent(keyR);
    expect(keyR.defaultPrevented).toBe(true);
    fireEvent.keyDown(window, { code: "KeyR", repeat: true });
    fireEvent.keyUp(window, { code: "KeyR" });
    expect(gear()).toMatchObject({ cycle: { gear: 3 } });
    fireEvent.keyDown(window, { code: "KeyQ" });
    fireEvent.keyDown(window, { code: "KeyQ" });
    expect(gear()).toMatchObject({ cycle: { gear: 1 } });
    fireEvent.click(screen.getByRole("button", { name: "Gear up" }));
    expect(gear()).toMatchObject({ cycle: { gear: 2 } });
    const down = screen.getByRole("button", { name: "Gear down" });
    fireEvent.pointerDown(down, { pointerId: 2 });
    fireEvent.click(down);
    expect(gear()).toMatchObject({ cycle: { gear: 1 } });
  });

  it("rings the bell by B and the Ring button, on the bicycle only", () => {
    vi.stubGlobal("AudioContext", CountingAudio);
    tones = 0;
    show();
    const keyB = new KeyboardEvent("keydown", { code: "KeyB", cancelable: true });
    window.dispatchEvent(keyB);
    expect(keyB.defaultPrevented).toBe(true);
    expect(tones).toBe(0);
    toTheKerb(25);
    fireEvent.keyDown(window, { code: "KeyE" });
    walk();
    fireEvent.keyDown(window, { code: "KeyB" });
    fireEvent.keyDown(window, { code: "KeyB", repeat: true });
    expect(tones).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Ring" }));
    expect(tones).toBe(8);
  });

  it("turns the jump button into the front brake on the bicycle", () => {
    show();
    toTheKerb(25);
    fireEvent.keyDown(window, { code: "KeyE" });
    walk();
    hold("KeyW", 8);
    const brake = screen.getByRole("button", { name: "Brake" });
    fireEvent.pointerDown(brake, { pointerId: 3 });
    for (let i = 0; i < 20; i++) walk();
    fireEvent.pointerUp(brake, { pointerId: 3 });
    const now = walk();
    expect(now.session.vehicles.find((v) => v.id === "bicycle")!.speed).toBe(0);
  });

  it("walks and rides by a gamepad: its sticks and triggers, each button once a press, said once in the log", () => {
    vi.stubGlobal("AudioContext", CountingAudio);
    tones = 0;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    show();
    // A pad without the standard mapping means nothing.
    pads = [null, { ...gamepad({ 1: -1 }), mapping: "" }];
    expect(walk().session.body.feet.x).toBeCloseTo(1 / METRE, 9);
    pads = [null, gamepad({ 1: -1 })];
    expect(walk().session.body.feet.x).toBeGreaterThan(1 / METRE);
    pads = [gamepad({ 2: 1 })];
    expect(walk(0.1).session.orbit.yaw).toBeLessThan(0);
    pads = [gamepad()];
    toTheKerb(25);
    pads = [gamepad({}, { 3: 1 })];
    expect(walk().riding).toBe("bicycle");
    // Held, Y does not get off again.
    expect(walk().riding).toBe("bicycle");
    pads = [gamepad({}, { 7: 1, 5: 1, 2: 1 })];
    const going = walk(0.5);
    expect(going.session.vehicles.find((v) => v.id === "bicycle")).toMatchObject({ cycle: { gear: 3 } });
    expect(going.session.vehicles.find((v) => v.id === "bicycle")!.speed).toBeGreaterThan(0);
    expect(tones).toBe(4);
    pads = [gamepad({}, { 8: 1 })];
    expect(walk().session.flyer).not.toBeNull();
    const lines = info.mock.calls.map(([line]) => String(line));
    expect(lines.filter((l) => l.startsWith("explore/gamepad"))).toEqual([
      'explore/gamepad id="Test pad (STANDARD GAMEPAD)"',
    ]);
  });

  it("gets on the motorbike behind the landing, says its keys, and shows its speed, gear and engine", () => {
    show();
    // 6 m back along the street and across to the near kerb.
    hold("KeyS", 40);
    hold("KeyD", 20);
    walk();
    fireEvent.click(screen.getByRole("button", { name: "Get on the motorbike" }));
    expect(walk().riding).toBe("motorbike");
    walk();
    expect(screen.getByRole("region", { name: "On the motorbike" }).textContent).toContain("W throttle");
    expect(hud().getAttribute("aria-label")).toBe("Speed, gear and engine");
    expect(hud().textContent).toContain("1 of 5");
    expect(hud().dataset.foot).toBe("down");
    // On a touch screen its main button is the front brake, with no bell or gears beside it.
    expect(screen.getByRole("button", { name: "Brake" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ring" })).toBeNull();
    hold("KeyW", 10);
    expect(hud().textContent).toMatch(/Engine\d[\d,]* rpm/);
    expect(hud().textContent).not.toContain(" 0 km/h");
    // Both brakes to a stop, then off.
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.keyDown(window, { code: "KeyS" });
    for (let i = 0; i < 40; i++) walk();
    fireEvent.keyUp(window, { code: "Space" });
    fireEvent.keyUp(window, { code: "KeyS" });
    walk();
    expect(screen.getByRole("button", { name: "Get off the motorbike" })).toBeTruthy();
    fireEvent.keyDown(window, { code: "KeyE" });
    expect(walk().riding).toBeNull();
  });

  it("names Rapier on foot while the walker walks on the garage, and the walls' engine without one", () => {
    const garage: Garage = {
      follow: () => ({ standing: 0, waiting: 0, nearest: Infinity }),
      walls: open,
      drive: (vehicles) => vehicles,
      keepingUp: () => true,
      load: () => 0,
      dispose: () => undefined,
    };
    show(undefined, { garage, engine: "bespoke 2.5D" });
    expect(screen.getByRole("region", { name: "On foot" }).textContent).toContain("Physics prototype: Rapier");
    cleanup();
    show(undefined, { engine: "bespoke 2.5D" });
    expect(screen.getByRole("region", { name: "On foot" }).textContent).toContain("Physics prototype: bespoke 2.5D");
  });

  it("drives the car on the garage, keeps the streets round it each frame, and shows its gear and engine", () => {
    const follow = vi.fn<Garage["follow"]>(() => ({ standing: 4, waiting: 0, nearest: Infinity }));
    const garage: Garage = {
      follow,
      walls: open,
      drive: (vehicles, drivers) =>
        vehicles.map((v) =>
          v.kind === "car" && drivers.has(v.id)
            ? Object.assign({}, v, { feet: { ...v.feet, x: v.feet.x + 0.05 }, speed: 6, gear: 1, rpm: 2345 })
            : v,
        ),
      keepingUp: () => true,
      load: () => 0.1,
      dispose: () => undefined,
    };
    show(undefined, { garage });
    expect(follow).not.toHaveBeenCalled();
    walk();
    expect(follow).toHaveBeenCalledOnce();
    toTheKerb(62, "KeyA");
    walk();
    fireEvent.click(screen.getByRole("button", { name: "Get in the car" }));
    const before = walk().session.vehicles.find((v) => v.id === "car")!.feet.x;
    hold("KeyW", 5);
    const after = walk().session.vehicles.find((v) => v.id === "car")!;
    expect(after.feet.x).toBeGreaterThan(before);
    expect(hud().textContent).toContain("2");
    expect(hud().textContent).toContain("2,300 rpm");
    expect(screen.getByRole("button", { name: "Handbrake" })).toBeTruthy();
    // The card names the physics the car runs on, not the walls'.
    expect(screen.getByRole("region", { name: "In the car" }).textContent).toContain("Physics prototype: Rapier car");
    // The window follows where the car is going: its speed along the way it moved.
    const [at, velocity] = follow.mock.calls.at(-1)!;
    expect(at.x).toBeCloseTo(after.feet.x, 9);
    expect(velocity.x).toBeGreaterThan(0);
    // Leaving, the log says what the cars' physics cost.
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    cleanup();
    expect(info).toHaveBeenCalledWith("explore/garage load=0.100");
  });

  it("hands the cars to their arcade handling when the garage cannot keep up, and says so once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const drive = vi.fn<Garage["drive"]>((vehicles) => vehicles);
    const garage: Garage = {
      follow: () => ({ standing: 0, waiting: 0, nearest: Infinity }),
      walls: open,
      drive,
      keepingUp: () => false,
      load: () => 0.73,
      dispose: () => undefined,
    };
    show(undefined, { garage });
    toTheKerb(62, "KeyA");
    walk();
    fireEvent.click(screen.getByRole("button", { name: "Get in the car" }));
    walk();
    expect(screen.getByRole("status").textContent).toBe("Cars drive simply here: this device could not keep up.");
    expect(error).toHaveBeenCalledWith("explore/arcade reason=slow load=0.73");
    const driven = drive.mock.calls.length;
    hold("KeyW", 5);
    expect(drive.mock.calls.length).toBe(driven);
    // The arcade car shows its speed alone, and the card says it drives as one.
    expect(hud().getAttribute("aria-label")).toBe("Speed");
    expect(screen.getByRole("region", { name: "In the car" }).textContent).toContain("Physics prototype: arcade car");
    expect(error).toHaveBeenCalledOnce();
  });

  it("says in the log when a hard knock throws the rider, and when they are back up", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    // A wall across the street 20 m on from the landing: 6 m beyond the bicycle.
    const walled: Walls = {
      ...open,
      move: (feet, delta, radius) => {
        const moved = open.move(feet, delta, radius);
        return { ...moved, feet: { ...moved.feet, x: Math.min(moved.feet.x, 20 - (radius ?? 0.3)) } };
      },
    };
    show(undefined, { walls: walled });
    toTheKerb(25);
    fireEvent.keyDown(window, { code: "KeyE" });
    walk();
    // Pedalled hard at the wall.
    fireEvent.keyDown(window, { code: "KeyW" });
    let thrown = false;
    for (let i = 0; i < 40 && !thrown; i++) {
      walk();
      thrown = document.querySelector<HTMLElement>(".explore-hud")?.dataset.fallen === "true";
    }
    fireEvent.keyUp(window, { code: "KeyW" });
    expect(thrown).toBe(true);
    for (let i = 0; i < 30; i++) walk();
    const lines = info.mock.calls.map(([line]) => String(line));
    expect(lines.find((l) => l.startsWith("explore/thrown"))).toMatch(/^explore\/thrown cause=hit speed=\d+\.\d$/);
    expect(lines).toContain("explore/up");
  });

  it("gets in the helicopter on a low roof, lifts it by the Up button, lands it back by Down, and says so", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const lines = () => info.mock.calls.map(([line]) => String(line));
    const roof: Footprint = {
      lot: 1,
      corners: [
        { x: 0, z: 21.5 },
        { x: 30, z: 21.5 },
        { x: 30, z: 40 },
        { x: 0, z: 40 },
      ],
      top: 1.5,
    };
    show(undefined, { walls: cityWalls([roof]), footprints: [roof], parked: [helicopterAt(1.5)] });
    walk();
    fireEvent.click(screen.getByRole("button", { name: "Get in the helicopter" }));
    expect(walk().riding).toBe("helicopter");
    walk();
    const card = screen.getByRole("region", { name: "In the helicopter" });
    expect(card.textContent).toContain("Space climbs");
    expect(view().dataset.riding).toBe("helicopter");
    expect(document.querySelector(".explore-dock")!.getAttribute("data-pad")).toBe("helicopter");
    const gauges = screen.getByRole("region", { name: "Altitude, climb, speed and rotor" });
    expect(gauges.dataset.landed).toBe("true");
    expect(gauges.dataset.over).toBe("roof");
    // Standing on the roof: no height above it; its shadow, on the roof, as dark as it gets.
    expect(gauges.textContent).toContain("Altitude0 m");
    const standingShadow = walk().shadow!;
    expect(standingShadow.at.y).toBeCloseTo(1.5 + SHADOW_LIFT, 6);
    expect(standingShadow.opacity).toBeCloseTo(SHADOW_DARKEST, 6);
    // The roof it stands on has room: marked, its middle (15 m, 30.75 m) 9.8 m off, 59° to the right of its nose.
    expect(walk().rooftops.map((marked) => marked.lot)).toEqual([1]);
    expect(gauges.dataset.landing).toBe("10 -59");
    const up = screen.getByRole("button", { name: "Up" });
    press(up, true);
    until(lines, "explore/heli-lifted", 80);
    for (let i = 0; i < 10; i++) walk();
    press(up, false);
    expect(lines()).toContain("explore/heli-lifted");
    expect(hud().dataset.landed).toBe("false");
    // Up off the roof, its shadow stays on it, paler.
    const flyingShadow = walk().shadow!;
    expect(flyingShadow.at.y).toBeCloseTo(1.5 + SHADOW_LIFT, 6);
    expect(flyingShadow.opacity).toBeLessThan(SHADOW_DARKEST);
    expect(screen.getByRole("button", { name: "Land to get out of the helicopter" })).toHaveProperty("disabled", true);
    const down = screen.getByRole("button", { name: "Down" });
    press(down, true);
    until(lines, "explore/heli-landed", 200);
    press(down, false);
    expect(lines()).toContain("explore/heli-landed on=roof y=1.5");
    // Set down by the landing assist as it slid over the roof's middle: its skids stop it within a few tenths.
    for (let i = 0; i < 20 && !getOut(); i++) walk();
    fireEvent.click(getOut()!);
    walk();
    expect(screen.getByRole("region", { name: "On foot" })).toBeTruthy();
  });

  it("flies the helicopter by its keys into a tower, says the hit, and lands it on the street", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const lines = () => info.mock.calls.map(([line]) => String(line));
    const walls = cityWalls([
      {
        lot: 1,
        corners: [
          { x: 60, z: -100 },
          { x: 80, z: -100 },
          { x: 80, z: 100 },
          { x: 60, z: 100 },
        ],
        top: 100,
      },
    ]);
    show(undefined, { walls, parked: [helicopterAt(GROUND)] });
    walk();
    fireEvent.keyDown(window, { code: "KeyE" });
    expect(walk().riding).toBe("helicopter");
    fireEvent.keyDown(window, { code: "Space" });
    until(lines, "explore/heli-lifted", 80);
    hold("Space", 20);
    fireEvent.keyDown(window, { code: "KeyW" });
    until(lines, "explore/heli-hit", 200);
    fireEvent.keyUp(window, { code: "KeyW" });
    expect(lines().find((l) => l.startsWith("explore/heli-hit"))).toMatch(/^explore\/heli-hit lost=\d+\.\d$/);
    fireEvent.keyDown(window, { code: "KeyC" });
    until(lines, "explore/heli-landed", 400);
    fireEvent.keyUp(window, { code: "KeyC" });
    expect(lines().find((l) => l.startsWith("explore/heli-landed"))).toBe("explore/heli-landed on=street y=0.3");
    fireEvent.keyDown(window, { code: "KeyE" });
    expect(walk().riding).toBeNull();
    // Back on foot, the HUD is gone, and no roof is marked; the helicopter, left, spins down.
    walk();
    expect(document.querySelector(".explore-hud")).toBeNull();
    expect(walk().rooftops).toEqual([]);
  });
});
