import { describe, expect, it } from "vitest";
import { remembering } from "./memo";

describe("remembering", () => {
  it("computes each key once until its memory fills, then starts afresh", () => {
    const calls: number[] = [];
    const twice = remembering((n: number) => {
      calls.push(n);
      return n * 2;
    }, 2);
    expect([twice(1), twice(1), twice(2), twice(3), twice(1)]).toEqual([2, 2, 4, 6, 2]);
    expect(calls).toEqual([1, 2, 3, 1]);
  });
});
