// Laying a snapshot into a city, with the CLI's default options, so the browser lays what `citymap --no-history` does.
import {
  DEFAULT_LAND_USES,
  DEFAULT_SPLIT,
  initialState,
  layCity,
  type City,
  type LayProgress,
  type Options,
  type Snapshot,
} from "@citymap/ground-plan";
import type { OnStep, Step } from "../load/step";

export interface LayOptions {
  /** Ends the lay: the worker is terminated and the promise rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Hears the lay's progress as `lay` steps. */
  readonly onProgress?: OnStep;
}

export type Lay = (snapshot: Snapshot, options?: LayOptions) => Promise<City>;

/** The CLI's defaults. */
export const LIVE_OPTIONS: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  loops: true,
  split: DEFAULT_SPLIT,
};

/** The engine's progress as a step: placing and shaping each fill half the bar; the words count lots placed. */
export const layStep = ({ placed, shaped, lots }: LayProgress): Step => ({
  phase: "lay",
  done: placed + shaped,
  of: 2 * lots,
  count: { done: placed, of: lots },
});

/** `tell`, called at most once per `ms`; `flush` passes on the last call held back, if any. */
export function throttled<T>(tell: (value: T) => void, ms: number, now: () => number) {
  let last = -Infinity;
  let held: { value: T } | null = null;
  const call = (value: T) => {
    if (now() - last >= ms) {
      last = now();
      held = null;
      tell(value);
    } else held = { value };
  };
  call.flush = () => {
    if (held) tell(held.value);
    held = null;
  };
  return call;
}

/** Lays on the calling thread: in the worker, and in tests. */
export const layHere: Lay = async (snapshot, { signal, onProgress } = {}) => {
  signal?.throwIfAborted();
  const tell = onProgress && ((progress: LayProgress) => onProgress(layStep(progress)));
  return layCity(snapshot, initialState(LIVE_OPTIONS), LIVE_OPTIONS, tell).city;
};
