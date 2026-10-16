import { describe, expect, it } from "vitest";
import {
  PHASES,
  PHASE_WEIGHTS,
  advance,
  countWords,
  determinate,
  estimateWords,
  finish,
  phaseWords,
  spentWords,
  startProgress,
  type Source,
} from "./progress";

const SOURCES: readonly Source[] = ["github", "bundled", "file", "local"];
/** A load begun at 0 that has come this far. */
const at = (fraction: number) => ({ ...startProgress("github", "a/b", 0), fraction });

describe("PHASE_WEIGHTS", () => {
  it("shares the whole bar between each source's phases", () => {
    for (const source of SOURCES) {
      const total = PHASES[source].reduce((sum, phase) => sum + PHASE_WEIGHTS[source][phase]!, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });
});

describe("advance", () => {
  it("starts at the source's first phase, empty, and fills each phase's share as it counts", () => {
    const start = startProgress("github", "torvalds/linux", 1000);
    expect(start).toMatchObject({ phase: "commit", fraction: 0, started: 1000, name: "torvalds/linux" });
    const tree = advance(start, { phase: "tree", done: 0, of: 10, requests: 2 });
    const commit = PHASE_WEIGHTS.github.commit!;
    expect(tree.fraction).toBeCloseTo(commit, 9);
    const half = advance(tree, { phase: "tree", done: 5, of: 10, requests: 7 });
    expect(half.fraction).toBeCloseTo(commit + PHASE_WEIGHTS.github.tree! / 2, 9);
    expect(finish(half).fraction).toBe(1);
  });

  it("never moves backwards: more folders known, an earlier phase, or a count past its total", () => {
    const half = advance(startProgress("github", "a/b", 0), { phase: "tree", done: 5, of: 10 });
    expect(advance(half, { phase: "tree", done: 5, of: 100 }).fraction).toBe(half.fraction);
    const laying = advance(half, { phase: "lay", files: 96_080 });
    expect(advance(laying, { phase: "tree", done: 10, of: 10 })).toBe(laying);
    const over = advance(laying, { phase: "lay", done: 30, of: 20 });
    expect(over.fraction).toBeCloseTo(1 - PHASE_WEIGHTS.github.draw!, 9);
    // A phase the source does not have holds the bar where it is.
    expect(advance(laying, { phase: "parse" }).fraction).toBe(laying.fraction);
  });

  it("is determinate while the phase counts, and a sweep when it cannot", () => {
    const start = startProgress("bundled", "redux", 0);
    expect(determinate(start)).toBe(false);
    expect(determinate(advance(start, { phase: "download", done: 1, of: 4 }))).toBe(true);
    expect(determinate(advance(start, { phase: "download", done: 1 }))).toBe(false);
    expect(determinate(advance(start, { phase: "download", done: 0, of: 0 }))).toBe(false);
    // A total without a count yet counts as nothing done.
    expect(advance(start, { phase: "parse", of: 4 }).fraction).toBeCloseTo(PHASE_WEIGHTS.bundled.download!, 9);
  });
});

describe("phaseWords", () => {
  it("names each phase in words a person knows", () => {
    const github = startProgress("github", "a/b", 0);
    expect(phaseWords(github)).toBe("Asking GitHub for the latest commit");
    expect(phaseWords(advance(github, { phase: "tree" }))).toBe("Reading the file tree");
    expect(phaseWords(advance(github, { phase: "manifests" }))).toBe("Reading workspace manifests");
    const laying = advance(github, { phase: "lay", files: 96_080 });
    expect(phaseWords(laying)).toBe("Laying out 96,080 files");
    expect(phaseWords(advance(laying, { phase: "lay", done: 1, of: 2 }))).toBe("Laying out 96,080 files");
    expect(phaseWords(advance(github, { phase: "lay", files: 1 }))).toBe("Laying out 1 file");
    expect(phaseWords(advance(github, { phase: "lay" }))).toBe("Laying out the files");
    expect(phaseWords(advance(github, { phase: "draw" }))).toBe("Drawing the map");
    const bundled = startProgress("bundled", "redux", 0);
    expect(phaseWords(bundled)).toBe("Downloading");
    expect(phaseWords(advance(bundled, { phase: "parse" }))).toBe("Reading the city");
    expect(phaseWords(startProgress("file", "city.json", 0))).toBe("Reading the file");
    const local = startProgress("local", "widgets", 0);
    expect(phaseWords(local)).toBe("Reading the git index");
    expect(phaseWords(advance(local, { phase: "folder", done: 0 }))).toBe("Reading the folder");
  });
});

describe("countWords", () => {
  it("counts folders and requests, manifests, lots and bytes, in en-GB numbers", () => {
    const github = startProgress("github", "a/b", 0);
    expect(countWords(github)).toBeNull();
    expect(countWords(advance(github, { phase: "tree", done: 1204, of: 2610, requests: 27 }))).toBe(
      "1,204 of 2,610 folders · 27 requests",
    );
    expect(countWords(advance(github, { phase: "tree", done: 0, of: 1, requests: 1 }))).toBe(
      "0 of 1 folders · 1 request",
    );
    expect(countWords(advance(github, { phase: "tree", done: 0, of: 1 }))).toBe("0 of 1 folders");
    expect(countWords(advance(github, { phase: "manifests", done: 1, of: 3 }))).toBe("1 of 3 manifests");
    expect(countWords(advance(github, { phase: "lay", done: 40, of: 100, count: { done: 31_200, of: 75_123 } }))).toBe(
      "31,200 of 75,123 lots",
    );
    expect(countWords(advance(github, { phase: "lay", done: 40, of: 100 }))).toBeNull();
    const bundled = startProgress("bundled", "redux", 0);
    expect(countWords(advance(bundled, { phase: "download", done: 4_100_000, of: 12_300_000 }))).toBe("4.1 of 12.3 MB");
    expect(countWords(advance(bundled, { phase: "download", done: 4_100_000 }))).toBe("4.1 MB");
    expect(countWords(advance(bundled, { phase: "download", done: 51_200, of: 900_000 }))).toBe("51 of 900 kB");
    expect(countWords(advance(bundled, { phase: "download", done: 512 }))).toBe("1 kB");
    const local = startProgress("local", "widgets", 0);
    expect(countWords(advance(local, { phase: "folder", done: 12_345 }))).toBe("12,345 files found");
    expect(countWords(advance(local, { phase: "folder", done: 1 }))).toBe("1 file found");
    // A folder with git skips the walk: the bar jumps past it.
    expect(advance(local, { phase: "manifests" }).fraction).toBeCloseTo(0.3, 9);
  });
});

describe("spentWords and estimateWords", () => {
  it("says the time spent in seconds, then minutes and seconds", () => {
    expect(spentWords(0)).toBe("0 s");
    expect(spentWords(12_900)).toBe("12 s");
    expect(spentWords(64_000)).toBe("1 min 4 s");
  });

  it("estimates the time left once the pace is steady, rounded as a person would", () => {
    // Too early: under a tenth of the bar, or under two seconds spent.
    expect(estimateWords(at(0.05), 10_000)).toBeNull();
    expect(estimateWords(at(0.5), 1_999)).toBeNull();
    expect(estimateWords(at(0.5), 4_000)).toBe("a few seconds left");
    expect(estimateWords(at(0.5), 12_000)).toBe("about 12 s left");
    expect(estimateWords(at(0.4), 20_000)).toBe("about 30 s left");
    expect(estimateWords(at(0.1), 20_000)).toBe("about 3 min left");
    expect(estimateWords(at(1), 20_000)).toBeNull();
  });
});
