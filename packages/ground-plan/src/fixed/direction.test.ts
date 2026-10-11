import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DIRECTION, TURN, dir, negate, normalise, perp, rotate } from "./direction";
import { COSINE } from "./directions";
import { fnv1a } from "./hash";

describe("COSINE", () => {
  it("is the committed quarter-wave table", () => {
    expect(COSINE).toHaveLength(1025);
    expect(COSINE[0]).toBe(DIRECTION);
    expect(COSINE[1024]).toBe(0);
    expect(fnv1a(COSINE.join(","))).toBe(0x2f6d907a);
  });

  it("never increases", () => {
    for (let i = 1; i < COSINE.length; i++) expect(COSINE[i]).toBeLessThanOrEqual(COSINE[i - 1] ?? 0);
  });
});

describe("dir", () => {
  it("points along the axes at the quarter turns", () => {
    expect(dir(0)).toEqual([4096, 0]);
    expect(dir(1024)).toEqual([0, 4096]);
    expect(dir(2048)).toEqual([-4096, 0]);
    expect(dir(3072)).toEqual([0, -4096]);
  });

  it("wraps modulo a turn, negatives included", () => {
    expect(dir(TURN + 5)).toEqual(dir(5));
    expect(dir(-1)).toEqual(dir(TURN - 1));
  });

  it("keeps every direction within rounding of the unit circle", () => {
    for (let a = 0; a < TURN; a++) {
      const [x, y] = dir(a);
      expect(Math.abs(x * x + y * y - DIRECTION * DIRECTION)).toBeLessThanOrEqual(2 * DIRECTION + 2);
    }
  });
});

describe("normalise", () => {
  it("scales a vector to the direction length", () => {
    expect(normalise(3, 4)).toEqual([2458, 3277]);
    expect(normalise(-10, 0)).toEqual([-4096, 0]);
  });

  it("rejects the zero vector", () => {
    expect(() => normalise(0, 0)).toThrow("fixed/zero-direction");
  });

  it("keeps the length within rounding for large coordinates", () => {
    const coord = fc.integer({ min: -(2 ** 22), max: 2 ** 22 });
    fc.assert(
      fc.property(coord, coord, (x, y) => {
        fc.pre(x !== 0 || y !== 0);
        const [nx, ny] = normalise(x, y);
        return Math.abs(Math.hypot(nx, ny) - DIRECTION) <= 3;
      }),
    );
  });
});

describe("perp, negate and rotate", () => {
  it("turns a quarter anticlockwise and flips", () => {
    expect(perp([3, 5])).toEqual([-5, 3]);
    expect(negate([3, -5])).toEqual([-3, 5]);
  });

  it("rotates by a table angle", () => {
    expect(rotate([4096, 0], 1024)).toEqual([0, 4096]);
    expect(rotate([4096, 0], 512)).toEqual(dir(512));
    expect(rotate([0, 100], 2048)).toEqual([0, -100]);
  });
});
