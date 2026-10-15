import type { Snapshot } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { folds, type FoldPorts } from "./folds.ts";

/** A history of three commits, each adding a folder of ten files. */
async function* history(): AsyncGenerator<Snapshot> {
  for (let c = 0; c < 3; c++) {
    const files = Array.from({ length: 3 }, (_, f) =>
      Array.from({ length: 10 }, (__, i) => ({
        path: `f${f}/x${i}.ts`,
        identity: `f${f}/x${i}.ts@${f}`,
        firstSeen: f,
      })),
    )
      .slice(0, c + 1)
      .flat();
    yield {
      repository: "demo",
      commit: `c${c}`,
      index: c,
      files,
      folderFirstSeen: new Map([["", 0], ...Array.from({ length: c + 1 }, (_, f): [string, number] => [`f${f}`, f])]),
    };
  }
}
async function* none(): AsyncGenerator<Snapshot> {}

function ports(baseline: number | null): FoldPorts & { lines: string[]; written: number[] } {
  const lines: string[] = [];
  const written: number[] = [];
  return {
    history: (repo) => (repo === "missing" ? null : repo === "empty" ? none() : history()),
    readBaseline: () => baseline,
    writeBaseline: (n) => written.push(n),
    log: (line) => lines.push(line),
    lines,
    written,
  };
}

describe("folds", () => {
  it("folds each history, logs it beside a fresh lay, and records a first baseline", async () => {
    const io = ports(null);
    expect(await folds(["demo", "missing", "empty"], io, false)).toBe(0);
    expect(io.lines).toEqual([
      "bench/fold repo=demo commits=3 overflow=0 fresh=0",
      "bench/skipped name=folds reason=no-repository repo=missing",
      "bench/fold-baseline recorded overflow=0",
    ]);
    expect(io.written).toEqual([0]);
  });

  it("holds at the baseline, fails above it, and rebases only when asked", async () => {
    expect(await folds(["demo"], ports(0), false)).toBe(0);
    const tight = ports(-1);
    expect(await folds(["demo"], tight, false)).toBe(1);
    expect(tight.lines.at(-1)).toBe("bench/fold-ratchet worse overflow=0 baseline=-1");
    const rebased = ports(-1);
    expect(await folds(["demo"], rebased, true)).toBe(0);
    expect(rebased.lines.at(-1)).toBe("bench/fold-baseline rebased overflow=0");
  });
});
