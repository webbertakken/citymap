// The performance budgets of the fold blueprint, timed on this machine: growth checks, not ceilings for CI.
import {
  DEFAULT_LAND_USES,
  DEFAULT_SPLIT,
  compareKeys,
  initialState,
  layCity,
  type Options,
  type Snapshot,
} from "@citymap/ground-plan";

export type Budget =
  | { readonly name: string; readonly repo: string; readonly kind: "head"; readonly ms: number }
  | {
      readonly name: string;
      readonly repo: string;
      readonly kind: "fold";
      readonly commits: number;
      readonly ms: number;
    };

export const BUDGETS: readonly Budget[] = [
  { name: "next.js HEAD", repo: "next.js", kind: "head", ms: 400 },
  { name: "home-assistant HEAD", repo: "home-assistant", kind: "head", ms: 600 },
  { name: "react fold of 1,200 commits", repo: "react", kind: "fold", commits: 1200, ms: 20_000 },
  { name: "linux HEAD", repo: "linux", kind: "head", ms: 5_000 },
];

export interface Ports {
  /** The paths of the repository's HEAD, or null when there is no such repository. */
  readonly listFiles: (repo: string) => Promise<readonly string[] | null>;
  readonly history: (repo: string) => AsyncIterable<Snapshot>;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

export const OPTIONS: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  split: DEFAULT_SPLIT,
};

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** A snapshot of a tree as if every file were born at the first commit: what a HEAD lay sees, without history. */
export function headSnapshot(repository: string, paths: readonly string[]): Snapshot {
  const folders = new Map<string, number>([["", 0]]);
  for (const path of paths)
    for (let folder = folderOf(path); folder !== "" && !folders.has(folder); folder = folderOf(folder))
      folders.set(folder, 0);
  return {
    repository,
    commit: "HEAD",
    index: 0,
    files: paths.toSorted(compareKeys).map((path) => ({ path, identity: `${path}@0`, firstSeen: 0 })),
    folderFirstSeen: new Map([...folders].toSorted(([a], [b]) => compareKeys(a, b))),
  };
}

/** Lays the first `commits` commits of a history in order (the fold's own work, reading included); how many it laid. */
async function fold(history: AsyncIterable<Snapshot>, commits: number): Promise<number> {
  let state = initialState(OPTIONS);
  let laid = 0;
  for await (const snapshot of history) {
    state = layCity(snapshot, state, OPTIONS).state;
    if (++laid === commits) break;
  }
  return laid;
}

/** Lays of a HEAD snapshot timed, each from an empty plat: the median says what a lay costs, not what compiling it does. */
const HEAD_LAYS = 5;

/** The median of the lays' times. */
function medianLay(snapshot: Snapshot, now: () => number): number {
  const times = Array.from({ length: HEAD_LAYS }, () => {
    const started = now();
    layCity(snapshot, initialState(OPTIONS), OPTIONS);
    return now() - started;
  });
  return times.toSorted((a, b) => a - b)[HEAD_LAYS >> 1]!;
}

/** Times one budget: its log line, and whether it held (null when its repository is missing). */
async function time(budget: Budget, ports: Ports): Promise<boolean | null> {
  const paths = budget.kind === "head" ? await ports.listFiles(budget.repo) : [];
  if (paths === null) {
    ports.log(`bench/skipped name=${budget.name} reason=no-repository repo=${budget.repo}`);
    return null;
  }
  let ms: number;
  let size = `files=${paths.length}`;
  // The snapshot is built before the clock starts: the budget is the lay's.
  if (budget.kind === "head") ms = medianLay(headSnapshot(budget.repo, paths), ports.now);
  else {
    const started = ports.now();
    const laid = await fold(ports.history(budget.repo), budget.commits);
    ms = ports.now() - started;
    // A history shorter than the budget says so: the line names the commits actually laid.
    size = `commits=${laid}${laid < budget.commits ? ` short-of=${budget.commits}` : ""}`;
  }
  ms = Math.round(ms);
  const within = ms <= budget.ms;
  ports.log(`bench/${within ? "within" : "over"} name=${budget.name} ms=${ms} budget=${budget.ms} ${size}`);
  return within;
}

/** Times every budget in turn; exit code 1 when any is exceeded. */
export async function bench(budgets: readonly Budget[], ports: Ports): Promise<number> {
  const held = await budgets.reduce<Promise<(boolean | null)[]>>(
    async (done, budget) => [...(await done), await time(budget, ports)],
    Promise.resolve([]),
  );
  return held.includes(false) ? 1 : 0;
}
