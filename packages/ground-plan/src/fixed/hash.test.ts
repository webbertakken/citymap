import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareKeys, fnv1a, seedOf, unitMille } from "./hash";

describe("fnv1a", () => {
  it("matches the published 32-bit FNV-1a vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });

  it("hashes UTF-8 bytes, not UTF-16 code units", () => {
    // "é" is the two bytes C3 A9 in UTF-8.
    let h = 0x811c9dc5;
    for (const byte of [0xc3, 0xa9]) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
    expect(fnv1a("é")).toBe(h);
  });
});

describe("seedOf", () => {
  it("ignores pinwheel separators", () => {
    expect(seedOf("src>L>R")).toBe(fnv1a("srcLR"));
  });
});

describe("unitMille", () => {
  it("stays in [0, 1000)", () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        const value = unitMille(key);
        return Number.isInteger(value) && value >= 0 && value < 1000;
      }),
    );
  });
});

describe("compareKeys", () => {
  it("orders by code point, as UTF-8 bytes do", () => {
    // U+FF5E (BMP, high) sorts before U+1F600 (astral) by code point, but after it in UTF-16 code units.
    expect(compareKeys("\uff5e", "\u{1f600}")).toBeLessThan(0);
    expect(compareKeys("a", "b")).toBeLessThan(0);
    expect(compareKeys("b", "a")).toBeGreaterThan(0);
    expect(compareKeys("a/b", "a/b")).toBe(0);
    expect(compareKeys("a", "ab")).toBeLessThan(0);
  });

  it("agrees with byte-wise comparison of UTF-8", () => {
    const encoder = new TextEncoder();
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), fc.string({ unit: "grapheme" }), (a, b) => {
        const bytes = Math.sign(Buffer.compare(encoder.encode(a), encoder.encode(b)));
        return Math.sign(compareKeys(a, b)) === bytes;
      }),
    );
  });
});
