import { describe, expect, it } from "vitest";
import { DEFAULT_TOGGLES, TOGGLES, isToggle, toggleList } from "./toggles";

describe("toggles", () => {
  it("names the four toggles in their order, corridor and tiers on by default", () => {
    expect(TOGGLES).toEqual(["corridor", "archipelago", "quarters", "tiers"]);
    expect(DEFAULT_TOGGLES).toEqual(["corridor", "tiers"]);
  });

  it("lists the toggles named, in their own order and once each, the defaults when none are given", () => {
    expect(toggleList(undefined)).toEqual(["corridor", "tiers"]);
    expect(toggleList([])).toEqual([]);
    expect(toggleList(["tiers", "quarters", "tiers"])).toEqual(["quarters", "tiers"]);
  });

  it("tells a toggle's name from any other text", () => {
    expect(isToggle("archipelago")).toBe(true);
    expect(isToggle("gridiron")).toBe(false);
  });
});
