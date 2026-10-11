import { describe, expect, it } from "vitest";
import type { City } from "./city";
import { parseCity, serialiseCity } from "./serialise";

const city: City = {
  repository: "demo",
  commit: "worktree",
  towns: [
    {
      key: "demo",
      name: "demo",
      form: "polycentric",
      old: false,
      outline: [{ x: 1, y: 2 }],
      water: [[{ x: 0, y: 0 }]],
      roads: [],
      blocks: [],
      lots: [],
      districts: [],
      stats: { lots: 0, overflow: 0, offLand: 3, docs: 1, lotArea2: 0, landArea2: 8 },
    },
  ],
  highways: [{ pts: [{ x: 0, y: 0 }], cls: "avenue" }],
};

describe("serialiseCity and parseCity", () => {
  it("round-trips", () => {
    expect(parseCity(serialiseCity(city))).toEqual(city);
  });

  it("rejects text that is not JSON, and a bad shape by pointer", () => {
    expect(() => parseCity("[")).toThrow("city/bad-json");
    expect(() => parseCity('{"repository":"x","commit":"y","towns":[{}],"highways":[]}')).toThrow(
      "city/bad-shape: /towns/0/key",
    );
  });
});
