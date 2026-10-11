import { describe, expect, it } from "vitest";
import type { Town } from "../city/city";
import { canonicalJson } from "../plat/canonical";
import { emptyTownPlat, type TownPlat } from "../plat/plat";
import { outlineFor } from "../region/outline";
import { files, treeOf } from "../testing/fixtures";
import type { FileEntry } from "../snapshot/snapshot";
import type { TreeNode } from "../tree/tree";
import type { LayoutOptions } from "./context";
import { cutClass } from "./cut";
import { layoutTown } from "./layout";
import { centreOut } from "./partition";

const OPTIONS: LayoutOptions = { order: "centre-out", jog: "top-level", warp: false, densityPct: 50 };

/** Lays a tree on an outline of its land times room/100, or on the outline of an earlier tree (as a town keeps it). */
function lay(tree: TreeNode, plat: TownPlat = emptyTownPlat(), options: Partial<LayoutOptions> = {}, room = 100, landOf = tree) {
  const outline = outlineFor((landOf.demand * 2 * room) / 100, { x: 0, y: 0 }, "demo");
  return layoutTown("demo", "demo", tree, outline, plat, { ...OPTIONS, ...options });
}

const codes = (events: readonly { code: string }[]) => events.map((e) => e.code);
const live = (town: Town) => town.lots.filter((l) => !l.vacant);
const positions = (town: Town) => new Map(live(town).map((l) => [l.key, canonicalJson(l.pts)]));

// Folder fixtures: a dominant core with a ring, two dominant halves, and six comparable centres.
const RING = ["north", "east", "south", "west", "up"];
const radialRepo = (): FileEntry[] => [...files("core", 400, 0), ...RING.flatMap((d, i) => files(d, 40, 500 + i * 100))];
const twinRepo = (): FileEntry[] => [...files("lib", 300, 0), ...files("test-kit", 250, 400), ...files("misc", 50, 800)];
const SIZES = [150, 60, 200, 90, 120, 180];
const sixRepo = (): FileEntry[] => ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(d, SIZES[i] as number, i * 300));

describe("cutClass", () => {
  it("ranks roads by the tier of the land being cut", () => {
    expect([cutClass(3_000_000, true), cutClass(3_000_000, false)]).toEqual(["boulevard", "avenue"]);
    expect([cutClass(300_000, true), cutClass(300_000, false)]).toEqual(["avenue", "collector"]);
    expect([cutClass(30_000, true), cutClass(30_000, false)]).toEqual(["collector", "street"]);
    expect(cutClass(29_999, true)).toBe("street");
  });
});

describe("centreOut", () => {
  it("puts the oldest in the middle and newcomers at the edges", () => {
    expect(centreOut([1, 2, 3, 4, 5])).toEqual([4, 2, 1, 3, 5]);
  });
});

describe("layoutTown", () => {
  it("is deterministic, warp included, and leaves its input plat untouched", () => {
    const tree = treeOf(sixRepo());
    const plat = emptyTownPlat();
    const a = lay(tree, plat, { warp: true });
    const b = lay(tree, plat, { warp: true });
    expect(canonicalJson(a.town)).toBe(canonicalJson(b.town));
    expect(canonicalJson(a.plat)).toBe(canonicalJson(b.plat));
    expect(plat).toEqual(emptyTownPlat());
  });

  it("gives every file of a polycentric town a lot", () => {
    const { town } = lay(treeOf(sixRepo()));
    expect(town.form).toBe("polycentric");
    expect(town.stats.lots).toBe(800);
    expect(town.stats.overflow).toBe(0);
    expect(new Set(town.lots.map((l) => l.address)).size).toBe(800);
  });

  it("jogs a long top-level cut round a plaza, unless jogging is off", () => {
    expect(lay(treeOf(sixRepo())).town.blocks.some((b) => b.kind === "plaza")).toBe(true);
    expect(lay(treeOf(sixRepo()), emptyTownPlat(), { jog: "off" }).town.blocks.some((b) => b.kind === "plaza")).toBe(false);
  });

  it("orders children by first appearance when asked", () => {
    const { town } = lay(treeOf(sixRepo()), emptyTownPlat(), { order: "first-seen" });
    expect(town.stats.lots).toBe(800);
  });

  it("lays a radial town with a ring road, and re-sectors for a newcomer", () => {
    const first = lay(treeOf(radialRepo()));
    expect(first.town.form).toBe("radial");
    // Without folder ages, the ring follows path order.
    expect(first.plat.radial[""]?.order).toEqual([...RING].sort());
    expect(first.town.roads.some((r) => r.pts.length === RING.length + 1)).toBe(true);
    const grown = lay(treeOf([...radialRepo(), ...files("down", 40, 2000)]), first.plat, {}, 100, treeOf(radialRepo()));
    expect(codes(grown.events)).toContain("plat/radial-resector");
    expect(grown.plat.radial[""]?.order).toEqual([...[...RING].sort(), "down"]);
    // Every ring item lays afresh in its new sector: its old grid would lie across the turned land.
    const forgotten = grown.events.filter((e) => e.code === "plat/forget").map((e) => e.detail.key);
    expect([...forgotten].sort()).toEqual(expect.arrayContaining(["core", ...RING]));
    expect(grown.town.stats.overflow).toBe(0);
  });

  it("falls back to cuts when a radial ring has fewer than three items", () => {
    const { town, plat } = lay(treeOf([...files("core", 400), ...files("one", 60, 500), ...files("two", 60, 600)]));
    expect(town.form).toBe("radial");
    expect(plat.radial[""]).toBeUndefined();
    expect(plat.cuts[""]).toBeDefined();
  });

  it("lays a twin town across a river with a bridge", () => {
    const { town, plat } = lay(treeOf(twinRepo()));
    expect(town.form).toBe("twin");
    expect(plat.cuts[""]?.river).toBe(true);
    expect(town.water).toHaveLength(1);
    expect(town.stats.lots).toBe(600);
  });

  it("keeps every surviving lot in place when files are deleted, and shows the gaps as vacant", () => {
    const all = sixRepo();
    const first = lay(treeOf(all));
    const kept = all.filter((_, i) => i % 10 !== 0);
    const second = lay(treeOf(kept), first.plat, {}, 100, treeOf(all));
    const before = positions(first.town);
    for (const [key, pts] of positions(second.town)) expect(pts).toBe(before.get(key));
    expect(second.town.lots.filter((l) => l.vacant)).toHaveLength(80);
  });

  it("moves only the folder whose land a newcomer folder shares", () => {
    const first = lay(treeOf(sixRepo()));
    const second = lay(treeOf([...sixRepo(), ...files("g", 10, 5000)]), first.plat, {}, 100, treeOf(sixRepo()));
    const before = positions(first.town);
    const movedFolders = new Set<string>();
    for (const [key, pts] of positions(second.town)) if (before.has(key) && pts !== before.get(key)) movedFolders.add(key.split("/")[0] as string);
    expect(movedFolders.size).toBeLessThanOrEqual(1);
  });

  it("lends an emptied side's land to its sibling, which grows over it without moving", () => {
    const first = lay(treeOf(sixRepo()));
    const [pairKey, pair] = Object.entries(first.plat.cuts).find(([, c]) => c.left.length === 1 && c.right.length === 1) ?? [];
    expect(pair).toBeDefined();
    const [stay, gone] = [pair?.left[0] as string, pair?.right[0] as string];
    const goneCount = sixRepo().filter((f) => f.path.startsWith(`${gone}/`)).length;
    // More than the old half holds even at lot class 1, but within the band of the land the pair had.
    const newcomers = files(stay, goneCount + 60, 9000).map((f) => ({ ...f, path: f.path.replace("/f", "/n"), identity: `n${f.identity}` }));
    const next = [...sixRepo().filter((f) => !f.path.startsWith(`${gone}/`)), ...newcomers];
    const second = lay(treeOf(next), first.plat, {}, 100, treeOf(sixRepo()));
    expect(second.town.form).toBe(first.town.form);
    expect(second.town.stats.overflow).toBe(0);
    expect(second.plat.cuts[pairKey as string]).toBeDefined();
    // Every surviving lot keeps its slot (only strips clipped by the old cut may now reach into the lent land), except in
    // a neighbourhood that narrowed its lot class to seat the newcomers, which re-lays by design.
    const narrowed = new Set(second.events.filter((e) => e.code === "plat/narrow").map((e) => e.detail.key));
    for (const [key, grid] of Object.entries(first.plat.grids).filter(([k]) => !narrowed.has(k)))
      for (const [lot, slot] of Object.entries(grid.slots))
        if (second.plat.grids[key]?.slots[lot] !== undefined) expect(second.plat.grids[key]?.slots[lot]).toBe(slot);
    expect(Object.keys(second.plat.grids[stay]?.slots ?? {}).length).toBeGreaterThan(Object.keys(first.plat.grids[stay]?.slots ?? {}).length);
  });

  it("moves a remembered cut when one side outgrows its band", () => {
    const first = lay(treeOf(sixRepo()));
    const second = lay(treeOf([...sixRepo(), ...files("a/more", 600, 5000)]), first.plat);
    expect(codes(second.events)).toContain("plat/recut");
  });

  it("forgets a folder's records when its form switches", () => {
    const first = lay(treeOf(files("solo", 30)));
    const second = lay(treeOf(sixRepo()), first.plat);
    expect(codes(second.events)).toContain("plat/switch");
  });
});

describe("layoutTown edge cases", () => {
  it("cuts a folder's own lots and its docs park beside its child folders", () => {
    const docs = Array.from({ length: 40 }, (_, i) => ({ path: `guide-${i}.md`, identity: `g${i}`, firstSeen: i }));
    const { town, plat } = lay(treeOf([...files("", 120), ...docs, ...files("a", 150, 200), ...files("b", 150, 400)]));
    expect(Object.values(plat.cuts).some((c) => [...c.left, ...c.right].includes("#lots"))).toBe(true);
    expect(Object.values(plat.cuts).some((c) => [...c.left, ...c.right].includes("#park"))).toBe(true);
    expect(town.blocks.some((b) => b.kind === "park")).toBe(true);
  });

  it("lets the growing side take an emptied side's land without moving the cut", () => {
    const first = lay(treeOf(sixRepo()));
    const root = first.plat.cuts[""];
    expect(root).toBeDefined();
    const kept = sixRepo().filter((f) => root?.left.includes(f.path.split("/")[0] as string));
    // Each survivor grows by 150 files, so the root stays polycentric while its left side outgrows its band.
    const grown = [
      ...kept,
      ...(root?.left ?? []).flatMap((folder, i) =>
        files(folder, 150, 9000 + i * 200).map((f) => ({ ...f, path: f.path.replace("/f", "/g"), identity: `g${f.identity}` })),
      ),
    ];
    const second = lay(treeOf(grown), first.plat, {}, 100, treeOf(sixRepo()));
    expect(second.town.form).toBe("polycentric");
    expect(second.plat.cuts[""]?.c).toBe(root?.c);
    expect(second.town.blocks.some((b) => b.kind === "reserve")).toBe(true);
  });

  it("keeps a vacated radial sector as reserve until the ring re-sectors", () => {
    const first = lay(treeOf(radialRepo()));
    const without = radialRepo().filter((f) => !f.path.startsWith("up/"));
    const second = lay(treeOf(without), first.plat, {}, 100, treeOf(radialRepo()));
    expect(second.plat.radial[""]?.order).toContain("up");
    expect(second.town.blocks.some((b) => b.kind === "reserve")).toBe(true);
  });

  it("warps a twin town's river with the rest", () => {
    const { town } = lay(treeOf(twinRepo()), emptyTownPlat(), { warp: true });
    expect(town.water[0]?.length).toBeGreaterThan(4);
  });

  it("counts every lot as overflow when the land is too small to build on", () => {
    const tree = treeOf(files("", 5));
    const tiny = outlineFor(200, { x: 0, y: 0 }, "demo");
    const { town, events } = layoutTown("demo", "demo", tree, tiny, emptyTownPlat(), OPTIONS);
    expect(town.stats.overflow).toBe(5);
    expect(codes(events)).toContain("town/overflow");
    const docsOnly = treeOf([{ path: "a.md", identity: "a", firstSeen: 0 }]);
    expect(layoutTown("demo", "demo", docsOnly, tiny, emptyTownPlat(), OPTIONS).events).toEqual([]);
  });
});

describe("neighbourhoods", () => {
  it("gathers a hamlet round a green when it has room to spare", () => {
    const { town, plat } = lay(treeOf(files("", 20)), emptyTownPlat(), {}, 2000);
    expect(town.form).toBe("hamlet");
    expect(plat.grids[""]?.green).toBeDefined();
    expect(town.blocks.some((b) => b.kind === "green")).toBe(true);
  });

  it("runs a street village along a collector high street", () => {
    const { town, plat } = lay(treeOf(files("", 60)), emptyTownPlat(), {}, 400);
    expect(town.form).toBe("street-village");
    expect(plat.grids[""]?.high).toBeDefined();
    expect(town.roads.some((r) => r.cls === "collector")).toBe(true);
  });

  it("renews a neighbourhood whose remembered lots are mostly vacant", () => {
    // A plain neighbourhood (its files are all in child folders) that keeps its form at 25 of 60 files.
    const all = [...files("a", 30), ...files("b", 30, 100)];
    const first = lay(treeOf(all), emptyTownPlat(), {}, 100);
    expect(first.town.form).toBe("neighbourhood");
    const kept = [...files("a", 15), ...files("b", 10, 100)];
    const second = lay(treeOf(kept), first.plat, {}, 100, treeOf(all));
    expect(second.town.form).toBe("neighbourhood");
    expect(codes(second.events)).toContain("plat/renew");
    expect(second.town.lots.every((l) => !l.vacant)).toBe(true);
  });

  it("lays docs as a park strip", () => {
    const docs = Array.from({ length: 30 }, (_, i) => ({ path: `guide-${i}.md`, identity: `g${i}`, firstSeen: i }));
    const { town } = lay(treeOf([...files("", 40), ...docs]));
    expect(town.blocks.some((b) => b.kind === "park")).toBe(true);
  });

  it("counts lots without room as overflow", () => {
    const { town, events } = lay(treeOf(files("", 200)), emptyTownPlat(), {}, 20);
    expect(town.stats.overflow).toBeGreaterThan(0);
    expect(codes(events)).toContain("town/overflow");
  });

  it("keeps an address once issued", () => {
    const first = lay(treeOf(files("", 60)), emptyTownPlat(), {}, 400);
    const second = lay(treeOf(files("", 60)), first.plat, {}, 400);
    expect(second.town.lots.map((l) => l.address)).toEqual(first.town.lots.map((l) => l.address));
  });
});
