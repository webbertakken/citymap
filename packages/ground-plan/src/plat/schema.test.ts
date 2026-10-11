import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { int, nat, parseJson, validate } from "./schema";

describe("validate", () => {
  const shape = v.strictObject({ n: nat, i: int, list: v.array(int) });

  it("returns the typed value", () => {
    expect(validate(shape, { n: 1, i: -2, list: [3] }, "city/bad-shape")).toEqual({ n: 1, i: -2, list: [3] });
  });

  it.each([
    [{ n: -1, i: 0, list: [] }, "city/bad-shape: /n:"],
    [{ n: 1.5, i: 0, list: [] }, "city/bad-shape: /n:"],
    [{ n: 1, i: 0, list: ["x"] }, "city/bad-shape: /list/0:"],
    [{ n: 1, i: 0, list: [], extra: 1 }, "city/bad-shape: /extra:"],
    [7, "city/bad-shape: /:"],
  ])("rejects %j with its pointer", (input, message) => {
    expect(() => validate(shape, input, "city/bad-shape")).toThrow(message);
  });
});

describe("parseJson", () => {
  it("parses JSON text, or rejects it by name", () => {
    expect(parseJson('{"a":1}', "plat/bad-json")).toEqual({ a: 1 });
    expect(() => parseJson("{", "plat/bad-json")).toThrow("plat/bad-json");
  });
});
