import { describe, expect, it } from "vitest";
import type { Town } from "../city/city";
import { emptyPlat, emptyTownPlat, parsePlat, serialisePlat, type Plat } from "./plat";

const town: Town = {
  key: "demo",
  name: "demo old town",
  form: "neighbourhood",
  old: true,
  outline: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ],
  water: [],
  roads: [{ pts: [{ x: 0, y: 0 }], cls: "street" }],
  blocks: [{ pts: [], district: 7, kind: "built", form: "radial" }],
  lots: [{ pts: [], key: "a@0", address: ":0.0.0", vacant: false, path: "a.ts", use: "source", district: 7 }],
  districts: [{ pts: [], path: "src", name: "src", depth: 1, massMille: 1000, ward: false, form: "hamlet" }],
  stats: { lots: 1, overflow: 0, offLand: 0, docs: 0, lotArea2: 2, landArea2: 4 },
};

const full = (): Plat => ({
  ...emptyPlat("config,source"),
  towns: {
    demo: {
      ...emptyTownPlat(),
      centre: { x: -5, y: 3 },
      area2: 100,
      cap2: 135,
      diameter: 12,
      cuts: {
        "": { n: [4096, 0], c: -40960, cls: "avenue", left: ["a"], right: ["b"], capLeft: 1, capRight: 2, river: true },
      },
      grids: {
        a: {
          dir: [0, 4096],
          a0: 1,
          b0: -2,
          rowPitch: 448,
          colPitch: 832,
          span: 2,
          green: "0,1",
          high: 1,
          park: { n: [4096, 0], c: 5 },
          slots: { "a@0": "0,0,0,1" },
        },
      },
      shares: { "|config": [{ key: "a.json@0", members: ["a.json@0"] }] },
      forms: { "": "radial", a: "hamlet" },
      radial: {
        "": {
          core: "a",
          start: 12,
          order: ["b", "c", "d"],
          bounds: [12, 300, 900, 4108],
          scaleMille: 500,
          caps: { a: 9 },
        },
      },
      addresses: { "a@0": "a:0.0.1" },
    },
  },
  old: { demo: [{ town, members: { "a@0": ["a@0"] } }] },
  rootForms: { demo: "radial" },
});

describe("serialisePlat and parsePlat", () => {
  it("round-trips every field", () => {
    const text = serialisePlat(full());
    expect(serialisePlat(parsePlat(text))).toBe(text);
    expect(parsePlat(text)).toEqual(full());
  });

  it("writes the same text whatever the key order", () => {
    const plat = full();
    const shuffled = parsePlat(JSON.stringify(plat, Object.keys(plat).toReversed()));
    expect(serialisePlat({ ...shuffled, ...plat })).toBe(serialisePlat(plat));
  });

  it("rejects text that is not JSON", () => {
    expect(() => parsePlat("{")).toThrow("plat/bad-json");
  });

  it("rejects a missing or older version, and a newer one by name", () => {
    expect(() => parsePlat("{}")).toThrow("plat/bad-version");
    expect(() => parsePlat("null")).toThrow("plat/bad-version");
    expect(() => parsePlat('{"version":2}')).toThrow("plat/too-new");
  });

  it("rejects a bad shape with the pointer of the fault", () => {
    const text = serialisePlat(full()).replace('"dir":[0,4096]', '"dir":[0,4096,1]');
    expect(() => parsePlat(text)).toThrow("plat/bad-shape: /towns/demo/grids/a/dir/2:");
  });
});
