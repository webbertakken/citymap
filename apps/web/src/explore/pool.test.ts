import { describe, expect, it } from "vitest";
import { assignPool } from "./pool";

describe("assignPool", () => {
  it("fills empty slots in the order things are wanted", () => {
    expect(assignPool([null, null, null], ["a", "b"])).toEqual(["a", "b", null]);
  });

  it("keeps a slot on what is still wanted, frees the rest, and gives freed slots to newcomers", () => {
    expect(assignPool(["a", "b", "c"], ["c", "d", "a"])).toEqual(["a", "d", "c"]);
    expect(assignPool(["a", "b"], [])).toEqual([null, null]);
  });

  it("leaves out what does not fit", () => {
    expect(assignPool([null, "x"], ["a", "x", "b"])).toEqual(["a", "x"]);
  });
});
