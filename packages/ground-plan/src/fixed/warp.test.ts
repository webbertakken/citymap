import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { densify, lattice, noise, warper } from "./warp";

describe("lattice", () => {
  it("matches the research prototype's hash", () => {
    // Prototype: ((h ^ (h >>> 16)) >>> 0) / 2^32 - 0.5, here in 1/65536 steps.
    const reference = (seed: number, i: number, j: number) => {
      let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ seed;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      return Math.floor((((h ^ (h >>> 16)) >>> 0) / 2 ** 32 - 0.5) * 65536);
    };
    for (const [seed, i, j] of [
      [1, 0, 0],
      [0x51ed27, -3, 7],
      [123456789, 1000, -1000],
    ] as const)
      expect(lattice(seed, i, j)).toBe(reference(seed, i, j));
  });
});

describe("noise", () => {
  it("equals the lattice value at lattice points", () => {
    expect(noise(7, 0, 0, 100)).toBe(lattice(7, 0, 0));
    expect(noise(7, 300, -200, 100)).toBe(lattice(7, 3, -2));
  });

  it("stays within the lattice range and is continuous", () => {
    const coord = fc.integer({ min: -(2 ** 20), max: 2 ** 20 });
    fc.assert(
      fc.property(coord, coord, (x, y) => {
        const a = noise(3, x, y, 1280);
        const b = noise(3, x + 1, y, 1280);
        return a >= -32768 && a <= 32768 && Math.abs(a - b) <= 400;
      }),
    );
  });
});

describe("warper", () => {
  it("moves points by at most the summed amplitudes", () => {
    const warp = warper(99, [
      [32, 1280],
      [100, 4000],
    ]);
    const coord = fc.integer({ min: -(2 ** 20), max: 2 ** 20 });
    fc.assert(
      fc.property(coord, coord, (x, y) => {
        const q = warp({ x, y });
        return Math.abs(q.x - x) <= 133 && Math.abs(q.y - y) <= 133;
      }),
    );
  });

  it("is deterministic", () => {
    const warp = warper(5, [[32, 1280]]);
    expect(warp({ x: 1234, y: -987 })).toEqual(warp({ x: 1234, y: -987 }));
  });

  it("rejects an octave that could fold the plane", () => {
    expect(() => warper(1, [[300, 1000]])).toThrow("fixed/warp-folds");
  });
});

describe("densify", () => {
  it("splits segments to the step", () => {
    expect(
      densify(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        4,
        false,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 7, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("closes a ring without repeating its first point", () => {
    const ring = densify(
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 8 },
      ],
      100,
      true,
    );
    expect(ring).toHaveLength(3);
  });
});
