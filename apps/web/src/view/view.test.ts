import { describe, expect, it, vi } from "vitest";
import {
  ELEVATION,
  KEY_TILT,
  KEY_TURN,
  ROOF_MOST,
  ROOF_ZOOM,
  NO_INSETS,
  TILT_MAX,
  TILT_MIN,
  YAW,
  basis,
  declutter,
  fit,
  onKey,
  pan,
  project,
  roofLabels,
  turned,
  unproject,
  zoomAt,
  type Roof,
  type View,
} from "./view";

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

describe("turning the Buildings view", () => {
  const screenSize = { width: 800, height: 600 };
  const view: View = { centre: { x: 10, z: 5 }, zoom: 20 };

  it("looks from its yaw and tilt, and from 45° round and 30° up unless turned", () => {
    expect(basis("buildings", {})).toBe(basis("buildings"));
    const b = basis("buildings", { yaw: 0, tilt: Math.PI / 4 });
    // Round from south by nothing: the eye is to the south, up at 45°.
    expect(b.eye[0]).toBeCloseTo(0, 9);
    expect(b.eye[1]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(b.eye[2]).toBeCloseTo(Math.SQRT1_2, 9);
    // Plan is never turned.
    expect(basis("plan", { yaw: 1, tilt: 1 })).toBe(basis("plan"));
  });

  it("turns round freely and tilts within its limits", () => {
    const once = turned(view, 0.5, 0.2);
    expect(once.yaw).toBeCloseTo(YAW + 0.5, 9);
    expect(once.tilt).toBeCloseTo(ELEVATION + 0.2, 9);
    expect(turned(view, 0, 10).tilt).toBe(TILT_MAX);
    expect(turned(view, 0, -10).tilt).toBe(TILT_MIN);
    expect(turned(once, 0.5, 0).yaw).toBeCloseTo(YAW + 1, 9);
  });

  it("keeps the centre in the middle of the screen however it is turned", () => {
    const at = project(turned(view, 1.2, 0.3), screenSize, { x: 10, y: 0, z: 5 }, "buildings");
    expect(at.x).toBeCloseTo(400, 9);
    expect(at.y).toBeCloseTo(300, 9);
  });

  it("projects and unprojects alike when turned, and pans along the turned ground", () => {
    const turnedView = turned(view, 2, 0.4);
    const p = { x: 14, y: 0, z: -3 };
    const back = unproject(turnedView, screenSize, project(turnedView, screenSize, p, "buildings"), "buildings");
    expect(back.x).toBeCloseTo(14, 9);
    expect(back.z).toBeCloseTo(-3, 9);
    const panned = pan(turnedView, 40, 0, "buildings");
    // What was at the centre moves 40 px left on screen.
    expect(project(panned, screenSize, { x: 10, y: 0, z: 5 }, "buildings").x).toBeCloseTo(360, 9);
  });

  it("turns and tilts by Q, E, Page Up and Page Down, in the Buildings view only", () => {
    const square = { min: { x: 0, z: 0 }, max: { x: 10, z: 10 } };
    expect(onKey("e", view, screenSize, square, NO_INSETS, "buildings")?.yaw).toBeCloseTo(YAW + KEY_TURN, 9);
    expect(onKey("Q", view, screenSize, square, NO_INSETS, "buildings")?.yaw).toBeCloseTo(YAW - KEY_TURN, 9);
    expect(onKey("PageUp", view, screenSize, square, NO_INSETS, "buildings")?.tilt).toBeCloseTo(
      ELEVATION + KEY_TILT,
      9,
    );
    expect(onKey("PageDown", view, screenSize, square, NO_INSETS, "buildings")?.tilt).toBeCloseTo(
      ELEVATION - KEY_TILT,
      9,
    );
    for (const key of ["q", "E", "PageUp", "PageDown"]) expect(onKey(key, view, screenSize, bounds)).toBeNull();
  });

  it("fits a turned view without losing its turn, or taking another view's centre", () => {
    const square = { min: { x: 0, z: 0 }, max: { x: 10, z: 10 } };
    const far = { centre: { x: 900, z: 900 }, zoom: 1, yaw: 1, tilt: 0.7 };
    const fitted = fit(square, screenSize, NO_INSETS, "buildings", far);
    expect(fitted).toMatchObject({ centre: { x: 5, z: 5 }, yaw: 1, tilt: 0.7 });
    expect(fit(square, screenSize, NO_INSETS, "buildings", { yaw: 1 })).not.toHaveProperty("tilt");
    expect(onKey("0", far, screenSize, square, NO_INSETS, "buildings")).toMatchObject({ yaw: 1, tilt: 0.7 });
  });
});

describe("zoomAt", () => {
  const screenSize = { width: 800, height: 600 };
  const view: View = { centre: { x: 0, z: 0 }, zoom: 10 };

  it("zooms about the point under the pointer, which stays under it", () => {
    for (const mode of ["plan", "buildings"] as const) {
      const pointer = { x: 600, y: 150 };
      const under = unproject(view, screenSize, pointer, mode);
      const zoomed = zoomAt(view, screenSize, pointer, 1.5, mode);
      expect(zoomed.zoom).toBeCloseTo(15, 9);
      const stays = project(zoomed, screenSize, { x: under.x, y: 0, z: under.z }, mode);
      expect(stays.x).toBeCloseTo(600, 6);
      expect(stays.y).toBeCloseTo(150, 6);
    }
  });
});

/** A roof named `text` over (x, z), so high. */
const roof = (text: string, x: number, z: number, y = 1) => ({ text, x, y, z });
/** Every one of these roofs, wherever the map asks. */
const all = (roofs: readonly Roof[]) => () => roofs;

describe("roofLabels", () => {
  const screenSize = { width: 800, height: 600 };
  const close: View = { centre: { x: 0, z: 0 }, zoom: ROOF_ZOOM };

  it("names no roof in plan view, or before the view is close enough", () => {
    const roofs = vi.fn<Parameters<typeof roofLabels>[0]>(all([roof("a.ts", 0, 0)]));
    expect(roofLabels(roofs, close, screenSize, "plan")).toEqual([]);
    expect(roofLabels(roofs, { ...close, zoom: ROOF_ZOOM - 1 }, screenSize, "buildings")).toEqual([]);
    expect(roofs).not.toHaveBeenCalled();
  });

  it("asks only for the roofs within the screen's reach of its centre", () => {
    const roofs = vi.fn<Parameters<typeof roofLabels>[0]>(all([]));
    roofLabels(roofs, { ...close, centre: { x: 3, z: -4 } }, screenSize, "buildings");
    expect(roofs).toHaveBeenCalledWith({ x: 3, z: -4 }, 1000 / ROOF_ZOOM);
  });

  it("names a roof over the roof, at its height", () => {
    const [label] = roofLabels(all([roof("a.ts", 0, 0, 2)]), close, screenSize, "buildings");
    const at = project(close, screenSize, { x: 0, y: 2, z: 0 }, "buildings");
    expect(label).toMatchObject({ text: "a.ts", left: at.x, top: at.y });
  });

  it("keeps the nearest the middle where names would overlap, and none off screen or out of reach", () => {
    const labels = roofLabels(
      all([roof("far.ts", 0.05, 0.05), roof("near.ts", 0, 0), roof("off.ts", 100, 0), roof("edge.ts", 9.2, 0)]),
      close,
      screenSize,
      "buildings",
    );
    expect(labels.map((l) => l.text)).toEqual(["near.ts"]);
  });

  it("names at most a handful at once", () => {
    const many = Array.from({ length: 400 }, (_unused, i) =>
      roof(`f${i}.ts`, (i % 20) * 0.6 - 6, Math.floor(i / 20) * 0.4 - 4),
    );
    expect(
      roofLabels(all(many), { ...close, zoom: ROOF_ZOOM * 3 }, { width: 4000, height: 3000 }, "buildings"),
    ).toHaveLength(ROOF_MOST);
  });
});
