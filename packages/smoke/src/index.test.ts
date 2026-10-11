import { describe, expect, it } from "vitest";
import { sign } from "./index.ts";

describe("sign", () => {
  it.each([
    [5, 1],
    [-3, -1],
    [0, 0],
  ])("maps %i to %i", (value, expected) => {
    expect(sign(value)).toBe(expected);
  });
});
