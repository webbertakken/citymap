import { describe, expect, it } from "vitest";
import { aggregate, buildingsOf, cityScales, floorsOf, shareOf, type Building } from "./building";
import type { Measures } from "./section";

describe("aggregate", () => {
  it("sums sizes, commits and comments, keeps the weakest tested and the newest change", () => {
    const building = aggregate(
      {
        files: [
          { path: "a", bytes: 10, lines: 2, covered: 3, executable: 4, changed: 5, commits: 1, comments: 1, todos: 0 },
          { path: "b", bytes: 20, covered: 0, executable: 0, named: true, changed: 9, commits: 2 },
          { path: "c", named: false },
          { path: "d" },
        ],
        authors: 3,
      },
      { size: "lines" },
    );
    expect(building).toEqual({
      files: ["a", "b", "c", "d"],
      size: 2,
      bytes: 30,
      lines: 2,
      tested: 0,
      changed: 9,
      commits: 3,
      authors: 3,
      comments: 1,
      todos: 0,
    });
  });

  it("knows nothing of a lot whose files are unknown, and sizes a bytes city in bytes", () => {
    expect(aggregate({ files: [{ path: "a", covered: 1, executable: 2 }, { path: "b" }] }, { size: "bytes" })).toEqual({
      files: ["a", "b"],
      size: null,
      bytes: null,
      lines: null,
      tested: 0.5,
      changed: null,
      commits: null,
      authors: null,
      comments: null,
      todos: null,
    });
    expect(aggregate({ files: [{ path: "a", bytes: 7, lines: 1, executable: 3 }] }, { size: "bytes" })).toMatchObject({
      size: 7,
      tested: 0,
    });
  });
});

describe("buildingsOf", () => {
  it("aggregates every lot of every town", () => {
    const measures: Measures = {
      version: 1,
      source: "github",
      size: "bytes",
      tested: "name",
      available: ["size", "tested", "kind"],
      lots: { t: { a: { files: [{ path: "a", bytes: 4 }] } } },
    };
    expect(buildingsOf(measures).get("t")?.get("a")?.size).toBe(4);
  });
});

const building = (size: number | null, commits: number | null = null, changed: number | null = null): Building => ({
  files: [],
  size,
  bytes: null,
  lines: null,
  tested: null,
  changed,
  commits,
  authors: null,
  comments: null,
  todos: null,
});

describe("cityScales", () => {
  it("runs from the 5th to the 99th percentile of known positive values, times to the newest", () => {
    const buildings = Array.from({ length: 100 }, (_, i) => building(i + 1, i % 2 === 0 ? null : i, 1000 + i));
    buildings.push(building(null), building(0));
    expect(cityScales(buildings)).toEqual({
      size: { low: 5, high: 99 },
      churn: { low: 5, high: 99 },
      authors: null,
      recency: { low: 1004, high: 1099 },
    });
  });
});

describe("shareOf and floorsOf", () => {
  it("places values by logarithm or linearly, clamped to the ends", () => {
    expect(shareOf(10, { low: 10, high: 1000 }, "log")).toBe(0);
    expect(shareOf(100, { low: 10, high: 1000 }, "log")).toBeCloseTo(0.5);
    expect(shareOf(5000, { low: 10, high: 1000 }, "log")).toBe(1);
    expect(shareOf(15, { low: 10, high: 20 }, "linear")).toBe(0.5);
    expect(shareOf(7, { low: 7, high: 7 }, "log")).toBe(0);
    expect(shareOf(8, { low: 7, high: 7 }, "log")).toBe(1);
  });

  it("stands unknown and small sizes one floor high, large ones twelve, others between", () => {
    const range = { low: 10, high: 1000 };
    expect(floorsOf(null, range)).toBe(1);
    expect(floorsOf(5, null)).toBe(1);
    expect(floorsOf(0, range)).toBe(1);
    expect(floorsOf(100, range)).toBe(7);
    expect(floorsOf(10_000, range)).toBe(12);
  });
});
