import { describe, expect, it } from "vitest";
import { basis, declutter, fit, onKey, project, type View } from "./view";

const bounds = { min: { x: -50, z: -20 }, max: { x: 50, z: 20 } };
const viewport = { width: 1000, height: 500 };

describe("basis", () => {
  it("looks straight down in plan, north up", () => {
    const b = basis("plan");
    expect(b.eye).toEqual([0, 1, 0]);
    expect(b.up).toEqual([0, 0, -1]);
    expect(b.right[0]).toBeCloseTo(1);
  });

  it("looks down 30 degrees from 45 degrees round in dimetric", () => {
    const b = basis("dimetric");
    expect(Math.asin(b.eye[1]) * (180 / Math.PI)).toBeCloseTo(30);
    expect(b.eye[0]).toBeCloseTo(b.eye[2]);
    expect(b.up).toEqual([0, 1, 0]);
  });
});

describe("project", () => {
  it("puts the centre in the middle of the viewport", () => {
    const view: View = { mode: "plan", centre: { x: 10, z: 5 }, zoom: 4 };
    expect(project(view, viewport, { x: 10, y: 0, z: 5 })).toEqual({ x: 500, y: 250 });
    expect(project(view, viewport, { x: 20, y: 0, z: 5 })).toEqual({ x: 540, y: 250 });
  });
});

describe("fit", () => {
  it("centres the city and zooms it to fill most of the viewport", () => {
    const view = fit(bounds, "plan", viewport);
    expect(view.centre).toEqual({ x: 0, z: 0 });
    expect(view.zoom).toBeCloseTo((1000 / 100) * 0.9);
  });

  it("fits the projected city in dimetric", () => {
    const view = fit(bounds, "dimetric", viewport);
    for (const x of [-50, 50])
      for (const z of [-20, 20]) {
        const p = project(view, viewport, { x, y: 0, z });
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1000);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(500);
      }
  });

  it("fits a city that is a line, using its one extent", () => {
    const line = { min: { x: 0, z: -20 }, max: { x: 0, z: 20 } };
    expect(fit(line, "plan", viewport).zoom).toBeCloseTo((500 / 40) * 0.9);
    const row = { min: { x: -50, z: 0 }, max: { x: 50, z: 0 } };
    expect(fit(row, "plan", viewport).zoom).toBeCloseTo((500 / 100) * 0.9);
  });

  it("handles an empty city", () => {
    expect(fit({ min: { x: 0, z: 0 }, max: { x: 0, z: 0 } }, "plan", viewport).zoom).toBe(1);
  });
});

describe("onKey", () => {
  const view: View = { mode: "plan", centre: { x: 0, z: 0 }, zoom: 10 };

  it("pans a tenth of the view with the arrow keys", () => {
    expect(onKey("ArrowRight", view, viewport, bounds)?.centre.x).toBeCloseTo(10);
    expect(onKey("ArrowLeft", view, viewport, bounds)?.centre.x).toBeCloseTo(-10);
    expect(onKey("ArrowUp", view, viewport, bounds)?.centre.z).toBeCloseTo(-5);
    expect(onKey("ArrowDown", view, viewport, bounds)?.centre.z).toBeCloseTo(5);
  });

  it("zooms with + and -, and fits with 0", () => {
    expect(onKey("+", view, viewport, bounds)?.zoom).toBeCloseTo(12.5);
    expect(onKey("=", view, viewport, bounds)?.zoom).toBeCloseTo(12.5);
    expect(onKey("-", view, viewport, bounds)?.zoom).toBeCloseTo(8);
    expect(onKey("0", view, viewport, bounds)).toEqual(fit(bounds, "plan", viewport));
  });

  it("ignores other keys", () => {
    expect(onKey("a", view, viewport, bounds)).toBeNull();
  });
});

describe("declutter", () => {
  it("keeps labels in order and drops those that would overlap or fall outside", () => {
    const view: View = { mode: "plan", centre: { x: 0, z: 0 }, zoom: 10 };
    const kept = declutter(
      [
        { text: "TOWN", x: 0, z: 0, size: "town" },
        { text: "CLASH", x: 0.5, z: 0, size: "district" },
        { text: "east", x: 30, z: 0, size: "minor" },
        { text: "far", x: 900, z: 0, size: "minor" },
      ],
      view,
      viewport,
    );
    expect(kept.map((l) => l.text)).toEqual(["TOWN", "east"]);
    expect(kept[0]).toMatchObject({ left: 500, top: 250 });
  });
});
