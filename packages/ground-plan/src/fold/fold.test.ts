import { describe, expect, it } from "vitest";
import { DEFAULT_LAND_USES } from "../land-use/land-use";
import { canonicalJson } from "../plat/canonical";
import { parseLock, serialiseLock } from "../plat/lock";
import { layCity, type FoldState, type Options } from "../region/compose";
import type { FileEntry, Snapshot } from "../snapshot/snapshot";
import { files, snapshotOf } from "../testing/fixtures";
import { initialState } from "./fold";

/** A deterministic history: files arrive in folders (new folders too) and some are deleted, commit by commit. */
function history(commits: number): Snapshot[] {
  let seed = 12345;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 2 ** 32;
  };
  const folders = ["src/core", "src/ui", "lib", "docs", "tools", "src/ui/forms", "pkg/a", "pkg/b"];
  const live = new Map<string, FileEntry>();
  const out: Snapshot[] = [];
  for (let c = 0; c < commits; c++) {
    if (c % 15 === 14) folders.push(`late/f${c}`);
    const adds = Math.floor(next() * 40);
    for (let k = 0; k < adds; k++) {
      const folder = folders[Math.floor(next() * folders.length)]!;
      const path = `${folder}/m${c}-${k}.${next() < 0.2 ? "json" : next() < 0.1 ? "md" : "ts"}`;
      live.set(path, { path, identity: `${path}@${c}`, firstSeen: c });
    }
    if (c % 7 === 6) for (const path of [...live.keys()].filter(() => next() < 0.15)) live.delete(path);
    out.push({ ...snapshotOf([...live.values()]), index: c, commit: "worktree" });
  }
  return out;
}

// No warp: it bends what the layout produced and never touches the plat, so the cache's equivalence is the layout's.
const OPTIONS: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: false,
};

describe("the locality cache", () => {
  it("lays every commit exactly as a fold without it", () => {
    let cached = initialState(OPTIONS);
    let plain = initialState(OPTIONS, undefined, false);
    for (const snapshot of history(40)) {
      const a = layCity(snapshot, cached, OPTIONS);
      const b = layCity(snapshot, plain, OPTIONS);
      expect(canonicalJson(a.city)).toBe(canonicalJson(b.city));
      expect(canonicalJson(a.state.plat)).toBe(canonicalJson(b.state.plat));
      cached = a.state;
      plain = b.state;
    }
    expect(cached.cache?.hits ?? 0).toBeGreaterThan(0);
  });
});

describe("locality", () => {
  it("moves nothing outside the folders a commit touches, when no plan decision fires", () => {
    const steps = history(40);
    let state = initialState(OPTIONS);
    let before = new Map<string, string>();
    let checked = 0;
    const moved: string[] = [];
    for (const [i, snapshot] of steps.entries()) {
      const laid = layCity(snapshot, state, OPTIONS);
      const now = new Map(
        laid.city.towns.flatMap((t) => t.lots.filter((l) => !l.vacant).map((l) => [l.key, canonicalJson(l.pts)])),
      );
      const previous = steps[i - 1];
      const old = new Set(previous?.files.map((f) => f.path));
      const removed = previous?.files.some((f) => !snapshot.files.some((g) => g.path === f.path)) ?? true;
      const decided = laid.events.some((e) => e.code !== "town/overflow");
      if (!decided && !removed) {
        const touched = new Set(
          snapshot.files.filter((f) => !old.has(f.path)).map((f) => f.path.slice(0, f.path.lastIndexOf("/"))),
        );
        for (const [key, pts] of now)
          if (before.has(key) && !touched.has(key.slice(0, key.lastIndexOf("/"))) && before.get(key) !== pts)
            moved.push(`${i}:${key}`);
        checked++;
      }
      before = now;
      state = laid.state;
    }
    expect(moved).toEqual([]);
    expect(checked).toBeGreaterThan(5);
  });
});

/**
 * The state with its plat read back from a lockfile: the same records, in the lock's (sorted) key order. Its towns as
 * last laid stay; its locality cache starts afresh, as a resumed fold's does (an entry recorded against another plat
 * would replay lots whose addresses that plat never issued).
 */
const readBack = (state: FoldState, snapshot: Snapshot): FoldState => ({
  ...initialState(
    OPTIONS,
    parseLock(serialiseLock({ commit: "0".repeat(40), index: snapshot.index, plat: state.plat })).plat,
  ),
  last: state.last,
});

describe("a resumed fold", () => {
  it("lays the same city from a plat read back from a lockfile, whatever order its records were made in", () => {
    let state = initialState(OPTIONS);
    for (const snapshot of history(40)) {
      const laid = layCity(snapshot, state, OPTIONS);
      const again = layCity(snapshot, readBack(state, snapshot), OPTIONS);
      expect(canonicalJson(again.city)).toBe(canonicalJson(laid.city));
      expect(canonicalJson(again.state.plat)).toBe(canonicalJson(laid.state.plat));
      state = laid.state;
    }
  });

  it("lays the lock's own commit again into the same city and plat, from a plat read back from a lockfile", () => {
    let state = initialState(OPTIONS);
    for (const snapshot of history(40)) {
      const laid = layCity(snapshot, state, OPTIONS);
      state = laid.state;
      const again = layCity(snapshot, readBack(state, snapshot), OPTIONS);
      expect(canonicalJson(again.city)).toBe(canonicalJson(laid.city));
      expect(canonicalJson(again.state.plat)).toBe(canonicalJson(state.plat));
    }
  });

  it("writes the same lock as the uninterrupted fold, from a lock saved at any commit", () => {
    const steps = history(30);
    const states: FoldState[] = [];
    let state = initialState(OPTIONS);
    for (const snapshot of steps) states.push((state = layCity(snapshot, state, OPTIONS).state));
    const end = serialiseLock({ commit: "0".repeat(40), index: 29, plat: state.plat });
    for (const saved of [3, 9, 16, 22, 27]) {
      // As the CLI resumes: the lock's plat, its own commit laid again, then the rest of the history.
      const lock = parseLock(serialiseLock({ commit: "0".repeat(40), index: saved, plat: states[saved]!.plat }));
      let resumed = initialState(OPTIONS, lock.plat);
      for (const snapshot of steps.slice(saved)) resumed = layCity(snapshot, resumed, OPTIONS).state;
      expect(serialiseLock({ commit: "0".repeat(40), index: 29, plat: resumed.plat })).toBe(end);
    }
  });
});

describe("the towns as last laid", () => {
  it("hold only the towns the last lay laid, so a re-laid commit rebuilds them exactly", () => {
    const source = files("src", 12);
    const tests = files("test", 12, 0, "test.ts");
    const first = layCity({ ...snapshotOf([...source, ...tests]), index: 0 }, initialState(OPTIONS), OPTIONS);
    expect(Object.keys(first.state.last)).toEqual(["demo"]);
    // Only tests are left: they take no land, so the town has none and is not laid.
    const second = layCity({ ...snapshotOf(tests), index: 1 }, first.state, OPTIONS);
    expect(second.city.towns).toEqual([]);
    expect(second.state.last).toEqual({});
  });
});
