import type { Snapshot } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { BUDGETS, bench, headSnapshot, type Ports } from "./bench.ts";

const files = (n: number) => Array.from({ length: n }, (_, i) => `src/m${i % 7}/f${i}.ts`);

/** A history of `n` commits, each adding a file. */
async function* history(n: number): AsyncGenerator<Snapshot> {
  for (let i = 0; i < n; i++) yield { ...headSnapshot("demo", files(i + 1)), index: i, commit: `c${i}` };
}

function ports(over: Partial<Ports> = {}): Ports & { lines: string[] } {
  const lines: string[] = [];
  let clock = 0;
  return {
    listFiles: async (repo) => (repo === "missing" ? null : files(40)),
    history: () => history(5),
    // Each reading of the clock advances it by 10 ms.
    now: () => (clock += 10),
    log: (line) => lines.push(line),
    lines,
    ...over,
  };
}

describe("headSnapshot", () => {
  it("makes every file born at the first commit, and every folder with it", () => {
    const snap = headSnapshot("demo", ["b/c/x.ts", "a.ts"]);
    expect(snap.files.map((f) => [f.path, f.identity, f.firstSeen])).toEqual([
      ["a.ts", "a.ts@0", 0],
      ["b/c/x.ts", "b/c/x.ts@0", 0],
    ]);
    expect([...snap.folderFirstSeen]).toEqual([
      ["", 0],
      ["b", 0],
      ["b/c", 0],
    ]);
  });
});

describe("bench", () => {
  it("times each budget, logs it, and passes when every one is within", async () => {
    const io = ports();
    const budgets = [
      { name: "demo HEAD", repo: "demo", kind: "head" as const, ms: 50 },
      { name: "demo fold", repo: "demo", kind: "fold" as const, commits: 3, ms: 50 },
      { name: "demo long fold", repo: "demo", kind: "fold" as const, commits: 9, ms: 50 },
    ];
    expect(await bench(budgets, io)).toBe(0);
    expect(io.lines).toEqual([
      "bench/within name=demo HEAD ms=10 budget=50 files=40",
      "bench/within name=demo fold ms=10 budget=50 commits=3",
      "bench/within name=demo long fold ms=10 budget=50 commits=5 short-of=9",
    ]);
  });

  it("fails on a budget it exceeds, and names a repository it cannot find without failing", async () => {
    const io = ports({
      now: (() => {
        let t = 0;
        return () => (t += 100);
      })(),
    });
    const budgets = [
      { name: "gone HEAD", repo: "missing", kind: "head" as const, ms: 50 },
      { name: "slow HEAD", repo: "demo", kind: "head" as const, ms: 50 },
    ];
    expect(await bench(budgets, io)).toBe(1);
    expect(io.lines).toEqual([
      "bench/skipped name=gone HEAD reason=no-repository repo=missing",
      "bench/over name=slow HEAD ms=100 budget=50 files=40",
    ]);
  });

  it("holds the blueprint's budgets", () => {
    expect(BUDGETS.map((b) => [b.name, b.ms])).toEqual([
      ["next.js HEAD", 400],
      ["home-assistant HEAD", 600],
      ["react fold of 1,200 commits", 20_000],
      ["linux HEAD", 5_000],
      ["vscode HEAD", 800],
      ["godot HEAD", 400],
    ]);
  });
});
