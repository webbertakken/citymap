import { describe, expect, it } from "vitest";
import { FLY_MIN_EXTENT, FLY_SHARE, between, ease, flyTo } from "./fly";
import type { View } from "./view";

const viewport = { width: 1600, height: 900 };
const fitted: View = { mode: "plan", centre: { x: 0, z: 0 }, zoom: 2 };

describe("flyTo", () => {
  it("centres the place, zoomed so it fills its share of the shorter side", () => {
    const view = flyTo(fitted, viewport, { x: 30, z: -12, extent: 40 }, fitted);
    expect(view.centre).toEqual({ x: 30, z: -12 });
    expect(view.zoom).toBeCloseTo((900 * FLY_SHARE) / 40, 9);
    expect(view.mode).toBe("plan");
  });

  it("shows a small place with its neighbours, never closer than a block's worth of land", () => {
    expect(flyTo(fitted, viewport, { x: 0, z: 0, extent: 1 }, fitted).zoom).toBeCloseTo(
      (900 * FLY_SHARE) / FLY_MIN_EXTENT,
      9,
    );
  });

  it("never zooms further out than the fitted city", () => {
    expect(flyTo({ ...fitted, mode: "dimetric" }, viewport, { x: 0, z: 0, extent: 5000 }, fitted)).toMatchObject({
      zoom: 2,
      mode: "dimetric",
    });
  });
});

describe("ease", () => {
  it("starts and ends still, and passes the middle halfway", () => {
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(0.9)).toBeGreaterThan(0.9);
  });
});

describe("between", () => {
  it("moves the centre in step and the zoom by equal ratios", () => {
    const from: View = { mode: "plan", centre: { x: 0, z: 0 }, zoom: 1 };
    const to: View = { mode: "plan", centre: { x: 10, z: -20 }, zoom: 100 };
    expect(between(from, to, 0)).toEqual(from);
    expect(between(from, to, 1)).toEqual(to);
    const mid = between(from, to, 0.5);
    expect(mid.centre).toEqual({ x: 5, z: -10 });
    expect(mid.zoom).toBeCloseTo(10, 9);
  });
});
