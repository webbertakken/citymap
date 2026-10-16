import { describe, expect, it } from "vitest";
import { FLATTEN_LIMIT } from "../constants";
import type { LotSeed, TreeNode } from "../tree/tree";
import { classifyNode, districtForm, features, flatForm, flatten } from "./classify";

const seed = (path: string, firstSeen = 0): LotSeed => ({ key: `${path}@0`, path, use: "source", firstSeen });
const node = (over: Partial<TreeNode> & { path: string }): TreeNode => ({
  name: over.path,
  depth: 1,
  firstSeen: 0,
  lots: [],
  docs: 0,
  children: [],
  massMille: 0,
  demand: 0,
  digest: "",
  member: false,
  sourceMille: 0,
  ...over,
});

const NONE = { packages: 0, packageMille: 0, neffMille: 0 };
const flatFeatures = (massMille: number, lots: number, f0: number) => ({ massMille, s1: 0, s2: 0, f0, lots, ...NONE });

const districtFeatures = (s1: number, s2: number, more: Partial<typeof NONE> & { f0?: number } = {}) => ({
  massMille: 1,
  s1,
  s2,
  f0: 0,
  lots: 0,
  ...NONE,
  ...more,
});

const child = node({ path: "p/c", massMille: 1000, demand: 10 });
const grownNode = (demand: number) => node({ path: "p", children: [child], massMille: 1000, demand });

describe("features", () => {
  it("measures the heaviest children and own files in per mille", () => {
    const f = features(10_000, [6000, 3000], 7);
    expect(f).toEqual({ massMille: 10_000, s1: 600, s2: 300, f0: 100, lots: 7, ...NONE });
  });

  it("is all zero for an empty folder", () => {
    expect(features(0, [], 0)).toEqual({ massMille: 0, s1: 0, s2: 0, f0: 0, lots: 0, ...NONE });
  });

  it("counts packages and their share when asked", () => {
    expect(features(10_000, [3000, 2000, 1000], 0, { packageMasses: [3000, 2000] })).toMatchObject({
      packages: 2,
      packageMille: 500,
    });
  });

  it("measures the effective number of children exactly when asked", () => {
    // Four equal children: one over the sum of four quarters squared is four.
    expect(features(4000, [1000, 1000, 1000, 1000], 0, { neff: true }).neffMille).toBe(4000);
    // Own files count as a part: 1000 own beside 3 × 1000 is still four.
    expect(features(4000, [1000, 1000, 1000], 0, { neff: true }).neffMille).toBe(4000);
    // 6 and 3 and 1: 100 / (36 + 9 + 1) = 2.173…
    expect(features(10, [6, 3, 1], 0, { neff: true }).neffMille).toBe(2173);
    expect(features(0, [], 0, { neff: true }).neffMille).toBe(0);
  });
});

describe("flatForm", () => {
  it("makes small folders hamlets, with a band round the incumbent", () => {
    expect(flatForm(flatFeatures(24_999, 0, 0), undefined)).toBe("hamlet");
    expect(flatForm(flatFeatures(25_000, 0, 0), undefined)).toBe("neighbourhood");
    expect(flatForm(flatFeatures(31_249, 0, 0), "hamlet")).toBe("hamlet");
    expect(flatForm(flatFeatures(31_250, 0, 0), "hamlet")).toBe("neighbourhood");
  });

  it("makes large own-file folders street villages, with a band round the incumbent", () => {
    expect(flatForm(flatFeatures(50_000, 40, 600), undefined)).toBe("street-village");
    expect(flatForm(flatFeatures(50_000, 39, 600), undefined)).toBe("neighbourhood");
    expect(flatForm(flatFeatures(50_000, 40, 599), undefined)).toBe("neighbourhood");
    expect(flatForm(flatFeatures(50_000, 32, 480), "street-village")).toBe("street-village");
    expect(flatForm(flatFeatures(50_000, 31, 480), "street-village")).toBe("neighbourhood");
    expect(flatForm(flatFeatures(50_000, 32, 479), "street-village")).toBe("neighbourhood");
  });
});

describe("districtForm", () => {
  it("enters the first form with a margin of zero or more on a cold start", () => {
    expect(districtForm(districtFeatures(600, 0), undefined, [])).toBe("radial");
    expect(districtForm(districtFeatures(450, 300), undefined, [])).toBe("twin");
    expect(districtForm(districtFeatures(449, 300), undefined, [])).toBe("polycentric");
    expect(districtForm(districtFeatures(600, 0), "hamlet", [])).toBe("radial");
  });

  it("keeps the incumbent down to a margin of -150", () => {
    expect(districtForm(districtFeatures(450, 0), "radial", [])).toBe("radial");
    expect(districtForm(districtFeatures(449, 0), "radial", [])).toBe("polycentric");
  });

  it("lets an earlier form take over only with a margin of 100", () => {
    expect(districtForm(districtFeatures(699, 290), "twin", [])).toBe("twin");
    expect(districtForm(districtFeatures(700, 290), "twin", [])).toBe("radial");
  });

  it("moves to a later form only with a margin of 100", () => {
    // Twin falls out of its band; radial is earlier and too weak; polycentric always qualifies.
    expect(districtForm(districtFeatures(300, 140), "twin", [])).toBe("polycentric");
  });
});

describe("flatten", () => {
  it("lists own lots, then children by first appearance and path, recursively", () => {
    const tree = node({
      path: "a",
      lots: [seed("a/x")],
      docs: 1,
      children: [
        node({ path: "a/late", firstSeen: 5, lots: [seed("a/late/y")] }),
        node({ path: "a/early", firstSeen: 1, lots: [seed("a/early/z")], docs: 2 }),
      ],
    });
    const flat = flatten(tree);
    expect(flat.lots.map((l) => l.path)).toEqual(["a/x", "a/early/z", "a/late/y"]);
    expect(flat.docs).toBe(3);
  });
});

describe("classifyNode", () => {
  it("flattens a folder without children, or under the flatten limit", () => {
    expect(classifyNode(node({ path: "p", massMille: 1000, demand: FLATTEN_LIMIT * 9 }), undefined, [])).toBe("hamlet");
    expect(
      classifyNode(node({ path: "p", children: [child], massMille: 1000, demand: FLATTEN_LIMIT }), undefined, []),
    ).toBe("hamlet");
  });

  it("cuts a folder over the flatten limit", () => {
    const big = node({ path: "p", children: [child], massMille: 1000, demand: FLATTEN_LIMIT + 1 });
    expect(classifyNode(big, undefined, [])).toBe("radial");
  });

  it("keeps a flat folder flat up to 1.5 times the limit", () => {
    expect(classifyNode(grownNode((FLATTEN_LIMIT * 3) / 2), "hamlet", [])).toBe("hamlet");
    expect(classifyNode(grownNode((FLATTEN_LIMIT * 3) / 2 + 1), "hamlet", [])).toBe("radial");
  });

  it("keeps a cut folder cut down to the limit over 1.5", () => {
    const shrunk = (demand: number) => node({ path: "p", children: [child], massMille: 1000, demand });
    expect(classifyNode(shrunk((FLATTEN_LIMIT * 2) / 3 + 1), "radial", [])).toBe("radial");
    expect(classifyNode(shrunk((FLATTEN_LIMIT * 2) / 3), "radial", [])).toBe("hamlet");
    expect(classifyNode(node({ path: "p", massMille: 1000 }), "radial", [])).toBe("hamlet");
  });

  it("counts flattened lots for the street village", () => {
    const lots = Array.from({ length: 40 }, (_, i) => seed(`p/f${i}`));
    expect(classifyNode(node({ path: "p", lots, massMille: 40_000, demand: 1 }), undefined, [])).toBe("street-village");
  });
});

const islands = (packages: number, packageMille: number) => districtFeatures(300, 200, { packages, packageMille });

const fan = (neffMille: number, s1: number) => districtFeatures(s1, 0, { neffMille });

describe("toggled district forms", () => {
  it("takes a corridor first when its toggle is on: 90 % in one child, under 10 % own", () => {
    expect(districtForm(districtFeatures(900, 0, { f0: 99 }), undefined, ["corridor"])).toBe("corridor");
    expect(districtForm(districtFeatures(899, 0, { f0: 0 }), undefined, ["corridor"])).toBe("radial");
    expect(districtForm(districtFeatures(950, 0, { f0: 100 }), undefined, ["corridor"])).toBe("radial");
    expect(districtForm(districtFeatures(900, 0), undefined, [])).toBe("radial");
  });

  it("holds a corridor in its own narrow band", () => {
    expect(districtForm(districtFeatures(850, 0), "corridor", ["corridor"])).toBe("corridor");
    expect(districtForm(districtFeatures(849, 0), "corridor", ["corridor"])).toBe("radial");
    // A radial folder becomes a corridor only with a margin of 20.
    expect(districtForm(districtFeatures(919, 0), "radial", ["corridor"])).toBe("radial");
    expect(districtForm(districtFeatures(920, 0), "radial", ["corridor"])).toBe("corridor");
  });

  it("starts cold when the incumbent's toggle is off", () => {
    expect(districtForm(districtFeatures(950, 0), "corridor", [])).toBe("radial");
  });

  it("takes an archipelago for three packages holding half the mass", () => {
    expect(districtForm(islands(3, 500), undefined, ["archipelago"])).toBe("archipelago");
    expect(districtForm(islands(2, 900), undefined, ["archipelago"])).toBe("polycentric");
    expect(districtForm(islands(3, 499), undefined, ["archipelago"])).toBe("polycentric");
    expect(districtForm(islands(3, 350), "archipelago", ["archipelago"])).toBe("archipelago");
    expect(districtForm(islands(3, 349), "archipelago", ["archipelago"])).toBe("polycentric");
    expect(districtForm(islands(3, 500), undefined, [])).toBe("polycentric");
  });

  it("ranks an archipelago before a radial", () => {
    expect(districtForm(districtFeatures(700, 0, { packages: 4, packageMille: 900 }), undefined, ["archipelago"])).toBe(
      "archipelago",
    );
  });

  it("takes quarters for seven effective children with none over a quarter", () => {
    expect(districtForm(fan(7000, 250), undefined, ["quarters"])).toBe("quarters");
    expect(districtForm(fan(6999, 100), undefined, ["quarters"])).toBe("polycentric");
    expect(districtForm(fan(9000, 251), undefined, ["quarters"])).toBe("polycentric");
    // The band: down to (neff − 7) / 7 = −0.15, a challenger at +0.1.
    expect(districtForm(fan(5950, 100), "quarters", ["quarters"])).toBe("quarters");
    expect(districtForm(fan(5943, 100), "quarters", ["quarters"])).toBe("polycentric");
    expect(districtForm(fan(7699, 100), "polycentric", ["quarters"])).toBe("polycentric");
    expect(districtForm(fan(7700, 100), "polycentric", ["quarters"])).toBe("quarters");
    expect(districtForm(fan(9000, 100), undefined, [])).toBe("polycentric");
  });
});

const pkg = (path: string, member: boolean, sourceMille: number, massMille: number) =>
  node({ path, member, sourceMille, massMille, demand: FLATTEN_LIMIT });

describe("classifyNode with toggles", () => {
  it("counts as packages only members whose mass is at least half source", () => {
    const folder = (third: ReturnType<typeof pkg>) =>
      node({
        path: "p",
        children: [pkg("p/a", true, 1000, 2000), pkg("p/b", true, 1000, 1000), third],
        massMille: 4000,
        demand: FLATTEN_LIMIT * 4,
      });
    expect(classifyNode(folder(pkg("p/c", true, 500, 1000)), undefined, ["archipelago"])).toBe("archipelago");
    expect(classifyNode(folder(pkg("p/c", true, 499, 1000)), undefined, ["archipelago"])).toBe("polycentric");
    expect(classifyNode(folder(pkg("p/c", false, 1000, 1000)), undefined, ["archipelago"])).toBe("polycentric");
  });

  it("measures effective children only for quarters", () => {
    const children = Array.from({ length: 8 }, (_, i) => node({ path: `p/${i}`, massMille: 1000, demand: 10 }));
    const spread = node({ path: "p", children, massMille: 8000, demand: FLATTEN_LIMIT * 2 });
    expect(classifyNode(spread, undefined, ["quarters"])).toBe("quarters");
    expect(classifyNode(spread, undefined, [])).toBe("polycentric");
  });
});
