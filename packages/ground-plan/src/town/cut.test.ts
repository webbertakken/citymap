import { describe, expect, it } from "vitest";
import { emptyCtx, rect } from "../testing/fixtures";
import type { Item } from "./context";
import { decide } from "./cut";

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
