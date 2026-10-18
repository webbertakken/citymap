import {
  DEFAULT_LAND_USES,
  classifyLandUse,
  emptyPlat,
  emptyTownPlat,
  initialState,
  layCity,
  stateSnapshot,
  type City,
  type Lot,
  type Options,
  type Town,
} from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { buildMeasures, lotFiles } from "./lots";

const options: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  loops: true,
};

const paths = [
  "src/a.ts",
  "src/b.ts",
  "src/c.json",
  "src/d.json",
  "src/e.json",
  "src/a.test.ts",
  "docs/guide.md",
  "lib/x/y.ts",
  "lib/x/z.yaml",
  "vendor/v1.js",
  "vendor/v2.js",
];

const lot = (key: string, path: string, vacant = false): Lot => ({
  pts: [],
  key,
  address: "",
  vacant,
  path,
  use: "source",
  district: 0,
});
const townOf = (key: string, old: boolean, lots: Lot[]): Town => ({
  key,
  name: key,
  form: "polycentric",
  old,
  outline: [],
  water: [],
  roads: [],
  blocks: [],
  lots,
  districts: [],
  stats: { lots: lots.length, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});
describe("lotFiles", () => {
  it("stands every file that takes land on exactly one lot, several to a lot where they share", () => {
    const snapshot = stateSnapshot("demo", "worktree", paths);
    const { city, state } = layCity(snapshot, initialState(options), options);
    const lots = lotFiles(city, state.plat, snapshot.files);
    const all = [...lots.values()].flatMap((byKey) => Array.from(byKey.values()));
    const placed = all.flat();
    const landed = paths.filter((p) => DEFAULT_LAND_USES.includes(classifyLandUse(p)) && classifyLandUse(p) !== "docs");
    expect(placed.toSorted()).toEqual(landed.toSorted());
    const shared = all.filter((files) => files.length > 1);
    expect(shared).toContainEqual(["src/c.json", "src/d.json"]);
  });

  it("reads an old town's members, skips vacant lots, and falls back to a lot's own path", () => {
    const city: City = {
      repository: "demo",
      commit: "worktree",
      towns: [
        townOf("demo", false, [lot("a@0", "a"), lot("gone@0", "", true), lot("b@0", "b")]),
        townOf("demo old town", true, [lot("a@0", "old/a"), lot("c@0", "c")]),
      ],
      highways: [],
    };
    const plat = emptyPlat("x");
    plat.towns["demo"] = { ...emptyTownPlat(), shares: { "|source": [{ key: "a@0", members: ["a@0", "dead@1"] }] } };
    plat.old["demo"] = [
      { town: townOf("demo old town 2", true, []), members: {} },
      { town: city.towns[1]!, members: { "a@0": ["old/a@0"] } },
    ];
    const files = [
      { path: "a", identity: "a@0", firstSeen: 0 },
      { path: "old/a", identity: "old/a@0", firstSeen: 0 },
    ];
    const lots = lotFiles(city, plat, files);
    expect([...lots].map(([key, byKey]) => [key, [...byKey]])).toEqual([
      [
        "demo",
        [
          ["a@0", ["a"]],
          ["b@0", ["b"]],
        ],
      ],
      [
        "demo old town",
        [
          ["a@0", ["old/a"]],
          ["c@0", ["c"]],
        ],
      ],
    ]);
    // A town the plat has never recorded falls back to its lots' own paths.
    expect([
      ...lotFiles({ ...city, towns: [townOf("new", false, [lot("n@0", "n")])] }, plat, files).get("new")!,
    ]).toEqual([["n@0", ["n"]]]);
  });
});

describe("buildMeasures", () => {
  const lots = new Map([["demo", new Map([["a@0", ["a.ts", "b.ts"]]])]]);

  it("assembles each lot's files with their facts, and the people across them with history", () => {
    const measures = buildMeasures({
      source: "cli",
      size: "lines",
      history: true,
      comments: true,
      tested: "coverage",
      lots,
      factsOf: (path) => (path === "a.ts" ? { lines: 3 } : {}),
      authorsAcross: (files) => files.length,
    });
    expect(measures).toEqual({
      version: 1,
      source: "cli",
      size: "lines",
      tested: "coverage",
      available: ["size", "tested", "kind", "recency", "churn", "authors", "comments"],
      lots: { demo: { "a@0": { files: [{ path: "a.ts", lines: 3 }, { path: "b.ts" }], authors: 2 } } },
    });
  });

  it("leaves the people out without history", () => {
    const measures = buildMeasures({
      source: "github",
      size: "bytes",
      history: false,
      comments: false,
      tested: "name",
      lots,
      factsOf: () => ({ bytes: 1 }),
    });
    expect(measures.lots["demo"]!["a@0"]).toEqual({
      files: [
        { path: "a.ts", bytes: 1 },
        { path: "b.ts", bytes: 1 },
      ],
    });
    expect(measures.available).toEqual(["size", "tested", "kind"]);
  });
});
