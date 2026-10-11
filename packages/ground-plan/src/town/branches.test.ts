import { describe, expect, it } from "vitest";
import { DIRECTION, TURN } from "../fixed/direction";
import { area2 } from "../fixed/polygon";
import { emptyTownPlat, type TownPlat } from "../plat/plat";
import { outlineFor } from "../region/outline";
import type { LotSeed, TreeNode } from "../tree/tree";
import { emptyCtx, files, rect, treeOf } from "../testing/fixtures";
import type { FileEntry } from "../snapshot/snapshot";
import type { LayoutOptions } from "./context";
import { park, reserve, trim } from "./cut";
import { layoutTown } from "./layout";
import { neighbourhood } from "./neighbourhood";
import { sector } from "./partition";

const OPTIONS: LayoutOptions = { order: "centre-out", jog: "top-level", warp: false, densityPct: 50 };
const lay = (tree: TreeNode, plat: TownPlat = emptyTownPlat(), options: Partial<LayoutOptions> = {}, landOf = tree) =>
  layoutTown("demo", "demo", tree, outlineFor(landOf.demand * 2, { x: 0, y: 0 }, "demo"), plat, { ...OPTIONS, ...options });
const plazas = (tree: TreeNode, plat?: TownPlat, options?: Partial<LayoutOptions>, landOf?: TreeNode) =>
  lay(tree, plat, options, landOf).town.blocks.filter((b) => b.kind === "plaza").length;
const SIZES = [150, 60, 200, 90, 120, 180];
const varied = (): FileEntry[] => ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(d, SIZES[i] as number, i * 300));
const seeds = (n: number): LotSeed[] => files("", n).map((f) => ({ key: f.identity, path: f.path, use: "source", firstSeen: f.firstSeen }));

describe("park and reserve", () => {
  it("leave land too small for pavement empty", () => {
    const ctx = emptyCtx();
    park(ctx, rect(10, 10), "d");
    reserve(ctx, rect(10, 10), "d");
    expect(ctx.blocks).toEqual([]);
  });
});

describe("trim", () => {
  const seg = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ] as const;
  const EAST = [DIRECTION, 0] as const;

  it("keeps the part of a segment within the bounds, either way round", () => {
    expect(trim(seg, EAST, 20 * DIRECTION, null)).toEqual([
      { x: 20, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(trim([seg[1], seg[0]], EAST, null, 30 * DIRECTION)).toEqual([
      { x: 30, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it("returns nothing for no segment, or bounds that miss it", () => {
    expect(trim(null, EAST, null, null)).toBeNull();
    expect(trim(seg, EAST, 200 * DIRECTION, null)).toBeNull();
  });

  it("keeps or drops a segment square to the bounds' direction whole", () => {
    const NORTH = [0, DIRECTION] as const;
    expect(trim(seg, NORTH, -1, 1)).toEqual([...seg]);
    expect(trim(seg, NORTH, 5, null)).toBeNull();
    expect(trim(seg, NORTH, null, -5)).toBeNull();
  });
});

describe("pinwheel guards", () => {
  it("jogs nested long cuts too when every cut may jog", () => {
    expect(plazas(treeOf(varied()), undefined, { jog: "all" })).toBeGreaterThanOrEqual(plazas(treeOf(varied())));
  });

  it("keeps a straight crossroads when the cross cuts line up", () => {
    const even = ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(d, 150, i * 300));
    expect(plazas(treeOf(even))).toBe(0);
  });

  it("does not jog cuts remembered from a plat laid without jogs", () => {
    const first = lay(treeOf(varied()), emptyTownPlat(), { jog: "off" });
    expect(plazas(treeOf(varied()), first.plat)).toBe(0);
  });

  it("stops jogging when a quarter empties", () => {
    const first = lay(treeOf(varied()));
    const quarter = first.plat.cuts[">L"]?.left[0] as string;
    const rest = varied().filter((f) => !f.path.startsWith(`${quarter}/`));
    expect(plazas(treeOf(rest), first.plat, {}, treeOf(varied()))).toBe(0);
  });

  it("does not jog a short cut deep inside a big town", () => {
    const docs = (folder: string, n: number, born: number) =>
      Array.from({ length: n }, (_, k) => ({ path: `${folder}/doc-${k}.md`, identity: `${folder}-${k}`, firstSeen: born + k }));
    const quarter = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].flatMap((q, i) => [...files(`small/${q}`, 2, 20_000 + i * 100), ...docs(`small/${q}`, [60, 30, 80, 40, 70, 35, 65, 50][i] as number, 20_010 + i * 100)]);
    const { town, plat } = lay(treeOf([...docs("park", 10_000, 0), ...quarter]), emptyTownPlat(), { jog: "all" });
    expect(Object.keys(plat.cuts).some((k) => k.startsWith("small"))).toBe(true);
    expect(town.stats.lots).toBe(16);
  });

  it("jogs only the root's own cuts at top level, and skips short cuts when every cut may jog", () => {
    const nested = ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(`big/${d}`, SIZES[i] as number, i * 300));
    const withSibling = [...nested, ...files("small", 20, 5000), ...files("tiny", 10, 6000)];
    const top = lay(treeOf(withSibling));
    const all = lay(treeOf(withSibling), emptyTownPlat(), { jog: "all" });
    expect(all.town.blocks.filter((b) => b.kind === "plaza").length).toBeGreaterThanOrEqual(top.town.blocks.filter((b) => b.kind === "plaza").length);
  });

  it("jogs a street between small folders, keeping one district", () => {
    // Docs give land without mass: a town of streets that is still too big to flatten.
    const parks = (d: string, i: number) => [
      ...files(d, 4, i * 300),
      ...Array.from({ length: [120, 50, 160, 80, 100, 140][i] as number }, (_, k) => ({
        path: `${d}/doc-${k}.md`,
        identity: `${d}-doc-${k}`,
        firstSeen: i * 300 + 10 + k,
      })),
    ];
    const town = lay(treeOf(["a", "b", "c", "d", "e", "f"].flatMap((d, i) => parks(d, i)))).town;
    expect(town.roads.some((r) => r.cls === "collector" || r.cls === "avenue")).toBe(false);
    expect(town.blocks.some((b) => b.kind === "plaza")).toBe(true);
  });

  it("gives cross cuts below collectors their side's district", () => {
    const mid = ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(d, [56, 21, 70, 31, 42, 60][i] as number, i * 300));
    const { town } = lay(treeOf(mid));
    expect(town.roads.some((r) => r.cls === "collector")).toBe(true);
    expect(town.blocks.some((b) => b.kind === "plaza")).toBe(true);
  });

  it("leaves no plaza where a boulevard is wider than the jog", () => {
    const city = ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(d, [560, 320, 640, 400, 480, 600][i] as number, i * 1000));
    const { town } = lay(treeOf(city));
    expect(town.roads.some((r) => r.cls === "boulevard")).toBe(true);
    expect(town.blocks.some((b) => b.kind === "plaza")).toBe(false);
  });
});

describe("radial and twin edge cases", () => {
  const radialRepo = () => [...files("core", 400, 0), ...["n", "e", "s", "w", "u"].flatMap((d, i) => files(d, 40, 500 + i * 100))];

  it("re-centres on a new core when another child outgrows it", () => {
    const first = lay(treeOf(radialRepo()));
    const grown = [...radialRepo().filter((f) => !f.path.startsWith("core/")), ...files("core", 40), ...files("n", 600, 3000).map((f) => ({ ...f, path: f.path.replace("/f", "/g"), identity: `g${f.identity}` }))];
    const second = lay(treeOf(grown), first.plat, {}, treeOf(radialRepo()));
    expect(second.plat.radial[""]?.core ?? second.town.form).not.toBe("core");
  });

  it("declines a ring item that needs more than 171 degrees", () => {
    const { town, plat } = lay(treeOf([...files("core", 600), ...files("a", 200, 1000), ...files("b", 20, 2000), ...files("c", 20, 3000)]));
    expect(town.form).toBe("radial");
    expect(plat.radial[""]).toBeUndefined();
  });

  it("falls back to cuts when the region forces a form the folder cannot take", () => {
    const flatTree = treeOf([...files("", 200), ...files("only", 300, 500)]);
    expect(layoutTown("demo", "demo", flatTree, outlineFor(flatTree.demand * 2, { x: 0, y: 0 }, "demo"), emptyTownPlat(), OPTIONS, "twin").town.form).toBe("twin");
    const noFolders = treeOf(files("", 300));
    const forced = layoutTown("demo", "demo", noFolders, outlineFor(noFolders.demand * 2, { x: 0, y: 0 }, "demo"), emptyTownPlat(), OPTIONS, "radial");
    expect(forced.town.form).toBe("radial");
    expect(forced.town.stats.lots).toBe(300);
  });

  it("bridges a short river once", () => {
    // Too small to cut on its own, so the region forces the form, as it does for a town root.
    const small = treeOf([...files("lib", 30), ...files("kit", 25, 100), ...files("x", 5, 200)]);
    const { town } = layoutTown("demo", "demo", small, outlineFor(small.demand * 2, { x: 0, y: 0 }, "demo"), emptyTownPlat(), OPTIONS, "twin");
    expect(town.form).toBe("twin");
    expect(town.roads.filter((r) => r.cls === "street" && r.pts.length === 2).length).toBeGreaterThanOrEqual(1);
  });

  it("declines a ring item whose docs need more than half the land", () => {
    const docs = Array.from({ length: 3000 }, (_, k) => ({ path: `a/doc-${k}.md`, identity: `doc-${k}`, firstSeen: 1000 + k }));
    const tree = treeOf([...files("core", 400), ...files("a", 10, 900), ...docs, ...files("b", 10, 5000), ...files("c", 10, 6000), ...files("d", 10, 7000)]);
    const { town, plat } = lay(tree);
    expect(town.form).toBe("radial");
    expect(plat.radial[""]).toBeUndefined();
  });

  it("balances a twin's extra folders across both banks, and keeps an emptied bank as reserve", () => {
    const repo = [...files("lib", 300), ...files("kit", 250, 400), ...files("x", 60, 800), ...files("y", 10, 900)];
    const first = lay(treeOf(repo));
    expect(first.plat.cuts[""]?.left).toContain("y");
    const tree = treeOf(repo.filter((f) => !f.path.startsWith("kit/") && !f.path.startsWith("x/")));
    const second = layoutTown("demo", "demo", tree, outlineFor(treeOf(repo).demand * 2, { x: 0, y: 0 }, "demo"), first.plat, OPTIONS, "twin");
    expect(second.town.blocks.some((b) => b.kind === "reserve")).toBe(true);
  });

  it("bridges a very short river at its middle", () => {
    const tiny = treeOf([...files("lib", 6), ...files("kit", 5, 100), ...files("x", 1, 200)]);
    const { town } = layoutTown("demo", "demo", tiny, outlineFor(tiny.demand * 2, { x: 0, y: 0 }, "demo"), emptyTownPlat(), OPTIONS, "twin");
    expect(town.water).toHaveLength(1);
  });

  it("gives a zero-width sector the land between its spokes only", () => {
    const land = rect(1000, 1000);
    expect(area2(sector(land, { x: 500, y: 500 }, 0, 0, 500, 0, 0).p)).toBe(0);
    expect(area2(sector(land, { x: 500, y: 500 }, 0, TURN / 4, 500, 0, 0).p)).toBeGreaterThan(0);
  });
});

describe("neighbourhood edge cases", () => {
  it("keeps a remembered park line and warp scale", () => {
    const docs = Array.from({ length: 30 }, (_, i) => ({ path: `guide-${i}.md`, identity: `g${i}`, firstSeen: i }));
    const tree = treeOf([...files("", 40), ...docs]);
    const first = lay(tree, emptyTownPlat(), { warp: true });
    const second = lay(tree, first.plat, { warp: true });
    expect(second.plat.grids[""]?.park).toEqual(first.plat.grids[""]?.park);
    expect(second.plat.diameter).toBe(first.plat.diameter);
  });

  it("lays single rows of lots on narrow land, and gives up a green the lots cannot spare", () => {
    const ctx = emptyCtx();
    neighbourhood(ctx, rect(1700, 200), seeds(30), 0, "k", "d", "hamlet");
    expect(ctx.plat.grids.k?.green).toBeUndefined();
    expect(ctx.lots).toHaveLength(30);
  });

  it("narrows the lot class when clipped blocks hold fewer wide lots", () => {
    const ctx = emptyCtx();
    const trapezoid = { p: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 300, y: 700 }, { x: 100, y: 700 }], w: [0, 0, 0, 0] };
    neighbourhood(ctx, trapezoid, seeds(8), 0, "k", "d", "neighbourhood");
    expect(ctx.lots).toHaveLength(8);
  });

  it("narrows its lot class and re-lays when its lots outgrow their slots", () => {
    const ctx = emptyCtx();
    neighbourhood(ctx, rect(1800, 900), seeds(10), 0, "k", "d", "neighbourhood");
    const wide = ctx.plat.grids.k?.span ?? 0;
    expect(wide).toBeGreaterThan(1);
    const later = { ...emptyCtx(), plat: ctx.plat };
    neighbourhood(later, rect(1800, 900), seeds(60), 0, "k", "d", "neighbourhood");
    expect(later.plat.grids.k?.span).toBeLessThan(wide);
    expect(later.overflow).toBe(0);
    expect(later.events.map((e) => e.code)).toContain("plat/narrow");
  });

  it("lays a park line afresh when it no longer crosses its land", () => {
    const docs = 400;
    const ctx = emptyCtx();
    neighbourhood(ctx, rect(1800, 900), seeds(20), docs * 3000, "k", "d", "neighbourhood");
    const moved = { ...emptyCtx(), plat: ctx.plat };
    const elsewhere = { p: rect(1800, 900).p.map((q) => ({ x: q.x + 5000, y: q.y + 5000 })), w: [0, 0, 0, 0] };
    neighbourhood(moved, elsewhere, seeds(20), docs * 3000, "k", "d", "neighbourhood");
    expect(moved.overflow).toBe(0);
    expect(moved.lots).toHaveLength(20);
  });

  it("lays its grid afresh when the cuts around it moved its land off the grid", () => {
    const box = (x: number, y: number, w: number, h: number) => ({
      p: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
      w: [0, 0, 0, 0],
    });
    const first = emptyCtx();
    neighbourhood(first, box(0, 0, 600, 400), seeds(6), 0, "k", "d", "neighbourhood");
    const moved = { ...emptyCtx(), plat: first.plat };
    neighbourhood(moved, box(350, 250, 500, 400), seeds(6), 0, "k", "d", "neighbourhood");
    expect(moved.overflow).toBe(0);
    expect(moved.events.map((e) => e.code)).toContain("plat/regrid");
    expect(moved.lots).toHaveLength(6);
    expect(moved.roads.length).toBeLessThanOrEqual(first.roads.length + 2);
  });

  it("keeps its grid when a fresh one would seat no more lots", () => {
    const first = emptyCtx();
    neighbourhood(first, rect(600, 400), seeds(6), 0, "k", "d", "neighbourhood");
    const squeezed = { ...emptyCtx(), plat: first.plat };
    // The same land with far more lots than any grid on it can seat.
    neighbourhood(squeezed, rect(600, 400), seeds(200), 0, "k", "d", "neighbourhood");
    expect(squeezed.events.map((e) => e.code)).not.toContain("plat/regrid");
    expect(squeezed.overflow).toBeGreaterThan(0);
  });

  it("has no slots on land smaller than a block", () => {
    const ctx = emptyCtx();
    neighbourhood(ctx, rect(40, 40), seeds(3), 0, "k", "d", "neighbourhood");
    expect(ctx.overflow).toBe(3);
  });
});
