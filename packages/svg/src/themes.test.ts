import { fnv1a } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { contrast, mix, oklch } from "./colour";
import { THEMES, THEME_NAMES, hueOf } from "./themes";

const names = THEME_NAMES;

describe("themes", () => {
  it.each(names)("keeps %s labels and header text at WCAG AA contrast", (name) => {
    const t = THEMES[name];
    expect(contrast(t.text, t.halo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.headerText, t.header)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.subText, t.header)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(names)("gives %s colours for every part of the model", (name) => {
    const t = THEMES[name];
    for (const c of [
      t.block(7),
      t.lot(7, true),
      t.lot(7, false),
      t.plinth(7),
      ...t.reserve(7),
      t.form("twin", true),
      t.form("radial", false),
    ])
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("spreads district hues clear of park green, the root warm", () => {
    expect(hueOf(fnv1a(""))).toBe(60);
    for (let d = 0; d < 2000; d += 7) {
      const h = hueOf(d);
      expect(h < 95 || h >= 165).toBe(true);
    }
  });
});

describe("colour", () => {
  it("converts OKLCH to sRGB, clipped to the gamut", () => {
    expect(oklch(1, 0, 0)).toBe("#ffffff");
    expect(oklch(0, 0, 0)).toBe("#000000");
    expect(oklch(0.7, 0.4, 140)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("mixes two colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("measures contrast as WCAG does", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
  });
});
