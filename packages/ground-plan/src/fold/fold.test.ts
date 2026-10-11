import { describe, expect, it } from "vitest";
import { DEFAULT_LAND_USES } from "../land-use/land-use";
import { canonicalJson } from "../plat/canonical";
import { layCity, type Options } from "../region/compose";
import type { FileEntry, Snapshot } from "../snapshot/snapshot";
import { snapshotOf } from "../testing/fixtures";
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
