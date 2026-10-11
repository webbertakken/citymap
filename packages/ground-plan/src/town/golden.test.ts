import { describe, expect, it } from "vitest";
import { canonicalJson } from "../plat/canonical";
import { emptyTownPlat } from "../plat/plat";
import { outlineFor } from "../region/outline";
import { files, treeOf } from "../testing/fixtures";
import type { TreeNode } from "../tree/tree";
import { layoutTown } from "./layout";

// Golden cities: any change to the layout shows up here as a reviewable diff of the city and its plat.
const lay = (tree: TreeNode, room = 100) =>
  layoutTown("golden", "golden", tree, outlineFor((tree.demand * 2 * room) / 100, { x: 0, y: 0 }, "golden"), emptyTownPlat(), {
    order: "centre-out",
    jog: "top-level",
    warp: true,
    densityPct: 50,
  });

describe("golden towns", () => {
  it("lays a hamlet", async () => {
    const { town, plat } = lay(treeOf(files("", 20)), 300);
    await expect(canonicalJson({ town, plat })).toMatchFileSnapshot("__golden__/hamlet.json");
  });

  it("lays a twin", async () => {
    const { town, plat } = lay(treeOf([...files("lib", 300), ...files("kit", 250, 400), ...files("misc", 50, 800)]));
    await expect(canonicalJson({ town, plat })).toMatchFileSnapshot("__golden__/twin.json");
  });

  it("lays a radial town", async () => {
    const ring = ["north", "east", "south", "west", "up"].flatMap((d, i) => files(d, 40, 500 + i * 100));
    const { town, plat } = lay(treeOf([...files("core", 400), ...ring]));
    await expect(canonicalJson({ town, plat })).toMatchFileSnapshot("__golden__/radial.json");
  });
});
