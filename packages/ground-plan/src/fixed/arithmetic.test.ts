import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { floorDiv, isqrt, mulDiv, roundDiv } from "./arithmetic";

const safe = fc.integer({ min: -(2 ** 40), max: 2 ** 40 });
const positive = fc.integer({ min: 1, max: 2 ** 40 });
const big = (n: number) => BigInt(n);
const bigFloor = (a: bigint, b: bigint) => (a >= 0n ? a / b : -((-a + b - 1n) / b));

describe("floorDiv", () => {
  it("rounds toward negative infinity", () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(-8, 2)).toBe(-4);
    expect(floorDiv(0, 5)).toBe(0);
  });

  it("matches the bigint reference", () => {
    fc.assert(fc.property(safe, positive, (a, b) => floorDiv(a, b) === Number(bigFloor(big(a), big(b)))));
  });

  it("never returns minus zero", () => {
    expect(Object.is(floorDiv(-0, 3), 0)).toBe(true);
    expect(Object.is(mulDiv(-3, 0, 7, "floor"), 0)).toBe(true);
  });

  it("rejects a non-positive divisor", () => {
    expect(() => floorDiv(1, 0)).toThrow("fixed/bad-divisor");
    expect(() => floorDiv(1, -2)).toThrow("fixed/bad-divisor");
  });
});

describe("roundDiv", () => {
  it("rounds half toward positive infinity", () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-2);
    expect(roundDiv(7, 3)).toBe(2);
    expect(roundDiv(-7, 3)).toBe(-2);
  });

  it("matches the bigint reference", () => {
    fc.assert(
      fc.property(safe, positive, (a, b) => roundDiv(a, b) === Number(bigFloor(2n * big(a) + big(b), 2n * big(b)))),
    );
  });
});

describe("roundDiv near the safe limit", () => {
  it("is exact when 2a + b passes 2^53", () => {
    const a = 2 ** 52 + 1;
    expect(roundDiv(a, 2)).toBe(Number((2n * BigInt(a) + 2n) / 4n));
  });
});

describe("mulDiv", () => {
  it("is exact across the safe-integer boundary", () => {
    const a = 2 ** 30 + 7;
    const b = 2 ** 30 + 11;
    const c = 2 ** 20 + 3;
    expect(mulDiv(a, b, c, "floor")).toBe(Number((big(a) * big(b)) / big(c)));
  });

  it("matches the bigint reference for both roundings", () => {
    const wide = fc.integer({ min: -(2 ** 34), max: 2 ** 34 });
    // |a × b| < 2^68 and c ≥ 2^16 keep every result inside the safe range.
    const divisor = fc.integer({ min: 2 ** 16, max: 2 ** 34 });
    fc.assert(
      fc.property(wide, wide, divisor, (a, b, c) => {
        const product = big(a) * big(b);
        return (
          mulDiv(a, b, c, "floor") === Number(bigFloor(product, big(c))) &&
          mulDiv(a, b, c, "round") === Number(bigFloor(2n * product + big(c), 2n * big(c)))
        );
      }),
    );
  });

  it("rejects a result outside the safe range", () => {
    expect(() => mulDiv(2 ** 52, 2 ** 52, 1, "floor")).toThrow("fixed/overflow");
  });
});

describe("isqrt", () => {
  it("returns the floor of the square root", () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(1)).toBe(1);
    expect(isqrt(15)).toBe(3);
    expect(isqrt(16)).toBe(4);
    expect(isqrt(2 ** 52)).toBe(2 ** 26);
  });

  it("brackets every input", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (n) => {
        const r = big(isqrt(n));
        return r * r <= big(n) && (r + 1n) * (r + 1n) > big(n);
      }),
    );
  });

  it("rejects a negative", () => {
    expect(() => isqrt(-1)).toThrow("fixed/negative-sqrt");
  });
});
