import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";

describe("canonicalJson", () => {
  it("sorts object keys by code point at every level and ends with a newline", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}\n',
    );
  });

  it("omits undefined properties", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}\n');
  });

  it("rejects values JSON cannot hold exactly", () => {
    expect(() => canonicalJson({ a: 0.5 })).toThrow("engine/invariant");
    expect(() => canonicalJson({ a: Number.NaN })).toThrow("engine/invariant");
    expect(() => canonicalJson({ a: 2 ** 60 })).toThrow("engine/invariant");
    expect(() => canonicalJson(0.5)).toThrow("/ holds 0.5");
    expect(() => canonicalJson([1n])).toThrow("/0 holds a bigint");
    expect(() => canonicalJson(() => 1)).toThrow("/ holds a function");
  });

  it("is independent of key insertion order", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).toReversed());
        return canonicalJson(record) === canonicalJson(reversed);
      }),
    );
  });
});
