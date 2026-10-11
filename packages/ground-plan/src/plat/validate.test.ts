import { describe, expect, it } from "vitest";
import { array, bool, int, literal, nat, nullable, object, oneOf, optional, record, str } from "./validate";

describe("validate", () => {
  const shape = object({
    n: nat,
    s: str,
    b: bool,
    k: oneOf(["a", "b"]),
    v: literal(1),
    list: array(int),
    map: record(int),
    maybe: nullable(int),
    extra: optional(str),
  });
  const good = { n: 1, s: "x", b: true, k: "a", v: 1, list: [-1], map: { a: 2 }, maybe: null };

  it("accepts a matching value and leaves optional properties out", () => {
    expect(shape(good, "")).toEqual(good);
    expect(shape({ ...good, extra: "e" }, "").extra).toBe("e");
  });

  it.each([
    [{ ...good, n: -1 }, "/n: expected a non-negative integer"],
    [{ ...good, n: 1.5 }, "/n: expected an integer"],
    [{ ...good, s: 1 }, "/s: expected a string"],
    [{ ...good, b: 1 }, "/b: expected a boolean"],
    [{ ...good, k: "c" }, "/k: expected one of a, b"],
    [{ ...good, v: 2 }, "/v: expected 1"],
    [{ ...good, list: {} }, "/list: expected an array"],
    [{ ...good, list: ["x"] }, "/list/0: expected an integer"],
    [{ ...good, map: [] }, "/map: expected an object"],
    [{ ...good, map: { a: "x" } }, "/map/a: expected an integer"],
    [{ ...good, unknown: 1 }, "/unknown: expected no such property"],
    [7, "/: expected an object"],
  ])("rejects %j with its pointer", (value, message) => {
    expect(() => shape(value, "")).toThrow(message);
  });
});
