import { describe, expect, it } from "vitest";
import { corpus, parseTotals, type CorpusPorts, type Totals } from "./corpus.ts";

/** A small repository: two folders of source. */
const paths = [
  ...Array.from({ length: 40 }, (_, i) => `lib/f${i}.ts`),
  ...Array.from({ length: 40 }, (_, i) => `src/g${i}.ts`),
];

function ports(baseline: Totals | null): CorpusPorts & { lines: string[]; written: Totals[] } {
  const lines: string[] = [];
  const written: Totals[] = [];
  return {
    listFiles: async (repo) => (repo === "missing" ? null : paths),
    readBaseline: () => baseline,
    writeBaseline: (totals) => written.push(totals),
    log: (line) => lines.push(line),
    lines,
    written,
  };
}

describe("corpus", () => {
  it("measures every live town, names a missing repository, and records a first baseline", async () => {
    const io = ports(null);
    expect(await corpus(["demo", "missing"], io, false)).toBe(0);
    expect(io.lines[0]).toMatch(
      /^bench\/town repo=demo town=demo tier=village verdict=untargeted shares=\d+\/\d+\/\d+ largest=\d+ inversions=\d+\/\d+ overflow=\d+$/,
    );
    expect(io.lines).toContain("bench/skipped name=corpus reason=no-repository repo=missing");
    expect(io.lines.at(-1)).toMatch(/^bench\/baseline recorded overflow=\d+ inversions=\d+ outside=0 repos=demo$/);
    expect(io.written).toHaveLength(1);
  });

  it("holds while no total rises, fails when one does, and records a new baseline only when asked", async () => {
    const first = ports(null);
    await corpus(["demo"], first, false);
    const now = first.written[0]!;
    const held = ports(now);
    expect(await corpus(["demo"], held, false)).toBe(0);
    expect(held.lines.at(-1)).toMatch(/^bench\/ratchet held /);
    const tighter = ports({ ...now, violations: now.violations - 1 });
    expect(await corpus(["demo"], tighter, false)).toBe(1);
    expect(tighter.lines.at(-1)).toMatch(/^bench\/ratchet worse=violations /);
    const rebased = ports({ ...now, violations: now.violations - 1 });
    expect(await corpus(["demo"], rebased, true)).toBe(0);
    expect(rebased.written).toEqual([now]);
    expect(rebased.lines.at(-1)).toMatch(/^bench\/baseline rebased /);
  });

  it("counts a town fine-grained enough to judge that falls outside its tier's bands", async () => {
    // Forty folders of fifty files, in seven groups: a town whose roads are mostly collectors.
    const town = Array.from({ length: 40 }, (_, f) =>
      Array.from({ length: 50 }, (__, i) => `m${f % 7}/p${f}/f${i}.ts`),
    ).flat();
    const io = { ...ports(null), listFiles: async () => town };
    await corpus(["big"], io, false);
    expect(io.lines[0]).toMatch(/tier=town verdict=outside /);
    expect(io.lines.at(-1)).toMatch(/ outside=1 /);
  });
});

describe("parseTotals", () => {
  it("reads three whole totals back, and names one that is not a count", () => {
    expect(parseTotals(`{"overflow":3,"violations":1,"outside":0}`)).toEqual({
      overflow: 3,
      violations: 1,
      outside: 0,
    });
    expect(() => parseTotals(`{"overflow":3,"violations":-1,"outside":0}`)).toThrow("violations is not a count");
    expect(() => parseTotals(`[]`)).toThrow("overflow is not a count");
    expect(() => parseTotals(`null`)).toThrow("overflow is not a count");
  });
});
