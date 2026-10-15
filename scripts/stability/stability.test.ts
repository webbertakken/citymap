import type { City, Lot, Town } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { compareCities, summarise } from "./stability.ts";

const square = (x: number, y: number, s = 64) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const lot = (key: string, x: number, address = key, vacant = false): Lot => ({
  pts: square(x, 0),
  key,
  address,
  vacant,
  path: vacant ? "" : `${key}.ts`,
  use: "source",
  district: 0,
});
const town = (key: string, lots: Lot[]): Town => ({
  key,
  name: key,
  form: "polycentric",
  old: false,
  outline: [],
  water: [],
  roads: [],
  blocks: [],
  lots,
  districts: [],
  stats: { lots: lots.length, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});
const city = (...towns: Town[]): City => ({ repository: "r", commit: "c", towns, highways: [] });

describe("compareCities", () => {
  it("counts a lot as moved when its slot changes or its centre shifts beyond 16 units, never for a nudge", () => {
    const before = city(town("t", [lot("a", 0), lot("b", 100), lot("c", 200), lot("d", 300), lot("gone", 400)]));
    const after = city(
      town("t", [lot("a", 0), lot("b", 110), lot("c", 240), lot("d", 300, "elsewhere"), lot("new", 500)]),
    );
    expect(compareCities(before, after)).toEqual({ compared: 4, moved: 2 });
  });

  it("compares lots by town, and leaves vacant ones out", () => {
    const before = city(town("t", [lot("a", 0), lot("v", 64, "v", true)]), town("u", [lot("a", 0)]));
    const after = city(town("t", [lot("a", 0), lot("v", 900, "v", true)]), town("u", [lot("a", 900)]));
    expect(compareCities(before, after)).toEqual({ compared: 2, moved: 1 });
  });
});

describe("summarise", () => {
  it("averages the share moved per commit, and on the commits that delete files, in per mille", () => {
    const steps = [
      { compared: 10, moved: 0, deleting: false },
      { compared: 10, moved: 2, deleting: true },
      { compared: 0, moved: 0, deleting: true },
      { compared: 20, moved: 1, deleting: false },
    ];
    expect(summarise(steps)).toEqual({ commits: 3, deleting: 1, perCommitMille: 83, deletingMille: 200 });
  });

  it("says nothing moved when nothing was compared", () => {
    expect(summarise([])).toEqual({ commits: 0, deleting: 0, perCommitMille: 0, deletingMille: 0 });
  });
});
