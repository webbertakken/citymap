import { describe, expect, it } from "vitest";
import type { Road, Town } from "../city/city";
import { edgeEnds, highwayBetween, withApproach } from "./highway";

const square = (x: number, y: number, size: number) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];
const town = (x: number, roads: Road[]): Town => ({
  key: `t${x}`,
  name: `t${x}`,
  form: "polycentric",
  old: false,
  outline: square(x, 0, 1000),
  water: [],
  roads,
  blocks: [],
  lots: [],
  districts: [],
  stats: { lots: 0, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
});
const road = (x0: number, y0: number, x1: number, y1: number, cls: Road["cls"]): Road => ({
  pts: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
  cls,
});

describe("withApproach", () => {
  it("gives a town without roads a street from its nearest corner to its heart", () => {
    expect(withApproach(town(0, []), { x: 5000, y: 0 }).roads).toEqual([road(1000, 0, 500, 500, "street")]);
  });

  it("leaves a town with roads as it is", () => {
    const t = town(0, [road(0, 500, 1000, 500, "avenue")]);
    expect(withApproach(t, { x: 0, y: 0 })).toBe(t);
  });
});

describe("edgeEnds", () => {
  it("keeps the ends near the edge, or every end when none reach it", () => {
    // The edge starts at 80 % of the reach to the farthest corner (566 of 707 here).
    expect(edgeEnds(town(0, [road(0, 0, 500, 500, "street")])).map((e) => e.p)).toEqual([{ x: 0, y: 0 }]);
    expect(edgeEnds(town(0, [road(450, 500, 550, 500, "street")]))).toHaveLength(2);
  });
});

describe("highwayBetween", () => {
  it("joins the closest edge ends of the highest class both towns offer, and takes it", () => {
    const a = town(0, [road(0, 0, 1000, 1000, "avenue"), road(0, 1000, 1000, 0, "street")]);
    const b = town(3000, [road(3000, 0, 4000, 1000, "avenue"), road(3000, 1000, 4000, 0, "boulevard")]);
    expect(highwayBetween(a, b)).toEqual(road(1000, 1000, 3000, 0, "avenue"));
  });

  it("falls back to every end when one town lacks the shared class", () => {
    const a = town(0, [road(0, 500, 1000, 500, "collector")]);
    const b = town(3000, [road(3000, 500, 4000, 500, "lane"), road(3500, 0, 3500, 1000, "avenue")]);
    expect(highwayBetween(a, b).cls).toBe("collector");
  });
});
