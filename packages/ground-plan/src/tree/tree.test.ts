import { describe, expect, it } from "vitest";
import { LOT_AREA } from "../constants";
import { DEFAULT_LAND_USES } from "../land-use/land-use";
import type { FileEntry, Snapshot } from "../snapshot/snapshot";
import { buildTree, landFor, type TreeNode } from "./tree";

const at = (path: string, firstSeen = 0, identity = `${path}@${firstSeen}`): FileEntry => ({
  path,
  identity,
  firstSeen,
});
const snapshot = (files: FileEntry[], folders: Record<string, number> = {}): Snapshot => ({
  repository: "demo",
  commit: "worktree",
  index: 0,
  files: files.toSorted((a, b) => (a.path < b.path ? -1 : 1)),
  folderFirstSeen: new Map(Object.entries(folders)),
});
const options = { root: "", exclude: [], landUses: DEFAULT_LAND_USES, densityPct: 50 };
const find = (node: TreeNode, path: string): TreeNode | undefined =>
  node.path === path ? node : node.children.map((c) => find(c, path)).find(Boolean);

describe("landFor", () => {
  it("is the square of the lots' land over density plus a road margin", () => {
    expect(landFor(0, 50)).toBe(0);
    // √(6144 × 100 / 50) = 110 (floor), plus 2 × 44.
    expect(landFor(LOT_AREA, 50)).toBe((110 + 88) ** 2);
  });
});

describe("buildTree", () => {
  it("names the root after the repository and sorts children by path", () => {
    const { tree } = buildTree(snapshot([at("b/x.ts"), at("a/y.ts"), at("a/z.ts")]), options, {});
    expect(tree.name).toBe("demo");
    expect(tree.children.map((c) => c.path)).toEqual(["a", "b"]);
  });

  it("keeps tests off the land and docs as parks, outside the mass", () => {
    const { tree, offLand, docs } = buildTree(
      snapshot([at("src/a.ts"), at("src/a.test.ts"), at("src/README.md"), at("src/__fixtures__/f.json")]),
      options,
      {},
    );
    expect(offLand).toBe(2);
    expect(docs).toBe(1);
    const src = find(tree, "src");
    expect(src?.lots.map((l) => l.path)).toEqual(["src/a.ts"]);
    expect(src?.docs).toBe(1);
    expect(tree.massMille).toBe(1000);
  });

  it("gives tests land when the land dimension includes them", () => {
    const { tree, offLand } = buildTree(
      snapshot([at("a.test.ts"), at("b.test.ts")]),
      { ...options, landUses: [...DEFAULT_LAND_USES, "tests"] },
      {},
    );
    expect(offLand).toBe(0);
    expect(tree.lots).toHaveLength(1);
    expect(tree.massMille).toBe(600);
  });

  it("shares lots among files of one use, round(1 / weight) per lot", () => {
    const { tree, shares } = buildTree(snapshot([at("a.json", 0), at("b.json", 1), at("c.json", 2)]), options, {});
    expect(tree.lots.map((l) => l.key)).toEqual(["a.json@0", "c.json@2"]);
    expect(shares["|config"]).toEqual([
      { key: "a.json@0", members: ["a.json@0", "b.json@1"] },
      { key: "c.json@2", members: ["c.json@2"] },
    ]);
  });

  it("keeps a shared lot while a member lives and fills it with a newcomer", () => {
    const first = buildTree(snapshot([at("a.json", 0), at("b.json", 1)]), options, {});
    const later = buildTree(snapshot([at("b.json", 1), at("c.json", 5)]), options, first.shares);
    expect(later.tree.lots.map((l) => [l.key, l.path])).toEqual([["a.json@0", "b.json"]]);
    expect(later.shares["|config"]).toEqual([{ key: "a.json@0", members: ["b.json@1", "c.json@5"] }]);
  });

  it("does not mutate the shares it is given", () => {
    const shares = { "|config": [{ key: "x@0", members: ["x@0"] }] };
    buildTree(snapshot([at("a.json")]), options, shares);
    expect(shares["|config"]).toEqual([{ key: "x@0", members: ["x@0"] }]);
  });

  it("collapses chains of empty single-child folders", () => {
    const { tree } = buildTree(snapshot([at("src/main/kotlin/app/A.kt", 3)], { src: 1, "src/main": 2 }), options, {});
    expect(tree.children.map((c) => [c.path, c.name, c.depth, c.firstSeen])).toEqual([
      ["src/main/kotlin/app", "src/main/kotlin/app", 1, 0],
    ]);
  });

  it("builds a sub-town from its root and leaves excluded folders out", () => {
    const files = [at("packages/a/x.ts"), at("packages/b/y.ts"), at("src/z.ts")];
    const group = buildTree(snapshot(files), { ...options, root: "packages" }, {});
    expect(group.tree.name).toBe("packages");
    expect(group.tree.children.map((c) => c.path)).toEqual(["packages/a", "packages/b"]);
    const main = buildTree(snapshot(files), { ...options, exclude: ["packages"] }, {});
    expect(main.tree.children.map((c) => c.path)).toEqual(["src"]);
  });

  it("sums mass and demand up the tree", () => {
    const { tree } = buildTree(snapshot([at("a/x.ts"), at("a/y.json"), at("b/z.ts"), at("b/README.md")]), options, {});
    expect(tree.massMille).toBe(2500);
    const a = find(tree, "a");
    const b = find(tree, "b");
    expect(a?.demand).toBe(landFor(2 * LOT_AREA, 50));
    expect(b?.demand).toBe(landFor(LOT_AREA, 50) + landFor(LOT_AREA / 2, 50));
    expect(tree.demand).toBe((a?.demand ?? 0) + (b?.demand ?? 0));
  });

  it("orders own lots by first appearance, then path", () => {
    const { tree } = buildTree(snapshot([at("b.ts", 0), at("a.ts", 2), at("c.ts", 0)]), options, {});
    expect(tree.lots.map((l) => l.path)).toEqual(["b.ts", "c.ts", "a.ts"]);
  });
});
