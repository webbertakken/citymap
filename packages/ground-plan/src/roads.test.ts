import { describe, expect, it } from "vitest";
import {
  coldTier,
  classOf,
  cutClass,
  reclass,
  reclassOf,
  rightOfWayFor,
  reserveFor,
  tierRule,
  townTier,
} from "./roads";

const CITY = 3_000_000;
const METROPOLIS = 30_000_000;

describe("town tiers", () => {
  it("tells the tier by decade of mass, metropolis included", () => {
    expect([0, 29_999, 30_000, 300_000, CITY, METROPOLIS].map(coldTier)).toEqual([0, 0, 1, 2, 3, 4]);
  });

  it("moves up at a threshold times 1.25 and down below a threshold over 1.25", () => {
    expect(townTier(30_000, undefined)).toBe("village");
    expect(townTier(37_499, "hamlet")).toBe("hamlet");
    expect(townTier(37_500, "hamlet")).toBe("village");
    expect(townTier(24_000, "village")).toBe("village");
    expect(townTier(23_999, "village")).toBe("hamlet");
    expect(townTier(METROPOLIS * 2, "hamlet")).toBe("metropolis");
    expect(townTier(0, "metropolis")).toBe("hamlet");
  });

  it("reaches the tier at the top of the town's band", () => {
    expect(tierRule("town", 2_300_000)).toEqual({ tier: 2, reach: 3 });
    expect(tierRule("city", 2_300_000)).toEqual({ tier: 3, reach: 3 });
  });
});

describe("metropolis roads", () => {
  it("are a city's", () => {
    expect(cutClass(METROPOLIS, true)).toBe("boulevard");
    expect(cutClass(METROPOLIS, false)).toBe("avenue");
    expect(reclass("boulevard", METROPOLIS * 2, true)).toBe("boulevard");
    expect(reclass("avenue", METROPOLIS * 2, false)).toBe("avenue");
  });
});

describe("road classes under a town's tier", () => {
  const town = tierRule("town", 2_300_000);
  it("follows the mass rule without a tier", () => {
    expect(classOf(CITY, true, true, undefined)).toBe("boulevard");
    expect(reclassOf("avenue", CITY * 2, true, true, undefined)).toBe("boulevard");
    expect(rightOfWayFor(CITY, false, false, undefined)).toBe(reserveFor(CITY, false));
  });

  it("gives the town's first cut the tier's class", () => {
    expect(classOf(10, true, true, town)).toBe("avenue");
    expect(reclassOf("street", 10, true, true, town)).toBe("avenue");
    expect(rightOfWayFor(2_300_000, true, true, town)).toBe("boulevard");
  });

  it("keeps every other cut at least one class below", () => {
    // City land nested in a town-tier town: an avenue by mass, a collector under the tier.
    expect(classOf(CITY, true, false, town)).toBe("collector");
    expect(classOf(40_000, true, false, town)).toBe("collector");
    expect(classOf(10, true, false, town)).toBe("street");
    expect(reclassOf("collector", CITY * 2, true, false, town)).toBe("collector");
    // Its right of way is capped at the class the town reaches at the top of its band.
    expect(rightOfWayFor(CITY, true, false, town)).toBe("avenue");
    expect(rightOfWayFor(10, true, false, town)).toBe("street");
  });
});
