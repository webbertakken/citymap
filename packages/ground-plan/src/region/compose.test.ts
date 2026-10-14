import { describe, expect, it } from "vitest";
import { centroid } from "../fixed/polygon";
import { foldHistory, initialState } from "../fold/fold";
import { DEFAULT_LAND_USES, landKey } from "../land-use/land-use";
import { canonicalJson } from "../plat/canonical";
import { emptyPlat } from "../plat/plat";
import { MAX_FILES, type FileEntry, type Snapshot } from "../snapshot/snapshot";
import { files, snapshotOf } from "../testing/fixtures";
import { COORD_LIMIT, checkExtent, layCity, settingKey, translateTown, type Options } from "./compose";

const OPTIONS: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: false,
};
const at = (index: number, entries: FileEntry[], folders: Record<string, number> = {}): Snapshot => ({
  ...snapshotOf(entries, folders),
  index,
});
const manifest = (folder: string, born = 0): FileEntry => ({
  path: `${folder}/package.json`,
  identity: `${folder}/package.json@${born}`,
  firstSeen: born,
});
const monorepo = (extra: FileEntry[] = []): FileEntry[] => [
  ...files("src", 120),
  manifest("packages/a"),
  ...files("packages/a", 80, 200),
  manifest("packages/b"),
  ...files("packages/b", 60, 400),
  manifest("apps/web", 600),
  ...files("apps/web", 50, 600),
  manifest("apps/api", 700),
  ...files("apps/api", 40, 700),
  ...extra,
];

describe("layCity", () => {
  it("lays the main town at the origin and the other towns round it, joined by highways", () => {
    const { city, events } = layCity(at(0, monorepo()), initialState(OPTIONS), OPTIONS);
    expect(city.towns.map((t) => t.key)).toEqual(["demo", "demo/apps/api", "demo/apps/web", "demo/packages"]);
    expect(city.highways).toHaveLength(3);
    expect(events.filter((e) => e.code === "plat/grow")).toEqual([]);
    const [main, ...groups] = city.towns;
    expect(centroid(main?.outline ?? []).x ** 2).toBeLessThan(1000 ** 2);
    for (const g of groups) expect(centroid(g.outline)).not.toEqual(centroid(main?.outline ?? []));
  });

  it("counts land per town: files without land and docs", () => {
    const docs = { path: "src/README.md", identity: "r", firstSeen: 0 };
    const tests = { path: "src/a.test.ts", identity: "t", firstSeen: 0 };
    const { city } = layCity(at(0, [...files("src", 30), docs, tests]), initialState(OPTIONS), OPTIONS);
    expect(city.towns[0]?.stats.offLand).toBe(1);
    expect(city.towns[0]?.stats.docs).toBe(1);
  });

  it("is pure and deterministic, warp included", () => {
    const options = { ...OPTIONS, warp: true };
    const state = initialState(options);
    const a = layCity(at(0, monorepo()), state, options);
    const b = layCity(at(0, monorepo()), state, options);
    expect(canonicalJson(a.city)).toBe(canonicalJson(b.city));
    expect(state.plat).toEqual(emptyPlat(state.plat.setting));
    expect(a.city.highways[0]?.pts.length).toBeGreaterThan(2);
  });

  it("grows a town outward about its centre without moving its lots", () => {
    // One neighbourhood and no cuts: only the outline can change.
    const first = layCity(at(0, files("", 26)), initialState(OPTIONS), OPTIONS);
    const grown = layCity(at(1, files("", 39)), first.state, OPTIONS);
    expect([first.city.towns[0]?.form, grown.city.towns[0]?.form]).toEqual(["neighbourhood", "neighbourhood"]);
    expect(grown.events.map((e) => e.code)).toEqual(["plat/grow"]);
    // Every lot keeps its slot; strips the old outline clipped may now extend into the new land.
    const slots = (s: typeof first.state) => s.plat.towns.demo?.grids[""]?.slots ?? {};
    for (const [lot, slot] of Object.entries(slots(first.state))) expect(slots(grown.state)[lot]).toBe(slot);
  });

  it("freezes the town as an old town when its root switches form, lit while its files live", () => {
    // Six comparable folders (polycentric), then one folder outweighs the rest (radial).
    const six = ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(d, 100, i * 200));
    const first = layCity(at(0, six), initialState(OPTIONS), OPTIONS);
    expect(first.city.towns[0]?.form).toBe("polycentric");
    const heavy = [...six.filter((f) => !f.path.startsWith("f/")), ...files("core", 2000, 5000)];
    const second = layCity(at(1, heavy), first.state, OPTIONS);
    expect(second.events.map((e) => e.code)).toContain("plat/old-town");
    const old = second.city.towns.find((t) => t.old);
    expect(old?.name).toBe("demo old town");
    expect(old?.lots.some((l) => l.vacant)).toBe(true);
    expect(old?.lots.some((l) => !l.vacant)).toBe(true);
    expect(second.city.highways.length).toBeGreaterThanOrEqual(1);
    // The new town holds only files the old town does not: the newcomers.
    expect(second.city.towns.find((t) => !t.old)?.stats.lots).toBe(2000);
    // A second switch makes a second old town, beside the first.
    const third = layCity(
      at(2, [...heavy, ...["p", "q", "r", "s", "t", "u", "v", "w"].flatMap((d, i) => files(d, 700, 9000 + i * 1000))]),
      second.state,
      OPTIONS,
    );
    expect(third.city.towns.filter((t) => t.old).map((t) => t.name)).toEqual(["demo old town", "demo old town 2"]);
    // Every town has a key of its own, an old town's made as its name is.
    expect(third.city.towns.map((t) => t.key)).toEqual(["demo", "demo old town", "demo old town 2"]);
  });

  it("moves between neighbourhood forms in place, without an old town", () => {
    const first = layCity(at(0, files("", 10)), initialState(OPTIONS), OPTIONS);
    const second = layCity(at(1, files("", 60)), first.state, OPTIONS);
    expect(first.city.towns[0]?.form).toBe("hamlet");
    expect(second.city.towns[0]?.form).not.toBe("hamlet");
    expect(second.city.towns.some((t) => t.old)).toBe(false);
  });

  it("gives a town without roads an approach street for its highway", () => {
    const { city } = layCity(
      at(0, [
        ...files("src", 3),
        manifest("packages/a"),
        ...files("packages/a", 2),
        manifest("packages/b"),
        ...files("packages/b", 2),
      ]),
      initialState(OPTIONS),
      OPTIONS,
    );
    expect(city.highways).toHaveLength(1);
    expect(city.towns.every((t) => t.roads.length > 0)).toBe(true);
  });

  it("skips a repository with no land at all", () => {
    const { city } = layCity(
      at(0, [{ path: "a.test.ts", identity: "a", firstSeen: 0 }]),
      initialState(OPTIONS),
      OPTIONS,
    );
    expect(city.towns).toEqual([]);
    expect(city.highways).toEqual([]);
  });

  it("keeps group towns where they stood, and lays nothing new when nothing grew", () => {
    const first = layCity(at(0, monorepo()), initialState(OPTIONS), OPTIONS);
    const again = layCity(at(1, monorepo()), first.state, OPTIONS);
    expect(again.events).toEqual([]);
    expect(canonicalJson(again.city.towns)).toBe(canonicalJson(first.city.towns));
  });

  it("freezes vacant lots too, and keeps old towns of every town, lit by their members", () => {
    const six = ["a", "b", "c", "d", "e", "f"].flatMap((d, i) => files(d, 100, i * 200));
    const first = layCity(at(0, six), initialState(OPTIONS), OPTIONS);
    const fewer = layCity(
      at(
        1,
        six.filter((f) => f.path !== "a/f0000.ts"),
      ),
      first.state,
      OPTIONS,
    );
    const heavy = [...six.filter((f) => !f.path.startsWith("f/")), ...files("core", 2000, 5000)];
    const switched = layCity(at(2, heavy), fewer.state, OPTIONS);
    const old = switched.state.plat.old.demo?.[0];
    expect(old?.town.lots.some((l) => l.vacant)).toBe(true);
    // A second old town under another key, whose town is gone, and a lot without members: it joins the main town.
    if (!old) throw new Error("no old town");
    const stray = { town: { ...old.town, key: "other", name: "other old town" }, members: {} };
    const state = {
      ...switched.state,
      plat: { ...switched.state.plat, old: { ...switched.state.plat.old, other: [stray] } },
    };
    const next = layCity(at(3, heavy), state, OPTIONS);
    expect(next.city.towns.filter((t) => t.old).map((t) => t.name)).toEqual(["demo old town", "other old town"]);
    expect(next.city.towns.find((t) => t.name === "other old town")?.lots.every((l) => l.vacant)).toBe(true);
    // With no live town left, old towns stand alone, without highways.
    const empty = layCity(at(4, [{ path: "x.test.ts", identity: "x", firstSeen: 0 }]), next.state, OPTIONS);
    expect(empty.city.highways).toEqual([]);
    expect(empty.city.towns.every((t) => t.old)).toBe(true);
  });

  it("rejects a plat laid for another land setting", () => {
    const other = initialState({ ...OPTIONS, landUses: [...DEFAULT_LAND_USES, "tests"] });
    expect(() => layCity(at(0, files("", 3)), other, OPTIONS)).toThrow("plat/setting-mismatch");
  });
});

describe("translateTown", () => {
  it("moves every point by the offset", () => {
    const { city } = layCity(at(0, files("src", 40)), initialState(OPTIONS), OPTIONS);
    const town = city.towns[0];
    if (!town) throw new Error("no town");
    const moved = translateTown(town, { x: 10, y: -5 });
    expect(moved.outline[0]).toEqual({ x: (town.outline[0]?.x ?? 0) + 10, y: (town.outline[0]?.y ?? 0) - 5 });
    expect(moved.lots[0]?.pts[0]?.x).toBe((town.lots[0]?.pts[0]?.x ?? 0) + 10);
  });
});

describe("foldHistory", () => {
  it("folds snapshots oldest first and reports each step's events", () => {
    const steps: number[] = [];
    const history = [at(0, files("src", 30)), at(1, files("src", 60)), at(2, files("src", 90))];
    const { city, state } = foldHistory(history, OPTIONS, initialState(OPTIONS), (s) => steps.push(s.index));
    expect(steps).toEqual([0, 1, 2]);
    expect(city?.towns[0]?.stats.lots).toBe(90);
    expect(Object.keys(state.last)).toEqual(["demo"]);
  });

  it("folds without a listener", () => {
    expect(foldHistory([at(0, files("src", 10))], OPTIONS).city?.towns).toHaveLength(1);
  });

  it("returns no city for no history, and starts from a given plat", () => {
    expect(foldHistory([], OPTIONS).city).toBeNull();
    const plat = emptyPlat("custom");
    expect(foldHistory([], OPTIONS, initialState(OPTIONS, plat)).state.plat).toBe(plat);
  });
});

describe("split groups", () => {
  it("lays each app as its own town by default, and keeps packages one town", () => {
    const { city } = layCity(at(0, monorepo()), initialState(OPTIONS), OPTIONS);
    // Without folder ages, parts follow path order.
    expect(city.towns.map((t) => t.key)).toEqual(["demo", "demo/apps/api", "demo/apps/web", "demo/packages"]);
    expect(city.towns.map((t) => t.name)).toEqual(["demo", "apps/api", "apps/web", "packages"]);
    expect(city.highways).toHaveLength(3);
  });

  it("splits packages too when asked, and lays nothing split when asked", () => {
    const both = { ...OPTIONS, split: ["apps", "packages"] };
    expect(layCity(at(0, monorepo()), initialState(both), both).city.towns.map((t) => t.key)).toEqual([
      "demo",
      "demo/apps/api",
      "demo/apps/web",
      "demo/packages/a",
      "demo/packages/b",
    ]);
    const none = { ...OPTIONS, split: [] };
    expect(layCity(at(0, monorepo()), initialState(none), none).city.towns.map((t) => t.key)).toEqual([
      "demo",
      "demo/apps",
      "demo/packages",
    ]);
  });

  it("keeps a split group's own files outside its members in the main town", () => {
    const { city } = layCity(at(0, monorepo([...files("apps/shared", 20, 900)])), initialState(OPTIONS), OPTIONS);
    expect(city.towns[0]?.lots.filter((l) => l.path.startsWith("apps/shared/"))).toHaveLength(20);
  });

  it("names each setting of land and split, and rejects a plat laid for another", () => {
    expect(settingKey(OPTIONS)).toBe(`${landKey(DEFAULT_LAND_USES)}|split:apps`);
    expect(settingKey({ ...OPTIONS, split: ["packages", "apps"] })).toBe(
      `${landKey(DEFAULT_LAND_USES)}|split:apps,packages`,
    );
    const other = initialState({ ...OPTIONS, split: [] });
    expect(() => layCity(at(0, files("", 3)), other, OPTIONS)).toThrow("plat/setting-mismatch");
  });

  it("takes members from the manifests when the snapshot carries them", () => {
    const declared = { ...at(0, monorepo()), workspaces: ["apps/web", "packages/a", "packages/b"] };
    expect(layCity(declared, initialState(OPTIONS), OPTIONS).city.towns.map((t) => t.key)).toEqual([
      "demo",
      "demo/packages",
    ]);
  });
});

/** A town outline of one point, at x. */
const town = (x: number) => ({ outline: [{ x, y: 0 }] });

describe("layCity bounds", () => {
  it("rejects a snapshot of more files than the engine lays", () => {
    // A sparse array: the length is all the bound reads.
    const huge: Snapshot = { ...at(0, []), files: Array<FileEntry>(MAX_FILES + 1) };
    expect(() => layCity(huge, initialState(OPTIONS), OPTIONS)).toThrow("snapshot/too-large");
  });

  it("rejects a city reaching past the coordinate limit, and keeps one within it", () => {
    expect(() => checkExtent([town(COORD_LIMIT - 1), town(-(COORD_LIMIT - 1))], [])).not.toThrow();
    expect(() => checkExtent([town(COORD_LIMIT)], [])).toThrow("city/too-large");
    expect(() => checkExtent([], [{ pts: [{ x: 0, y: -COORD_LIMIT }] }])).toThrow("city/too-large");
  });
});
