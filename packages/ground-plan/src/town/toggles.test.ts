import { describe, expect, it } from "vitest";
import { isFlat, type Form } from "../archetype/forms";
import type { Toggle } from "../archetype/toggles";
import type { Town } from "../city/city";
import { DEFAULT_LAND_USES } from "../land-use/land-use";
import { canonicalJson } from "../plat/canonical";
import { emptyTownPlat, type TownPlat } from "../plat/plat";
import { outlineFor } from "../region/outline";
import type { FileEntry } from "../snapshot/snapshot";
import { files, snapshotOf } from "../testing/fixtures";
import { buildTree, type TreeNode } from "../tree/tree";
import type { LayoutOptions } from "./context";
import { layoutTown } from "./layout";
import { QUARTER_LAND } from "./quarters";

const OPTIONS: LayoutOptions = { order: "centre-out", jog: "top-level", warp: false, densityPct: 50 };

const tree = (entries: readonly FileEntry[], members: readonly string[] = [], densityPct = 50): TreeNode =>
  buildTree(snapshotOf(entries), { root: "", exclude: [], landUses: DEFAULT_LAND_USES, densityPct, members }, {}).tree;

function lay(
  root: TreeNode,
  toggles: readonly Toggle[],
  plat: TownPlat = emptyTownPlat(),
  landOf = root,
  densityPct = 50,
  more: { rootForm?: Form; order?: LayoutOptions["order"] } = {},
) {
  const outline = outlineFor(landOf.demand * 2, { x: 0, y: 0 }, "demo");
  const options = { ...OPTIONS, densityPct, toggles, ...(more.order ? { order: more.order } : {}) };
  return layoutTown("demo", "demo", root, outline, plat, options, more.rootForm);
}

const codes = (events: readonly { code: string }[]) => events.map((e) => e.code);
const positions = (town: Town) => new Map(town.lots.map((l) => [l.key, canonicalJson(l.pts)]));

// One folder holds nearly everything; three small ones and a few own files stand beside it.
const corridorRepo = (extra: FileEntry[] = []): FileEntry[] => [
  ...files("main/x", 140, 0),
  ...files("main/y", 140, 200),
  ...files("main/z", 140, 400),
  ...files("a", 8, 600),
  ...files("b", 8, 700),
  ...files("", 2, 800),
  ...extra,
];

describe("corridor", () => {
  it("gathers the small folders into one faubourg behind a gateway, the heavy folder taking the rest", () => {
    const { town, plat, events } = lay(tree(corridorRepo()), ["corridor"]);
    expect(town.form).toBe("corridor");
    expect(plat.cuts[""]).toMatchObject({ right: ["main"] });
    expect(plat.cuts[""]!.left.toSorted()).toEqual(["#lots", "a", "b"]);
    expect(codes(events)).toContain("plat/gateway");
    // The faubourg is cut between its own items, under the gateway's key.
    expect(plat.cuts[">L"]).toBeDefined();
    expect(plat.forms.main).toBe("polycentric");
  });

  it("is laid as cuts with its toggle off", () => {
    const { town, events } = lay(tree(corridorRepo()), []);
    expect(town.form).toBe("radial");
    expect(codes(events)).not.toContain("plat/gateway");
  });

  it("takes a newcomer into the faubourg without moving the gateway or the destination's lots", () => {
    const first = lay(tree(corridorRepo()), ["corridor"]);
    const next = lay(tree(corridorRepo(files("c", 4, 900))), ["corridor"], first.plat, tree(corridorRepo()));
    expect(next.plat.cuts[""]!.left).toContain("c");
    expect(next.plat.cuts[""]!.c).toBe(first.plat.cuts[""]!.c);
    const before = positions(first.town);
    const inMain = next.town.lots.filter((l) => l.path.startsWith("main/"));
    expect(inMain.length).toBe(420);
    for (const lot of inMain) expect(canonicalJson(lot.pts)).toBe(before.get(lot.key));
  });

  it("lays its faubourg in age order when the order is first-seen", () => {
    const { town } = lay(tree(corridorRepo()), ["corridor"], emptyTownPlat(), undefined, 50, { order: "first-seen" });
    expect(town.form).toBe("corridor");
  });

  it("declines to cuts when there is no chain or nothing beside the destination", () => {
    // The region may hand down a corridor form its tree no longer bears (an old town holds the rest).
    const flat = lay(tree(files("", 300)), ["corridor"], emptyTownPlat(), undefined, 50, { rootForm: "corridor" });
    expect(flat.plat.cuts[""]?.right).not.toEqual(["main"]);
    const lone = lay(tree([...files("main/x", 140, 0), ...files("main/y", 140, 200)]), ["corridor"]);
    expect(codes(lone.events)).not.toContain("plat/gateway");
  });

  it("walks a chain of corridors to the first folder that is none", () => {
    const chained = [
      ...files("main/core/x", 140, 0),
      ...files("main/core/y", 140, 200),
      ...files("main/core/z", 140, 400),
      ...files("main/util", 6, 600),
      ...files("a", 8, 700),
      ...files("", 2, 800),
    ];
    const { plat, town } = lay(tree(chained), ["corridor"]);
    expect(plat.forms.main).toBe("corridor");
    expect(plat.cuts[""]).toMatchObject({ right: ["main/core"] });
    expect(plat.cuts[""]!.left).toContain("main/util");
    expect(town.districts.find((d) => d.path === "main")).toMatchObject({ form: "corridor", ward: false });
  });

  it("switches a folder that grows into a corridor of the chain", () => {
    const even = [
      ...files("main/x", 140, 0),
      ...files("main/y", 140, 200),
      ...files("main/z", 140, 400),
      ...files("a", 8, 700),
    ];
    const first = lay(tree(even), ["corridor"]);
    expect(first.plat.forms.main).toBe("polycentric");
    const dominated = [...files("main/x", 2000, 0), ...files("main/y", 10, 200), ...files("a", 8, 700)];
    const next = lay(tree(dominated), ["corridor"], first.plat);
    expect(next.plat.forms.main).toBe("corridor");
    expect(next.events).toContainEqual(
      expect.objectContaining({
        code: "plat/switch",
        detail: expect.objectContaining({ path: "main", to: "corridor" }),
      }),
    );
  });

  it("lays the corridor afresh when its destination changes", () => {
    const first = lay(tree(corridorRepo()), ["corridor"]);
    const regrown = [
      ...files("main/x", 140, 0),
      ...files("main/y", 140, 200),
      ...files("main/z", 140, 400),
      ...files("a", 9000, 600),
    ];
    const next = lay(tree(regrown), ["corridor"], first.plat);
    expect(codes(next.events)).toContain("plat/corridor-destination");
    expect(next.plat.cuts[""]).toMatchObject({ right: ["a"] });
  });
});

const pkg = (name: string, n: number, born: number): FileEntry[] => [
  { path: `${name}/package.json`, identity: `${name}/package.json@${born}`, firstSeen: born },
  ...files(`${name}/src`, n, born + 1),
];

const members = (count: number) => Array.from({ length: count }, (_, i) => `p${i}`);

const islands = (count: number, n = 60) => Array.from({ length: count }, (_, i) => pkg(`p${i}`, n, i * 100)).flat();

describe("archipelago", () => {
  it("makes each package an island, with canals and bridges between them", () => {
    const { town, plat } = lay(tree([...islands(4), ...files("", 3, 5000), ...files("tools", 5, 6000)], members(4)), [
      "archipelago",
    ]);
    expect(town.form).toBe("archipelago");
    // Four islands and the mainland (the own files and tools as one): four cuts, every one a canal.
    const canalCuts = Object.values(plat.cuts).filter((c) => c.canal);
    expect(canalCuts).toHaveLength(4);
    expect(town.canals).toHaveLength(4);
    expect(plat.cuts["#mainland"]?.canal).toBeUndefined();
    expect(town.roads.filter((r) => r.cls === "street").length).toBeGreaterThanOrEqual(4);
  });

  it("lays packages as cuts with its toggle off, and draws no canals", () => {
    const { town } = lay(tree(islands(4), members(4)), []);
    expect(town.form).not.toBe("archipelago");
    expect(town.canals).toBeUndefined();
  });

  it("shares islands beyond a dozen packages and remembers them", () => {
    const first = lay(tree(islands(14, 30), members(14)), ["archipelago"]);
    const grouped = first.plat.islands?.[""];
    expect(grouped?.flat()).toHaveLength(14);
    expect(grouped!.length).toBeLessThan(14);
    expect(codes(first.events)).toContain("plat/islands");
    // A fifteenth package joins the last island while it holds under a twelfth, else founds the next.
    const next = lay(
      tree(islands(15, 30), members(15)),
      ["archipelago"],
      first.plat,
      tree(islands(14, 30), members(14)),
    );
    expect(next.plat.islands?.[""]?.flat()).toContain("p14");
    expect(next.plat.islands![""]!.slice(0, grouped!.length - 1)).toEqual(grouped!.slice(0, -1));
    expect(codes(next.events)).toContain("plat/island-founded");
    // A sixteenth joins the fifteenth's island, which has not closed.
    const after = lay(
      tree(islands(16, 30), members(16)),
      ["archipelago"],
      next.plat,
      tree(islands(14, 30), members(14)),
    );
    expect(after.plat.islands![""]!.at(-1)).toEqual(["p14", "p15"]);
  });

  it("keeps a remainder of packages as the last island", () => {
    // Thirteen equal packages of one age, so in key order: islands of two close at a twelfth, the last stands alone.
    const { plat } = lay(tree(islands(13, 30), members(13)), ["archipelago"]);
    expect(plat.islands![""]!.at(-1)).toEqual(["p9"]);
  });

  it("lays islands in age order when the order is first-seen, and declines without packages", () => {
    const aged = lay(tree(islands(4), members(4)), ["archipelago"], emptyTownPlat(), undefined, 50, {
      order: "first-seen",
    });
    expect(aged.town.canals).toHaveLength(3);
    const none = lay(tree(islands(4)), ["archipelago"], emptyTownPlat(), undefined, 50, { rootForm: "archipelago" });
    expect(none.town.canals).toBeUndefined();
  });

  it("lends an island's land to its neighbour when its package goes", () => {
    const four = tree([...islands(4), ...files("", 3, 5000)], members(4));
    const first = lay(four, ["archipelago"]);
    const three = [...islands(4).filter((f) => !f.path.startsWith("p3/")), ...files("", 3, 5000)];
    const next = lay(tree(three, members(3)), ["archipelago"], first.plat, four);
    expect(next.town.form).toBe("archipelago");
    expect(next.town.canals).toHaveLength(3);
  });

  it("forgets its islands when the folder stops being an archipelago", () => {
    const first = lay(tree(islands(14, 30), members(14)), ["archipelago"]);
    const plain = lay(tree(islands(14, 30)), ["archipelago"], first.plat);
    expect(plain.town.form).not.toBe("archipelago");
    expect(plain.plat.islands).toBeUndefined();
  });
});

const fan = (count: number, n = 24) =>
  Array.from({ length: count }, (_, i) => files(`f${String(i).padStart(2, "0")}`, n, i * 50)).flat();

const counts = (n: number) => lay(tree(fan(n)), ["quarters"]).plat.quarters![""]!.map((q) => q.length);

describe("quarters", () => {
  it("groups similar small folders into planned quarters, each a ward cut by streets", () => {
    const { town, plat, events } = lay(tree(fan(40)), ["quarters"]);
    expect(town.form).toBe("quarters");
    const quarters = plat.quarters?.[""];
    expect(quarters?.flat()).toHaveLength(40);
    expect(quarters!.length).toBeGreaterThan(1);
    expect(codes(events)).toContain("plat/quarters");
    const wards = town.districts.filter((d) => d.form === "quarters");
    expect(wards.length).toBe(quarters!.length);
    expect(wards.every((d) => d.ward)).toBe(true);
    // Inside a quarter every cut is a street.
    const inside = Object.entries(plat.cuts).filter(([key]) => key.startsWith("#q"));
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every(([, cut]) => cut.cls === "street" && cut.row === "street")).toBe(true);
  });

  it("keeps its quarters as a newcomer joins the last one", () => {
    const first = lay(tree(fan(40)), ["quarters"]);
    const next = lay(tree([...fan(40), ...files("f40", 12, 9000)]), ["quarters"], first.plat, tree(fan(40)));
    const before = first.plat.quarters![""]!;
    const after = next.plat.quarters![""]!;
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(after.flat()).toContain("f40");
  });

  it("opens a new quarter when the last is full, and lends a gone member's land", () => {
    const first = lay(tree(fan(40)), ["quarters"]);
    const before = first.plat.quarters![""]!;
    const more = Array.from({ length: 30 }, (_, i) =>
      files(`g${String(i).padStart(2, "0")}`, 24, 9000 + i * 50),
    ).flat();
    const grown = lay(tree([...fan(40), ...more]), ["quarters"], first.plat, tree(fan(40)));
    expect(grown.plat.quarters![""]!.length).toBeGreaterThan(before.length);
    expect(codes(grown.events)).toContain("plat/quarter-opened");
    // The first quarter's first member goes: its side of the quarter's first street lends its land.
    const gone = before[0]![0]!;
    const fewer = fan(40).filter((f) => !f.path.startsWith(`${gone}/`));
    const shrunk = lay(tree(fewer), ["quarters"], first.plat, tree(fan(40)));
    expect(shrunk.plat.quarters![""]![0]).not.toContain(gone);
    expect(shrunk.town.lots.filter((l) => !l.vacant)).toHaveLength(fewer.length);
  });

  it("keeps an emptied quarter's place, and a quarter of own files only", () => {
    const owned = [...files("", 24, 0), ...fan(40)];
    const first = lay(tree(owned), ["quarters"]);
    const [q0, q1] = first.plat.quarters![""]!;
    expect(q0![0]).toBe("#lots");
    // Every folder of the first quarter goes: it keeps only the own files, laid without a ward.
    const kept = owned.filter((f) => !q0!.some((k) => k !== "#lots" && f.path.startsWith(`${k}/`)));
    const thinned = lay(tree(kept), ["quarters"], first.plat, tree(owned));
    expect(thinned.plat.quarters![""]![0]).toEqual(["#lots"]);
    expect(thinned.town.districts.some((d) => d.path === "#q0")).toBe(false);
    // Every member of the second goes: it keeps its index and lays nothing.
    const rest = owned.filter((f) => !q1!.some((k) => f.path.startsWith(`${k}/`)));
    const emptied = lay(tree(rest), ["quarters"], first.plat, tree(owned));
    expect(emptied.plat.quarters![""]![1]).toEqual([]);
    expect(emptied.town.districts.some((d) => d.path === "#q1")).toBe(false);
  });

  it("lays its quarters in age order when the order is first-seen, and declines with one small item", () => {
    const aged = lay(tree(fan(40)), ["quarters"], emptyTownPlat(), undefined, 50, { order: "first-seen" });
    expect(aged.town.form).toBe("quarters");
    const one = [...files("big/x", 150, 0), ...files("big/y", 150, 200), ...files("s", 24, 400)];
    const declined = lay(tree(one), ["quarters"], emptyTownPlat(), undefined, 50, { rootForm: "quarters" });
    expect(declined.plat.quarters).toBeUndefined();
  });

  it("forgets its quarters when the folder stops taking them", () => {
    const first = lay(tree(fan(40)), ["quarters"]);
    const one = lay(tree([...fan(40), ...files("huge", 3000, 9000)]), ["quarters"], first.plat);
    expect(one.town.form).not.toBe("quarters");
    expect(one.plat.quarters).toBeUndefined();
  });

  it("is laid as cuts with its toggle off", () => {
    const { town, plat } = lay(tree(fan(40)), []);
    expect(town.form).toBe("polycentric");
    expect(plat.quarters).toBeUndefined();
  });

  it("leaves a folder that does not flatten outside every quarter", () => {
    const big = [...files("big/x", 150, 3000), ...files("big/y", 150, 3200)];
    const { plat } = lay(tree([...fan(40), ...big]), ["quarters"]);
    expect(isFlat(plat.forms.big)).toBe(false);
    expect(plat.quarters?.[""]?.flat()).toHaveLength(40);
    expect(plat.quarters?.[""]?.flat()).not.toContain("big");
  });

  it("joins a small last quarter to the one before, and keeps one quarter for a few folders", () => {
    // 23 folders fill a quarter; two more join it, 23 more fill a second, ten alone make one.
    expect(counts(25)).toEqual([25]);
    expect(counts(46)).toEqual([23, 23]);
    expect(counts(10)).toEqual([10]);
  });

  it("closes a quarter at 24 blocks of land", () => {
    const { plat } = lay(tree(fan(40)), ["quarters"]);
    const demand = tree(fan(1)).demand;
    const [firstQuarter] = plat.quarters![""]!;
    expect(firstQuarter!.length).toBe(Math.ceil(QUARTER_LAND / demand));
  });
});

describe("tiers", () => {
  // A village-tier town (240 files of mass) with a nested folder whose own first cut would be a collector by mass.
  const village = [...files("a/x", 60, 0), ...files("a/y", 60, 100), ...files("b", 60, 200), ...files("c", 60, 300)];

  it("gives the town one road of its top class, every other road at least one class narrower", () => {
    const root = tree(village, [], 20);
    const tiered = lay(root, ["tiers"], emptyTownPlat(), root, 20);
    const plain = lay(root, [], emptyTownPlat(), root, 20);
    expect(tiered.plat.tier).toBe("village");
    expect(plain.plat.tier).toBeUndefined();
    expect(plain.town.roads.filter((r) => r.cls === "collector").length).toBeGreaterThan(1);
    expect(tiered.town.roads.filter((r) => r.cls === "collector")).toHaveLength(1);
    expect(tiered.plat.cuts.a).toMatchObject({ cls: "street", row: "street" });
  });

  it("narrows a village's high street to a street", () => {
    const root = tree(files("", 60));
    const { town, plat } = lay(root, ["tiers"], emptyTownPlat(), root);
    expect(town.form).toBe("street-village");
    expect(plat.grids[""]?.high).toBeDefined();
    expect(town.roads.some((r) => r.cls === "collector")).toBe(false);
  });

  it("reports a change of tier", () => {
    const small = tree(files("", 20));
    const first = lay(small, ["tiers"]);
    const grown = lay(tree(files("", 60)), ["tiers"], first.plat, small);
    expect(first.plat.tier).toBe("hamlet");
    expect(grown.events).toContainEqual({ code: "plat/tier", detail: { key: "demo", from: "hamlet", to: "village" } });
  });
});
