// The fold schedule: which commits of a history the fold lays. Every commit applies to the tree; the layout runs at the
// end of each window, the recent commits one by one, windows anchored to the root (commit 0).
import { CitymapError } from "@citymap/ground-plan";

export interface Strides {
  /** The tail, laid one by one, holds at least this many commits. */
  readonly tail: number;
  /** The stride before the tail. */
  readonly window: number;
  /** Commits older than the last this many take the coarse stride. */
  readonly coarseAfter: number;
  /** The stride of the oldest commits. */
  readonly coarseWindow: number;
  /** Zone boundaries are multiples of it, counted from the root. */
  readonly grain: number;
}

export const TAIL_COMMITS = 1000;
export const WINDOW = 100;
export const COARSE_AFTER = 10_000;
export const COARSE_WINDOW = 1000;
export const ZONE_GRAIN = 1000;

export const FOLD_STRIDES: Strides = {
  tail: TAIL_COMMITS,
  window: WINDOW,
  coarseAfter: COARSE_AFTER,
  coarseWindow: COARSE_WINDOW,
  grain: ZONE_GRAIN,
};

/** Strides that lay every commit: the fold as it runs without windows, for tests and measurements. */
export const EVERY_COMMIT: Strides = {
  tail: Number.MAX_SAFE_INTEGER,
  window: 1,
  coarseAfter: Number.MAX_SAFE_INTEGER,
  coarseWindow: 1,
  grain: 1,
};

export interface FoldSchedule {
  readonly commits: number;
  /** Commits below it fold in windows of `coarseWindow`. */
  readonly coarseEnd: number;
  /** Commits from it on are laid one by one. */
  readonly tailStart: number;
  readonly strides: Strides;
}

const reject = (field: string, value: number, why: string): never => {
  throw new CitymapError("history/bad-schedule", `${field} ${why}`, { field, value });
};

const isCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

function check(commits: number, strides: Strides) {
  if (!isCount(commits)) reject("commits", commits, "is not a count of commits");
  for (const field of ["tail", "window", "coarseAfter", "coarseWindow", "grain"] as const)
    if (!isCount(strides[field]) || strides[field] === 0) reject(field, strides[field], "is not a positive integer");
  // A window that straddled a zone boundary would end in the next zone, off its own stride.
  if (strides.grain % strides.window !== 0 || strides.grain % strides.coarseWindow !== 0)
    reject("grain", strides.grain, "is not a multiple of both window strides");
  if (strides.coarseAfter < strides.tail) reject("coarseAfter", strides.coarseAfter, "is below the tail");
}

/** The zone below `commits - size`, rounded down to the grain; 0 when the history is no longer than `size`. */
const boundary = (commits: number, size: number, grain: number) =>
  Math.max(0, Math.floor((commits - size) / grain) * grain);

/** The fold schedule of a history of `commits` commits. */
export function foldSchedule(commits: number, strides: Strides = FOLD_STRIDES): FoldSchedule {
  check(commits, strides);
  return {
    commits,
    coarseEnd: boundary(commits, strides.coarseAfter, strides.grain),
    tailStart: boundary(commits, strides.tail, strides.grain),
    strides,
  };
}

/**
 * True when the fold lays commit `index`: the end of its window, or any commit of the tail. A resume (`from`, the lock's
 * index) lays its first commit again, then the commits after it on the same schedule.
 */
export function isLaid(schedule: FoldSchedule, index: number, from?: number): boolean {
  if (from !== undefined && index <= from) return index === from;
  if (index >= schedule.tailStart) return true;
  const stride = index < schedule.coarseEnd ? schedule.strides.coarseWindow : schedule.strides.window;
  return (index + 1) % stride === 0;
}

/** How many commits of the history the fold lays, from `from` (a resume) or the root. */
export function laidCount(schedule: FoldSchedule, from?: number): number {
  let count = 0;
  for (let index = from ?? 0; index < schedule.commits; index++) if (isLaid(schedule, index, from)) count++;
  return count;
}
