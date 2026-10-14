import type { Road, Town } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { TIER_TARGETS, judgeTown, measureTown, tierOf } from "./morphometrics.ts";

const road = (cls: Road["cls"], x0: number, y0: number, x1: number, y1: number): Road => ({
  cls,
  pts: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
});
const town = (roads: Road[], lots = 500): Town => ({
  key: "t",
  name: "t",
  form: "polycentric",
  old: false,
  outline: [],
  water: [],
  roads,
  blocks: [],
  lots: [],
  districts: [],
  stats: { lots, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});

describe("tierOf", () => {
  it("places a town by its lots on the decades of the spec's tiers", () => {
    expect([10, 30, 299, 300, 2999, 3000, 40_000].map((n) => tierOf(town([], n)))).toEqual([
      "hamlet",
      "village",
      "village",
      "town",
      "town",
      "city",
      "metropolis",
    ]);
  });
});

describe("measureTown", () => {
  it("measures length per group, the largest road's share, and ends that meet a lesser road", () => {
    const roads = [
      road("avenue", 0, 0, 1000, 0),
      road("collector", 500, 0, 500, 1000),
      // A street ending on the collector, and an avenue ending on a street: the second is a violation.
      road("street", 0, 500, 500, 500),
      road("street", 1000, 1000, 2000, 1000),
      road("avenue", 1500, 2000, 1500, 1000),
    ];
    const m = measureTown(town(roads));
    // 4,500 in all: 1,500 local, 1,000 collector, 2,000 arterial.
    expect(m.shares.local).toBeCloseTo(1500 / 4500, 9);
    expect(m.shares.collector).toBeCloseTo(1000 / 4500, 9);
    expect(m.shares.arterial).toBeCloseTo(2000 / 4500, 9);
    expect(m.largest).toBeCloseTo(1000 / 4500, 9);
    expect(m.ends).toBe(10);
    expect(m.violations).toBe(1);
  });

  it("measures a town without roads, or with roads of no length, as nothing, and reads a repeated point as a point", () => {
    const nothing = { shares: { local: 0, collector: 0, arterial: 0 }, largest: 0, ends: 0, violations: 0 };
    expect(measureTown(town([]))).toEqual(nothing);
    expect(measureTown(town([road("street", 5, 5, 5, 5)]))).toEqual(nothing);
    // A collector ending on a lane drawn as one repeated point is still a collector ending on a lane.
    const dot = road("lane", 1000, 0, 1000, 0);
    const towns = town([road("collector", 0, 0, 1000, 0), { ...dot, pts: [...dot.pts, { x: 1000, y: 0 }] }]);
    expect(measureTown(towns).violations).toBe(1);
  });
});

/** n roads of one class, each 1,000 long, side by side and apart. */
const many = (cls: Road["cls"], n: number, y: number) =>
  Array.from({ length: n }, (_, i) => road(cls, i * 2000, y, i * 2000 + 1000, y));

describe("judgeTown", () => {
  it("judges a fine-grained town against its tier's band, then against the band widened by ten points", () => {
    // A town: local 65 to 80 %, collector 20 to 35 %, arterial up to 10 %.
    const fine = town([...many("street", 72, 0), ...many("collector", 25, 5000), ...many("avenue", 3, 9000)], 1000);
    expect(judgeTown(fine)).toMatchObject({ tier: "town", verdict: "within" });
    const near = town([...many("street", 85, 0), ...many("collector", 15, 5000)], 1000);
    expect(judgeTown(near)).toMatchObject({ tier: "town", verdict: "envelope" });
    const flat = town(many("street", 100, 0), 1000);
    expect(judgeTown(flat)).toMatchObject({ tier: "town", verdict: "outside" });
  });

  it("reports a town too coarse to judge without a verdict on its shares, and holds the real-city bands", () => {
    expect(judgeTown(town(many("street", 5, 0), 1000)).verdict).toBe("coarse");
    expect(judgeTown(town(many("street", 100, 0), 10))).toMatchObject({ tier: "hamlet", verdict: "within" });
    expect(TIER_TARGETS.village).toEqual({ local: [0.55, 0.8], collector: [0.2, 0.45], arterial: [0, 0] });
  });
});
