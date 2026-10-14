import { describe, expect, it } from "vitest";
import { ROAD_WIDTH } from "../constants";
import { emptyCtx, rect } from "../testing/fixtures";
import type { Item } from "./context";
import { carriageway, decide, rightOfWay, split } from "./cut";

const item = (key: string, demand: number): Item => ({
  kind: "lots",
  key,
  demand,
  massMille: 1000,
  firstSeen: 0,
  lots: [],
  district: "d",
});

describe("decide", () => {
  it("moves a remembered cut when its land shifted so far that one side starves while the other has room", () => {
    const ctx = emptyCtx();
    const items = [item("a", 1000), item("b", 1000)];
    const first = decide(ctx, items, rect(1000, 1000), 2000, true, "k")!;
    const c = first.rec.c;
    // The land grows fourfold on both axes: the absolute line now leaves one side an eighth of it.
    const moved = decide(ctx, items, rect(4000, 4000), 2000, true, "k")!;
    expect(ctx.events.map((e) => e.code)).toEqual(["plat/recut"]);
    expect(ctx.events[0]!.detail.reason).toBe("starved");
    expect(moved.rec.c).not.toBe(c);
    // Once the land is shared as the demand is, the cut stays put.
    decide(ctx, items, rect(4000, 4000), 2000, true, "k");
    expect(ctx.events).toHaveLength(1);
  });

  it("keeps a remembered cut while each side's land is within its band of its share", () => {
    const ctx = emptyCtx();
    const items = [item("a", 1000), item("b", 1000)];
    const first = decide(ctx, items, rect(1000, 1000), 2000, true, "k")!;
    const c = first.rec.c;
    const kept = decide(ctx, items, rect(1100, 1100), 2000, true, "k")!;
    expect(ctx.events).toEqual([]);
    expect(kept.rec.c).toBe(c);
  });
});

describe("decide road classes", () => {
  const pair = [item("a", 1000), item("b", 1000)];

  it("raises a remembered cut's class once the land's mass passes a tier by the band, and lowers it below", () => {
    const ctx = emptyCtx();
    expect(decide(ctx, pair, rect(1000, 1000), 20_000, true, "k")!.rec.cls).toBe("street");
    // 30,000 ‰ makes a collector tier; the band holds the street until 37,500.
    expect(decide(ctx, pair, rect(1000, 1000), 37_499, true, "k")!.rec.cls).toBe("street");
    expect(decide(ctx, pair, rect(1000, 1000), 37_500, true, "k")!.rec.cls).toBe("collector");
    // Down only below 30,000 / 1.25 = 24,000.
    expect(decide(ctx, pair, rect(1000, 1000), 24_000, true, "k")!.rec.cls).toBe("collector");
    expect(decide(ctx, pair, rect(1000, 1000), 23_999, true, "k")!.rec.cls).toBe("street");
    expect(ctx.events.map((e) => [e.code, e.detail.from, e.detail.to])).toEqual([
      ["plat/reclass", "street", "collector"],
      ["plat/reclass", "collector", "street"],
    ]);
  });

  it("climbs several tiers at once, keeps a later cut one class lower, and leaves a river alone", () => {
    const ctx = emptyCtx();
    decide(ctx, pair, rect(1000, 1000), 1000, true, "first");
    expect(decide(ctx, pair, rect(1000, 1000), 4_000_000, true, "first")!.rec.cls).toBe("boulevard");
    decide(ctx, pair, rect(1000, 1000), 1000, false, "later");
    expect(decide(ctx, pair, rect(1000, 1000), 4_000_000, false, "later")!.rec.cls).toBe("avenue");
    const banks: [Item[], Item[]] = [[pair[0]!], [pair[1]!]];
    decide(ctx, pair, rect(1000, 1000), 1000, true, "river", undefined, banks);
    expect(decide(ctx, pair, rect(1000, 1000), 4_000_000, true, "river", undefined, banks)!.rec.cls).toBe("street");
  });
});

describe("decide rights of way", () => {
  const pair = [item("a", 1000), item("b", 1000)];

  it("reserves the class the land reaches at the top of its band, and keeps it while the class follows the tier", () => {
    const ctx = emptyCtx();
    // 25,000 ‰ is a street; with room to grow by 1.35 it reaches 33,750, a collector's land.
    const first = decide(ctx, pair, rect(1000, 1000), 25_000, true, "k")!;
    expect([first.rec.cls, first.rec.row]).toEqual(["street", "collector"]);
    expect(carriageway(first.rec)).toEqual({ cls: "street" });
    // The land grows past the next tier: the class follows straight away, the reserve does not.
    const grown = decide(ctx, pair, rect(1000, 1000), 400_000, true, "k")!;
    expect([grown.rec.cls, grown.rec.row]).toEqual(["avenue", "collector"]);
    expect(carriageway(grown.rec)).toEqual({ cls: "avenue", width: ROAD_WIDTH.collector });
  });

  it("lays the reserve afresh whenever the cut moves, and reads a reserve-less cut as its own class", () => {
    const ctx = emptyCtx();
    decide(ctx, pair, rect(1000, 1000), 25_000, true, "k");
    decide(ctx, pair, rect(1000, 1000), 400_000, true, "k");
    // One side outgrows its band: the cut is laid again, its reserve with it.
    const moved = decide(ctx, [item("a", 5000), item("b", 1000)], rect(1000, 1000), 400_000, true, "k")!;
    expect(moved.rec.row).toBe("avenue");
    const { row: _, ...older } = moved.rec;
    expect(rightOfWay(older)).toBe(moved.rec.cls);
  });

  it("lays a road no wider than its reserve once its class outgrows it, and keeps a river's reserve its own", () => {
    const ctx = emptyCtx();
    decide(ctx, pair, rect(1000, 1000), 25_000, true, "k");
    split(ctx, pair, rect(1000, 1000), 400_000, true, "k", "d");
    expect(ctx.roads).toContainEqual(expect.objectContaining({ cls: "avenue", width: ROAD_WIDTH.collector }));
    const banks: [Item[], Item[]] = [[pair[0]!], [pair[1]!]];
    decide(ctx, pair, rect(1000, 1000), 25_000, true, "river", undefined, banks);
    const grown = [item("a", 5000), item("b", 1000)];
    const moved = decide(ctx, grown, rect(1000, 1000), 25_000, true, "river", undefined, [[grown[0]!], [grown[1]!]])!;
    expect(moved.rec.row).toBe(moved.rec.cls);
  });
});
