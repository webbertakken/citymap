// The corpus pass of the bench: each repository's HEAD laid once, every live town measured, and a ratchet that fails
// when files without a lot, hierarchy inversions or towns outside their bands rise above the committed baseline.
import { initialState, layCity } from "@citymap/ground-plan";
import { OPTIONS, headSnapshot } from "./bench.ts";
import { judgeTown } from "./morphometrics.ts";

/** The public repositories the corpus pass lays at HEAD. */
export const CORPUS = [
  // The reference corpus (its public members).
  "takken.io",
  "redux",
  "game-ci-cli",
  "livediagram",
  "react",
  "next.js",
  "home-assistant",
  "typescript",
  "rust",
  // The breadth corpus: other languages, shapes and ages, so no rule is tuned to the few above.
  "go",
  "django",
  "rails",
  "vue",
  "deno",
  "spring-boot",
  "flutter",
  "ohmyzsh",
  "bitcoin",
  "kubernetes",
  // The scale corpus: very large trees, so no rule is tuned to repositories of a modest size.
  "linux",
  "vscode",
  "godot",
];

export interface Totals {
  /** Files without a lot, over the corpus. */
  readonly overflow: number;
  /** Road ends that meet a lesser road. */
  readonly violations: number;
  /** Fine-grained towns whose shares fall outside their tier's envelope. */
  readonly outside: number;
}

export interface CorpusPorts {
  readonly listFiles: (repo: string) => Promise<readonly string[] | null>;
  readonly readBaseline: () => Totals | null;
  readonly writeBaseline: (totals: Totals) => void;
  readonly log: (line: string) => void;
}

const KEYS: readonly (keyof Totals)[] = ["overflow", "violations", "outside"];
/** A baseline read back from its file: three whole totals, or a named failure. */
export function parseTotals(text: string): Totals {
  const value: unknown = JSON.parse(text);
  const read = (key: keyof Totals): number => {
    const n: unknown = typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0)
      throw new Error(`bench baseline: ${key} is not a count`);
    return n;
  };
  return { overflow: read("overflow"), violations: read("violations"), outside: read("outside") };
}

const pct = (x: number) => Math.round(x * 100);

/** Lays and measures the corpus; exit code 1 when a total rose above the baseline (unless rebasing, which records it). */
export async function corpus(repos: readonly string[], ports: CorpusPorts, rebase: boolean): Promise<number> {
  const totals = { overflow: 0, violations: 0, outside: 0 };
  const laid = await repos.reduce<Promise<string[]>>(async (done, repo) => {
    const names = await done;
    const paths = await ports.listFiles(repo);
    if (paths === null) {
      ports.log(`bench/skipped name=corpus reason=no-repository repo=${repo}`);
      return names;
    }
    const { city } = layCity(headSnapshot(repo, paths), initialState(OPTIONS), OPTIONS);
    for (const town of city.towns.filter((t) => !t.old)) {
      const j = judgeTown(town);
      totals.overflow += town.stats.overflow;
      totals.violations += j.violations;
      if (j.verdict === "outside") totals.outside++;
      ports.log(
        `bench/town repo=${repo} town=${town.name} tier=${j.tier} verdict=${j.verdict} shares=${pct(j.shares.local)}/${pct(j.shares.collector)}/${pct(j.shares.arterial)} largest=${pct(j.largest)} inversions=${j.violations}/${j.ends} overflow=${town.stats.overflow}`,
      );
    }
    return [...names, repo];
  }, Promise.resolve([]));
  const baseline = ports.readBaseline();
  const line = `overflow=${totals.overflow} inversions=${totals.violations} outside=${totals.outside} repos=${laid.join(",")}`;
  if (rebase || baseline === null) {
    ports.writeBaseline(totals);
    ports.log(`bench/baseline ${rebase ? "rebased" : "recorded"} ${line}`);
    return 0;
  }
  const worse = KEYS.filter((k) => totals[k] > baseline[k]);
  ports.log(`bench/ratchet ${worse.length > 0 ? `worse=${worse.join(",")}` : "held"} ${line}`);
  return worse.length > 0 ? 1 : 0;
}
