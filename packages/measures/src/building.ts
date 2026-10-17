// A lot's files seen together as one building, and the city's scales that turn its measures into floors and colours.
import type { FileMeasures, LotMeasures, Measures } from "./section";

/** One lot's measures together; null is unknown. */
export interface Building {
  readonly files: readonly string[];
  /** Size in the city's unit (`measures.size`). */
  readonly size: number | null;
  readonly bytes: number | null;
  readonly lines: number | null;
  /** The weakest share tested among its files, from 0 to 1. */
  readonly tested: number | null;
  readonly changed: number | null;
  readonly commits: number | null;
  readonly authors: number | null;
  readonly comments: number | null;
  readonly todos: number | null;
}

/** The sum of the files' known values, or null when none is known. */
function sum(files: readonly FileMeasures[], value: (file: FileMeasures) => number | undefined): number | null {
  let total: number | null = null;
  for (const file of files) {
    const v = value(file);
    if (v !== undefined) total = (total ?? 0) + v;
  }
  return total;
}

/** A file's share tested: its coverage, else whether a test names it; undefined when neither is known. */
function testedOf(file: FileMeasures): number | undefined {
  if (file.executable !== undefined && file.executable > 0) return (file.covered ?? 0) / file.executable;
  return file.named === undefined ? undefined : file.named ? 1 : 0;
}

/** Extremes of the files' known values, or null. */
function extreme(values: readonly (number | undefined)[], pick: (a: number, b: number) => number): number | null {
  const known = values.filter((v): v is number => v !== undefined);
  return known.length === 0 ? null : known.reduce(pick);
}

/** A lot's building: sizes, commits and comments summed, the weakest tested, the newest change, its people. */
export function aggregate(lot: LotMeasures, measures: Pick<Measures, "size">): Building {
  const bytes = sum(lot.files, (f) => f.bytes);
  const lines = sum(lot.files, (f) => f.lines);
  return {
    files: lot.files.map((f) => f.path),
    size: measures.size === "lines" ? lines : bytes,
    bytes,
    lines,
    tested: extreme(lot.files.map(testedOf), (a, b) => Math.min(a, b)),
    changed: extreme(
      lot.files.map((f) => f.changed),
      (a, b) => Math.max(a, b),
    ),
    commits: sum(lot.files, (f) => f.commits),
    authors: lot.authors ?? null,
    comments: sum(lot.files, (f) => f.comments),
    todos: sum(lot.files, (f) => f.todos),
  };
}

/** Every lot's building, by town key and lot key. */
export function buildingsOf(measures: Measures): ReadonlyMap<string, ReadonlyMap<string, Building>> {
  return new Map(
    Object.entries(measures.lots).map(([town, lots]) => [
      town,
      new Map(Object.entries(lots).map(([key, lot]) => [key, aggregate(lot, measures)])),
    ]),
  );
}

/** The ends of a measure's scale in a city. */
export interface Range {
  readonly low: number;
  readonly high: number;
}

export interface Scales {
  readonly size: Range | null;
  readonly churn: Range | null;
  readonly authors: Range | null;
  readonly recency: Range | null;
}

export const FLOORS = { low: 1, high: 12 } as const;
/** The percentiles a city's scale runs between: the 5th stands one floor high, the 99th twelve. */
export const PERCENTILES = { low: 5, high: 99 } as const;

/** The nearest-rank percentile of sorted values. */
const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;

/** The 5th and the 99th percentile (or the newest, for times) of the known positive values, or null with none. */
function rangeOf(values: readonly (number | null)[], top: "percentile" | "max"): Range | null {
  const sorted = values.filter((v): v is number => v !== null && v > 0).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  return {
    low: percentile(sorted, PERCENTILES.low),
    high: top === "max" ? sorted.at(-1)! : percentile(sorted, PERCENTILES.high),
  };
}

/** The city's scales over its buildings. */
export function cityScales(buildings: Iterable<Building>): Scales {
  const all = [...buildings];
  return {
    size: rangeOf(
      all.map((b) => b.size),
      "percentile",
    ),
    churn: rangeOf(
      all.map((b) => b.commits),
      "percentile",
    ),
    authors: rangeOf(
      all.map((b) => b.authors),
      "percentile",
    ),
    recency: rangeOf(
      all.map((b) => b.changed),
      "max",
    ),
  };
}

/** Where a value lies on a range, from 0 to 1: by logarithm, or linearly (times). Ends that meet split at the low end. */
export function shareOf(value: number, range: Range, scale: "log" | "linear"): number {
  if (value <= range.low) return 0;
  if (value >= range.high) return 1;
  return scale === "log"
    ? (Math.log(value) - Math.log(range.low)) / (Math.log(range.high) - Math.log(range.low))
    : (value - range.low) / (range.high - range.low);
}

/** A building's floors from its size: 1 at the 5th percentile or below (or unknown), 12 at the 99th or above. */
export function floorsOf(size: number | null, range: Range | null): number {
  if (size === null || range === null) return FLOORS.low;
  return Math.round(FLOORS.low + (FLOORS.high - FLOORS.low) * shareOf(size, range, "log"));
}
