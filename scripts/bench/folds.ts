// Fold divergence: each repository folded over its whole history against a fresh lay of the same tree, and a ratchet
// on the files the folds leave without a lot. Run on demand (`bun run bench --folds`): folds take minutes.
import { initialState, layCity, stateSnapshot, type City, type Snapshot } from "@citymap/ground-plan";
import { OPTIONS } from "./bench.ts";

/** Reference repositories small enough to fold in full in about a minute together. */
export const FOLDS = ["takken.io", "redux", "studio-worker", "game-ci-cli", "livediagram"];

export interface FoldPorts {
  /** The repository's history, or null when there is no such repository. */
  readonly history: (repo: string) => AsyncIterable<Snapshot> | null;
  readonly readBaseline: () => number | null;
  readonly writeBaseline: (overflow: number) => void;
  readonly log: (line: string) => void;
}

const overflowOf = (city: City) => city.towns.reduce((sum, t) => sum + t.stats.overflow, 0);

/** Folds each repository; exit code 1 when the folds' files without a lot rose above the baseline (unless rebasing). */
export async function folds(repos: readonly string[], ports: FoldPorts, rebase: boolean): Promise<number> {
  const total = await repos.reduce<Promise<number>>(async (done, repo) => {
    const sum = await done;
    const history = ports.history(repo);
    if (history === null) {
      ports.log(`bench/skipped name=folds reason=no-repository repo=${repo}`);
      return sum;
    }
    let state = initialState(OPTIONS);
    let last: { city: City; snapshot: Snapshot } | null = null;
    for await (const snapshot of history) {
      const laid = layCity(snapshot, state, OPTIONS);
      state = laid.state;
      last = { city: laid.city, snapshot };
    }
    if (last === null) return sum;
    // The same tree laid once, every file born together: what the fold would leave without its history.
    const paths = last.snapshot.files.map((f) => f.path);
    const fresh = layCity(stateSnapshot(repo, "HEAD", paths), initialState(OPTIONS), OPTIONS);
    const folded = overflowOf(last.city);
    ports.log(
      `bench/fold repo=${repo} commits=${last.snapshot.index + 1} overflow=${folded} fresh=${overflowOf(fresh.city)}`,
    );
    return sum + folded;
  }, Promise.resolve(0));
  const baseline = ports.readBaseline();
  if (rebase || baseline === null) {
    ports.writeBaseline(total);
    ports.log(`bench/fold-baseline ${rebase ? "rebased" : "recorded"} overflow=${total}`);
    return 0;
  }
  const worse = total > baseline;
  ports.log(`bench/fold-ratchet ${worse ? "worse" : "held"} overflow=${total} baseline=${baseline}`);
  return worse ? 1 : 0;
}
