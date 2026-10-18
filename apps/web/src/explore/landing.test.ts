import { UNIT, type City, type Road } from "@citymap/ground-plan";
import type { Hit } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { city } from "../components/testing/fixtures";
import { KERB_GAP, headingTowards, landingOf } from "./landing";
import { METRE } from "./street";

// The fixture's one lot is the square from (1, 0) to (2, 1) in the plan: its middle is at x 1.5, z −0.5 in the scene.
const road = (cls: Road["cls"], ...pts: readonly (readonly [number, number])[]): Road => ({
  cls,
  pts: pts.map(([x, y]) => ({ x: x * UNIT, y: y * UNIT })),
});
const withRoads = (roads: readonly Road[], highways: readonly Road[] = []): City => {
  const base = city("alpha");
  return { ...base, highways, towns: [{ ...base.towns[0]!, roads }] };
};
const lotHit: Hit = {
  kind: "lot",
  town: "alpha",
  townKey: "alpha",
  root: "",
  key: "a",
  path: "a.ts",
  use: "source",
  address: "#lots:0.0.0.0",
  vacant: false,
  folder: "",
  folderLots: 1,
};
const along = (heading: number) => ({ x: Math.cos(heading), z: -Math.sin(heading) });

describe("landingOf", () => {
  it("stands before the selected building, just inside the road's edge, facing it", () => {
    // A street along y = 5 in the plan (z = −5), north of the lot.
    const landing = landingOf(withRoads([road("street", [0, 5], [10, 5])]), lotHit, { x: 0, z: 0 });
    expect(landing?.kind).toBe("selected");
    expect(landing?.at.x).toBeCloseTo(1.5, 9);
    // Half a street width in, less the kerb gap, towards the building (south: +z).
    expect(landing?.at.z).toBeCloseTo(-5 + 0.5 - KERB_GAP * METRE, 9);
    expect(along(landing!.heading).x).toBeCloseTo(0, 9);
    expect(along(landing!.heading).z).toBeCloseTo(1, 9);
  });

  it("stands no further than the building when the road runs right by it", () => {
    const landing = landingOf(withRoads([road("boulevard", [0, 1.1], [10, 1.1])]), lotHit, { x: 0, z: 0 });
    expect(landing?.at.z).toBeCloseTo(-0.5, 9);
  });

  it("stands on the road where the building's middle is on it, facing along the road", () => {
    const landing = landingOf(withRoads([road("street", [0, 0.5], [10, 0.5])]), lotHit, { x: 0, z: 0 });
    expect(landing).toEqual({ at: { x: 1.5, z: -0.5 }, heading: headingTowards(1, 0), kind: "selected" });
  });

  it("lands on the road nearest the middle of the map without a selected building, facing along it", () => {
    const roads = [
      road("street", [0, 5], [0, 5]),
      road("lane", [20, 0], [20, 10]),
      road("street", [0, 9], [10, 9]),
      road("street", [0, 30], [10, 30]),
    ];
    const landing = landingOf(withRoads(roads), null, { x: 4, z: -8 });
    expect(landing?.kind).toBe("road");
    expect(landing?.at).toEqual({ x: 4, z: -9 });
    expect(along(landing!.heading).x).toBeCloseTo(1, 9);
  });

  it("uses highways too, and lands on the road for anything selected but a lot", () => {
    const highway = road("highway", [0, 0], [0, 20]);
    const block: Hit = { kind: "block", town: "alpha", townKey: "alpha", root: "", block: "built", folder: "" };
    const landing = landingOf(withRoads([], [highway]), block, { x: 1, z: -3 });
    expect(landing).toMatchObject({ at: { x: 0, z: -3 }, kind: "road" });
  });

  it("lands on the road when the selected lot is not in the city shown", () => {
    const elsewhere: Hit = { ...lotHit, townKey: "beta" };
    expect(landingOf(withRoads([road("street", [0, 5], [10, 5])]), elsewhere, { x: 3, z: 0 })?.kind).toBe("road");
  });

  it("has nowhere to land in a city without roads", () => {
    expect(landingOf(withRoads([]), lotHit, { x: 0, z: 0 })).toBeNull();
  });
});
