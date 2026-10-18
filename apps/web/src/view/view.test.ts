import { describe, expect, it } from "vitest";
import { basis, declutter, fit, onKey, pan, project, unproject, type View } from "./view";

const bounds = { min: { x: -50, z: -20 }, max: { x: 50, z: 20 } };
const viewport = { width: 1000, height: 500 };

const dot = (a: readonly number[], c: readonly number[]) => a.reduce((s, v, i) => s + v * c[i]!, 0);

describe("basis", () => {
  it("looks straight down, north up, in plan view", () => {
    expect(basis()).toEqual({ eye: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0], screenUp: [0, 0, -1] });
  });

  it("looks from 30° up and 45° round in the Buildings view, its directions square to each other", () => {
    const b = basis("buildings");
    expect(Math.asin(b.eye[1]) * (180 / Math.PI)).toBeCloseTo(30);
    expect(Math.atan2(b.eye[0], b.eye[2]) * (180 / Math.PI)).toBeCloseTo(45);
    expect(dot(b.right, b.screenUp)).toBeCloseTo(0);
    expect(dot(b.right, b.eye)).toBeCloseTo(0);
    expect(b.right[1]).toBeCloseTo(0);
    expect(b.screenUp[1]).toBeGreaterThan(0);
  });
});

describe("the Buildings view", () => {
  const view: View = { centre: { x: 10, z: 5 }, zoom: 4 };

  it("keeps the centre in the middle, and stands what is higher further up the screen", () => {
    expect(project(view, viewport, { x: 10, y: 0, z: 5 }, "buildings")).toEqual({ x: 500, y: 250 });
    expect(project(view, viewport, { x: 10, y: 2, z: 5 }, "buildings").y).toBeLessThan(250);
  });

  it("unprojects what it projects, at the ground or at a height", () => {
    for (const height of [0, 1.5]) {
      const point = { x: 13, y: height, z: -4 };
      const screen = project(view, viewport, point, "buildings");
      const back = unproject(view, viewport, screen, "buildings", height);
      expect(back.x).toBeCloseTo(13);
      expect(back.z).toBeCloseTo(-4);
    }
  });

  it("pans along the ground so the screen moves as the pointer did", () => {
    const moved = pan(view, 40, -20, "buildings");
    const before = project(view, viewport, { x: 0, y: 0, z: 0 }, "buildings");
    const after = project(moved, viewport, { x: 0, y: 0, z: 0 }, "buildings");
    expect(before.x - after.x).toBeCloseTo(40);
    expect(before.y - after.y).toBeCloseTo(20);
  });

  it("fits the city's corners into the view, keys panning and fitting alike", () => {
    const fitted = fit(bounds, viewport, undefined, "buildings");
    expect(fitted.centre.x).toBeCloseTo(0);
    expect(fitted.centre.z).toBeCloseTo(0);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = project(fitted, viewport, { x, y: 0, z }, "buildings");
        expect(corner.x).toBeGreaterThanOrEqual(0);
        expect(corner.x).toBeLessThanOrEqual(viewport.width);
        expect(corner.y).toBeGreaterThanOrEqual(0);
        expect(corner.y).toBeLessThanOrEqual(viewport.height);
      }
    expect(onKey("0", view, viewport, bounds, undefined, "buildings")).toEqual(fitted);
    expect(onKey("ArrowRight", view, viewport, bounds, undefined, "buildings")).toEqual(pan(view, 100, 0, "buildings"));
    expect(onKey("ArrowLeft", view, viewport, bounds, undefined, "buildings")).toEqual(pan(view, -100, 0, "buildings"));
    expect(onKey("ArrowUp", view, viewport, bounds, undefined, "buildings")).toEqual(pan(view, 0, 50, "buildings"));
    expect(onKey("ArrowDown", view, viewport, bounds, undefined, "buildings")).toEqual(pan(view, 0, -50, "buildings"));
  });

  it("places labels by the view's own projection", () => {
    const labels = [{ text: "A", x: 10, z: 5, size: "town" as const, extent: 100 }];
    expect(declutter(labels, view, viewport, "buildings")[0]).toMatchObject({ left: 500, top: 250 });
  });
});

describe("project", () => {
  it("puts the centre in the middle of the viewport", () => {
    const view: View = { centre: { x: 10, z: 5 }, zoom: 4 };
    expect(project(view, viewport, { x: 10, y: 0, z: 5 })).toEqual({ x: 500, y: 250 });
    expect(project(view, viewport, { x: 20, y: 0, z: 5 })).toEqual({ x: 540, y: 250 });
  });
});

describe("fit", () => {
  it("centres the city and zooms it to fill most of the viewport", () => {
    const view = fit(bounds, viewport);
    expect(view.centre).toEqual({ x: 0, z: 0 });
    expect(view.zoom).toBeCloseTo((1000 / 100) * 0.9);
  });

  it("fits a city that is a line, using its one extent", () => {
    const line = { min: { x: 0, z: -20 }, max: { x: 0, z: 20 } };
    expect(fit(line, viewport).zoom).toBeCloseTo((500 / 40) * 0.9);
    const row = { min: { x: -50, z: 0 }, max: { x: 50, z: 0 } };
    expect(fit(row, viewport).zoom).toBeCloseTo((500 / 100) * 0.9);
  });

  it("handles an empty city", () => {
    expect(fit({ min: { x: 0, z: 0 }, max: { x: 0, z: 0 } }, viewport).zoom).toBe(1);
  });
});

describe("onKey", () => {
  const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };

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
    expect(onKey("0", view, viewport, bounds)).toEqual(fit(bounds, viewport));
  });

  it("ignores other keys", () => {
    expect(onKey("a", view, viewport, bounds)).toBeNull();
  });
});

describe("fit within insets", () => {
  it("fits the city to the map the cards leave free, and centres it there", () => {
    const insets = { top: 100, right: 300, bottom: 0, left: 100 };
    const view = fit(bounds, viewport, insets);
    expect(view.zoom).toBeCloseTo(fit(bounds, { width: 600, height: 400 }).zoom, 9);
    const centre = project(view, viewport, { x: 0, y: 0, z: 0 });
    expect(centre.x).toBeCloseTo(100 + 600 / 2, 6);
    expect(centre.y).toBeCloseTo(100 + 400 / 2, 6);
  });

  it("fits within the same insets from the keyboard", () => {
    const insets = { top: 0, right: 200, bottom: 0, left: 0 };
    const view: View = { centre: { x: 9, z: 9 }, zoom: 3 };
    expect(onKey("0", view, viewport, bounds, insets)).toEqual(fit(bounds, viewport, insets));
  });
});

describe("declutter", () => {
  it("keeps labels in order and drops those that would overlap or fall outside", () => {
    const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };
    const kept = declutter(
      [
        { text: "TOWN", x: 0, z: 0, size: "town", extent: 40 },
        { text: "CLASH", x: 0.5, z: 0, size: "district", extent: 40 },
        { text: "east", x: 30, z: 0, size: "minor", extent: 40 },
        { text: "far", x: 900, z: 0, size: "minor", extent: 40 },
      ],
      view,
      viewport,
    );
    expect(kept.map((l) => l.text)).toEqual(["TOWN", "east"]);
    expect(kept[0]).toMatchObject({ left: 500, top: 250 });
  });

  it("names a district only when its land on screen is wide enough for the name", () => {
    // "WIDE" is 4 characters of 13 px: about 32 px of text at the fit share; its district spans 10 u, 100 px.
    const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };
    const labels = [
      { text: "WIDE", x: -20, z: 0, size: "district", extent: 10 },
      { text: "narrow-and-long", x: 2, z: 0, size: "minor", extent: 2 },
      { text: "SMALL TOWN", x: 0, z: 15, size: "town", extent: 0.5 },
    ] as const;
    expect(declutter(labels, view, viewport).map((l) => l.text)).toEqual(["WIDE", "SMALL TOWN"]);
    // Zoomed in fivefold, the narrow district has room for its name.
    expect(declutter(labels, { ...view, zoom: 50 }, viewport).map((l) => l.text)).toContain("narrow-and-long");
  });

  it("sizes a town's name to its land on screen, the largest town keeping its name in full", () => {
    const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };
    const labels = [
      { text: "REACT", x: 0, z: 0, size: "town", extent: 30 },
      // 300 px of land: room for 9 letters at 20 px.
      { text: "SERVER", x: -30, z: -15, size: "town", extent: 30 },
      // 40 px: too narrow at 20 px (about 55 px at the fit share), room at 13 px (about 33 px).
      { text: "CLIENT", x: 30, z: -15, size: "town", extent: 4 },
      // 10 px: room for neither, until zoomed in.
      { text: "TINY", x: 30, z: 15, size: "town", extent: 1 },
    ] as const;
    const sizes = (at: View) => Object.fromEntries(declutter(labels, at, viewport).map((l) => [l.text, l.size]));
    expect(sizes(view)).toEqual({ REACT: "town", SERVER: "town", CLIENT: "district" });
    // Zoomed in on it, its 25 px of land fit its name at 13 px, and at 40 px in full.
    expect(sizes({ centre: { x: 30, z: 15 }, zoom: 25 })).toMatchObject({ TINY: "district" });
    expect(sizes({ centre: { x: 30, z: 15 }, zoom: 40 })).toMatchObject({ TINY: "town" });
    // The largest town keeps its name in full however small it is on screen.
    expect(declutter([labels[3]], view, viewport)).toMatchObject([{ text: "TINY", size: "town" }]);
  });

  it("counts a town name's letter spacing, so a wide name near the edge is left out rather than cut", () => {
    // 18 characters of 20 px with 0.15 em spacing: about 277 px; centred 130 px from the right edge, it does not fit.
    const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };
    const label = { text: "TAKKEN.IO OLD TOWN", x: 37, z: 0, size: "town", extent: 40 } as const;
    expect(declutter([label], view, viewport)).toEqual([]);
    expect(declutter([{ ...label, x: 25 }], view, viewport)).toHaveLength(1);
  });

  it("does not repeat a name close to where it is already shown", () => {
    const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };
    const labels = [
      { text: "TEMPLATES", x: 0, z: 0, size: "district", extent: 20 },
      { text: "TEMPLATES", x: 10, z: 10, size: "district", extent: 20 },
      { text: "TEMPLATES", x: 40, z: 0, size: "district", extent: 20 },
    ] as const;
    // The second sits about 141 px from the first, inside the 240 px reach; the third, 400 px away, is shown.
    expect(declutter(labels, view, viewport).map((l) => l.left)).toEqual([500, 900]);
  });

  it("does not repeat a name in another letter case: NET and net are one name", () => {
    const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };
    const labels = [
      { text: "NET", x: 0, z: 0, size: "district", extent: 20 },
      { text: "net", x: 10, z: 10, size: "district", extent: 20 },
      { text: "Net", x: 40, z: 0, size: "district", extent: 20 },
    ] as const;
    expect(declutter(labels, view, viewport).map((l) => l.text)).toEqual(["NET", "Net"]);
  });
});

describe("unproject", () => {
  it("finds the ground point under the pointer, as project's inverse", () => {
    const view: View = { centre: { x: 12, z: -7 }, zoom: 6 };
    for (const point of [
      { x: 12, y: 0, z: -7 },
      { x: 40, y: 0, z: 3 },
      { x: -5, y: 0, z: 20 },
    ]) {
      const back = unproject(view, viewport, project(view, viewport, point));
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.z).toBeCloseTo(point.z, 6);
    }
  });
});
