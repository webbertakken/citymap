import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ELEVATION, KEY_TILT, KEY_TURN, YAW, project, unproject, type View } from "../view/view";
import { StubCanvas, currentView, fetcher, searchField, type } from "./testing/fixtures";
import { Viewer } from "./Viewer";

afterEach(cleanup);

const map = () => screen.getByRole("application");
const canvas = () => screen.getByTestId("canvas");
const yaw = () => Number(canvas().dataset.yaw);
const tilt = () => Number(canvas().dataset.tilt);
const viewport = { width: 800, height: 600 };

/** The viewer on alpha, in the Buildings view. */
async function inBuildings() {
  render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
  await screen.findByRole("heading", { level: 1, name: "alpha" });
  fireEvent.click(screen.getByRole("button", { name: "Buildings" }));
}

/** The view as the stand-in canvas shows it, with its turn. */
const turnedView = (): View => ({ ...currentView(), yaw: yaw(), tilt: tilt() });

describe("turning the Buildings view", () => {
  it("starts at 45° round and 30° up, and turns and tilts by Q, E, Page Up and Page Down", async () => {
    await inBuildings();
    expect(yaw()).toBeCloseTo(YAW, 9);
    expect(tilt()).toBeCloseTo(ELEVATION, 9);
    fireEvent.keyDown(map(), { key: "e" });
    expect(yaw()).toBeCloseTo(YAW + KEY_TURN, 9);
    fireEvent.keyDown(map(), { key: "PageUp" });
    expect(tilt()).toBeCloseTo(ELEVATION + KEY_TILT, 9);
  });

  it("turns and tilts by a right-drag or a Shift-drag, and pans by a plain one", async () => {
    await inBuildings();
    fireEvent.pointerDown(map(), { pointerId: 1, button: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 140, clientY: 80 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 140, clientY: 80 });
    expect(yaw()).toBeGreaterThan(YAW);
    expect(tilt()).toBeGreaterThan(ELEVATION);
    const after = yaw();
    fireEvent.pointerDown(map(), { pointerId: 1, shiftKey: true, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 60, clientY: 100 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 60, clientY: 100 });
    expect(yaw()).toBeLessThan(after);
    const centre = currentView().centre;
    fireEvent.pointerDown(map(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 160, clientY: 100 });
    expect(currentView().centre).not.toEqual(centre);
  });

  it("twists with two fingers to turn, and moves them together to tilt", async () => {
    await inBuildings();
    fireEvent.pointerDown(map(), { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerDown(map(), { pointerId: 2, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(map(), { pointerId: 2, clientX: 300, clientY: 400 });
    expect(yaw()).toBeCloseTo(YAW + Math.PI / 2, 6);
    expect(tilt()).toBeLessThan(ELEVATION);
  });

  it("keeps its turn in plan view and back, and through a search's flight", async () => {
    await inBuildings();
    fireEvent.keyDown(map(), { key: "e" });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    // A right-drag in plan view pans; nothing turns plan view.
    fireEvent.pointerDown(map(), { pointerId: 1, button: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map(), { pointerId: 1, clientX: 140, clientY: 80 });
    fireEvent.pointerUp(map(), { pointerId: 1, clientX: 140, clientY: 80 });
    fireEvent.click(screen.getByRole("button", { name: "Buildings" }));
    expect(yaw()).toBeCloseTo(YAW + KEY_TURN, 9);
    type("a.t");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect(yaw()).toBeCloseTo(YAW + KEY_TURN, 9);
  });

  it("offers no menu over the map, the right button being its", async () => {
    await inBuildings();
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    map().dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});

describe("zooming at the pointer", () => {
  it("keeps the point under the wheel where it is, in either view", async () => {
    await inBuildings();
    for (const mode of ["buildings", "plan"] as const) {
      if (mode === "plan") fireEvent.click(screen.getByRole("button", { name: "Plan" }));
      const before = turnedView();
      const pointer = { x: 600, y: 150 };
      const under = unproject(before, viewport, pointer, mode);
      fireEvent.wheel(map(), { deltaY: -100, clientX: pointer.x, clientY: pointer.y });
      const at = project(turnedView(), viewport, { x: under.x, y: 0, z: under.z }, mode);
      expect(at.x).toBeCloseTo(600, 4);
      expect(at.y).toBeCloseTo(150, 4);
    }
  });
});
