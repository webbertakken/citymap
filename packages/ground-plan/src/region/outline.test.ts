import { describe, expect, it } from "vitest";
import { area2 } from "../fixed/polygon";
import { outlineFor } from "./outline";

describe("outlineFor", () => {
  it("lays an octagon of the given land about its centre", () => {
    const outline = outlineFor(2_000_000_000, { x: 100, y: -50 }, "demo");
    expect(outline).toHaveLength(8);
    expect(Math.abs(area2(outline) - 2_000_000_000)).toBeLessThan(2_000_000);
  });

  it("is the same for the same key and differs between keys", () => {
    expect(outlineFor(10_000_000, { x: 0, y: 0 }, "a")).toEqual(outlineFor(10_000_000, { x: 0, y: 0 }, "a"));
    expect(outlineFor(10_000_000, { x: 0, y: 0 }, "a")).not.toEqual(outlineFor(10_000_000, { x: 0, y: 0 }, "b"));
  });

  it("rejects land that is not a positive integer", () => {
    expect(() => outlineFor(1.5, { x: 0, y: 0 }, "a")).toThrow("engine/invariant");
    expect(() => outlineFor(-4, { x: 0, y: 0 }, "a")).toThrow("engine/invariant");
  });
});
