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
  ...over,
});

describe("features", () => {
  it("measures the heaviest children and own files in per mille", () => {
    const f = features(10_000, [6000, 3000], 7);
    expect(f).toEqual({ massMille: 10_000, s1: 600, s2: 300, f0: 100, lots: 7 });
  });

  it("is all zero for an empty folder", () => {
    expect(features(0, [], 0)).toEqual({ massMille: 0, s1: 0, s2: 0, f0: 0, lots: 0 });
  });
});

describe("flatForm", () => {
  const f = (massMille: number, lots: number, f0: number) => ({ massMille, s1: 0, s2: 0, f0, lots });

  it("makes small folders hamlets, with a band round the incumbent", () => {
    expect(flatForm(f(24_999, 0, 0), undefined)).toBe("hamlet");
    expect(flatForm(f(25_000, 0, 0), undefined)).toBe("neighbourhood");
    expect(flatForm(f(31_249, 0, 0), "hamlet")).toBe("hamlet");
    expect(flatForm(f(31_250, 0, 0), "hamlet")).toBe("neighbourhood");
  });

  it("makes large own-file folders street villages, with a band round the incumbent", () => {
    expect(flatForm(f(50_000, 40, 600), undefined)).toBe("street-village");
    expect(flatForm(f(50_000, 39, 600), undefined)).toBe("neighbourhood");
    expect(flatForm(f(50_000, 40, 599), undefined)).toBe("neighbourhood");
    expect(flatForm(f(50_000, 32, 480), "street-village")).toBe("street-village");
    expect(flatForm(f(50_000, 31, 480), "street-village")).toBe("neighbourhood");
    expect(flatForm(f(50_000, 32, 479), "street-village")).toBe("neighbourhood");
  });
});

describe("districtForm", () => {
  const f = (s1: number, s2: number) => ({ massMille: 1, s1, s2, f0: 0, lots: 0 });

  it("enters the first form with a margin of zero or more on a cold start", () => {
    expect(districtForm(f(600, 0), undefined)).toBe("radial");
    expect(districtForm(f(450, 300), undefined)).toBe("twin");
    expect(districtForm(f(449, 300), undefined)).toBe("polycentric");
    expect(districtForm(f(600, 0), "hamlet")).toBe("radial");
  });

  it("keeps the incumbent down to a margin of -150", () => {
    expect(districtForm(f(450, 0), "radial")).toBe("radial");
    expect(districtForm(f(449, 0), "radial")).toBe("polycentric");
  });

  it("lets an earlier form take over only with a margin of 100", () => {
    expect(districtForm(f(699, 290), "twin")).toBe("twin");
    expect(districtForm(f(700, 290), "twin")).toBe("radial");
  });

  it("moves to a later form only with a margin of 100", () => {
    // Twin falls out of its band; radial is earlier and too weak; polycentric always qualifies.
    expect(districtForm(f(300, 140), "twin")).toBe("polycentric");
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
  const child = node({ path: "p/c", massMille: 1000, demand: 10 });

  it("flattens a folder without children, or under the flatten limit", () => {
    expect(classifyNode(node({ path: "p", massMille: 1000, demand: FLATTEN_LIMIT * 9 }), undefined)).toBe("hamlet");
    expect(
      classifyNode(node({ path: "p", children: [child], massMille: 1000, demand: FLATTEN_LIMIT }), undefined),
    ).toBe("hamlet");
  });

  it("cuts a folder over the flatten limit", () => {
    const big = node({ path: "p", children: [child], massMille: 1000, demand: FLATTEN_LIMIT + 1 });
    expect(classifyNode(big, undefined)).toBe("radial");
  });

  it("keeps a flat folder flat up to 1.5 times the limit", () => {
    const grown = (demand: number) => node({ path: "p", children: [child], massMille: 1000, demand });
    expect(classifyNode(grown((FLATTEN_LIMIT * 3) / 2), "hamlet")).toBe("hamlet");
    expect(classifyNode(grown((FLATTEN_LIMIT * 3) / 2 + 1), "hamlet")).toBe("radial");
  });

  it("keeps a cut folder cut down to the limit over 1.5", () => {
    const shrunk = (demand: number) => node({ path: "p", children: [child], massMille: 1000, demand });
    expect(classifyNode(shrunk((FLATTEN_LIMIT * 2) / 3 + 1), "radial")).toBe("radial");
    expect(classifyNode(shrunk((FLATTEN_LIMIT * 2) / 3), "radial")).toBe("hamlet");
    expect(classifyNode(node({ path: "p", massMille: 1000 }), "radial")).toBe("hamlet");
  });

  it("counts flattened lots for the street village", () => {
    const lots = Array.from({ length: 40 }, (_, i) => seed(`p/f${i}`));
    expect(classifyNode(node({ path: "p", lots, massMille: 40_000, demand: 1 }), undefined)).toBe("street-village");
  });
});
