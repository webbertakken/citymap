import { describe, expect, it } from "vitest";
import type { Road } from "../city/city";
import type { Pt } from "../fixed/polygon";
import { loopConnectors } from "./connectors";

const street = (...pts: [number, number][]): Road => ({ pts: pts.map(([x, y]) => ({ x, y })), cls: "street" });
const square = (x: number, y: number, s: number): Pt[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const outline = square(-5000, -5000, 10_000);

describe("loopConnectors", () => {
  it("joins two street ends that stop near each other on different roads, with a lane", () => {
    const roads = [street([0, 0], [1000, 0]), street([1100, 0], [2000, 0])];
    expect(loopConnectors(roads, [], outline)).toEqual([
      {
        pts: [
          { x: 1000, y: 0 },
          { x: 1100, y: 0 },
        ],
        cls: "lane",
      },
    ]);
  });

  it("leaves an end that meets another road, one at the town's edge, and ends too far apart", () => {
    const meets = [street([0, 0], [1000, 0]), street([1000, -500], [1000, 500])];
    expect(loopConnectors(meets, [], outline)).toEqual([]);
    const edge = [street([4900, 0], [4990, 0]), street([4990, 100], [4900, 100])];
    expect(loopConnectors(edge, [], outline)).toEqual([]);
    const far = [street([0, 0], [1000, 0]), street([1300, 0], [2000, 0])];
    expect(loopConnectors(far, [], outline)).toEqual([]);
  });

  it("never joins a road to itself, and gives each end one lane, to its nearest", () => {
    const hook = [street([0, 0], [1000, 0], [1000, 100], [100, 100])];
    expect(loopConnectors(hook, [], outline)).toEqual([]);
    const three = [street([0, 0], [1000, 0]), street([1100, 0], [2000, 0]), street([1050, 150], [1050, 1000])];
    const lanes = loopConnectors(three, [], outline);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.pts).toEqual([
      { x: 1000, y: 0 },
      { x: 1100, y: 0 },
    ]);
  });

  it("draws no lane across a lot or a park, and leaves major roads' ends alone", () => {
    const roads = [street([0, 0], [1000, 0]), street([1100, 0], [2000, 0])];
    expect(loopConnectors(roads, [square(1040, -20, 40)], outline)).toEqual([]);
    // A shape touching the lane's line only at a corner off it does not block it.
    expect(loopConnectors(roads, [square(1040, 40, 40)], outline)).toHaveLength(1);
    const major: Road[] = [{ ...roads[0]!, cls: "avenue" }, roads[1]!];
    expect(loopConnectors(major, [], outline)).toEqual([]);
  });

  it("treats a shape along the lane's line, or round the whole lane, as in the way, and one beyond it as clear", () => {
    const roads = [street([0, 0], [1000, 0]), street([1100, 0], [2000, 0])];
    // An edge lying on the lane's line and overlapping it.
    expect(loopConnectors(roads, [square(1040, 0, 40)], outline)).toEqual([]);
    // An edge on the same line but past the lane's end, in a shape whose box still meets the lane's.
    const beyond = [
      { x: 1110, y: 0 },
      { x: 1150, y: 0 },
      { x: 1050, y: 40 },
    ];
    expect(loopConnectors(roads, [beyond], outline)).toHaveLength(1);
    // A shape holding the whole lane, its edges never crossed.
    expect(loopConnectors(roads, [square(900, -300, 600)], outline)).toEqual([]);
  });

  it("measures a road of one point, and the far end of a road, as well as its middle", () => {
    // The first road is a single point beside the end of the second: that end meets it.
    const dot = [street([1040, 20], [1040, 20]), street([0, 0], [1000, 0])];
    expect(loopConnectors(dot, [], outline)).toEqual([]);
    // An end just past the end of another road, but within touching distance of it, meets that road.
    const past = [street([0, 0], [1000, 0]), street([1020, 0], [1020, 900])];
    expect(loopConnectors(past, [], outline)).toEqual([]);
  });

  it("settles ends equally far apart by the order of their roads", () => {
    const roads = [street([0, 0], [1000, 0]), street([1100, 0], [1100, 600]), street([1200, 0], [2000, 0])];
    expect(loopConnectors(roads, [], outline).map((l) => l.pts)).toEqual([
      [
        { x: 1000, y: 0 },
        { x: 1100, y: 0 },
      ],
    ]);
  });
});
