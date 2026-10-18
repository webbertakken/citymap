// The search index built on the main thread in short slices, yielding to input between them, so a tap or a key press
// while a city opens never waits for the whole list. Its entries are objects the main thread owns: receiving them from
// the worker by structured clone would take longer than building them here.
import type { City } from "@citymap/ground-plan";
import { entriesOf, type SearchEntry, type SearchIndex } from "./search";

/** The longest a slice builds before yielding, in milliseconds: React's scheduler yields as often. */
export const SLICE_MS = 5;

/** Yields the main thread: to pending input first where the browser can (`scheduler.yield`), else after a timeout. */
export const yieldToInput = (): Promise<void> =>
  typeof scheduler !== "undefined" && "yield" in scheduler
    ? scheduler.yield()
    : new Promise((resolve) => setTimeout(resolve, 0));

export interface SliceOptions {
  /** Stops between slices with the signal's reason. */
  readonly signal?: AbortSignal;
  /** How a slice yields; `yieldToInput` unless a test stands in. */
  readonly pause?: () => Promise<void>;
  /** The clock slices are timed by, in milliseconds. */
  readonly now?: () => number;
}

/** The same index as `searchIndex(city)`, built in slices of at most `SLICE_MS`; with the count of slices it took. */
export async function searchIndexInSlices(
  city: City,
  { signal, pause = yieldToInput, now = () => performance.now() }: SliceOptions = {},
): Promise<{ readonly index: SearchIndex; readonly slices: number }> {
  signal?.throwIfAborted();
  const entries: SearchEntry[] = [];
  const left = entriesOf(city);
  // One slice: entries until the list ends (true) or the slice's time is up (false).
  const fill = () => {
    const started = now();
    for (let next = left.next(); !next.done; next = left.next()) {
      entries.push(next.value);
      if (now() - started >= SLICE_MS) return false;
    }
    return true;
  };
  // Slices one after another, each after a yield: never two at once.
  const run = async (slices: number): Promise<number> => {
    if (fill()) return slices;
    await pause();
    signal?.throwIfAborted();
    return run(slices + 1);
  };
  return { index: { entries }, slices: await run(1) };
}
