import { describe, expect, it } from "vitest";
import { canonicalJson } from "../plat/canonical";
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

  it("rejects a city whose towns share a key", () => {
    const twice = { ...city, towns: [city.towns[0]!, { ...city.towns[0]!, name: "demo old town", old: true }] };
    expect(() => parseCity(serialiseCity(twice))).toThrow("city/bad-shape: /towns");
  });

  it("round-trips the separations a city records and its declaration", () => {
    const recorded: City = { ...city, separable: ["workspaces", "plugins"], declared: true, manifests: "unfetchable" };
    expect(parseCity(serialiseCity(recorded))).toEqual(recorded);
  });

  it("rejects recorded separations that are unknown, repeated, out of order or none, and a false declaration", () => {
    for (const separable of [["split"], ["apps", "apps"], ["plugins", "apps"], []])
      expect(() => parseCity(canonicalJson({ ...city, separable }))).toThrow("city/bad-shape: /separable");
    expect(() => parseCity(canonicalJson({ ...city, declared: false }))).toThrow("city/bad-shape: /declared");
    expect(() => parseCity(canonicalJson({ ...city, manifests: "held" }))).toThrow("city/bad-shape: /manifests");
  });
});
