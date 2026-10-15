// Laying a snapshot into a city, with the CLI's default options, so the browser lays what `citymap --no-history` does.
import {
  DEFAULT_LAND_USES,
  DEFAULT_SPLIT,
  initialState,
  layCity,
  type City,
  type Options,
  type Snapshot,
} from "@citymap/ground-plan";

export type Lay = (snapshot: Snapshot) => Promise<City>;

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

/** Lays on the calling thread: in the worker, and in tests. */
export const layHere: Lay = async (snapshot) => layCity(snapshot, initialState(LIVE_OPTIONS), LIVE_OPTIONS).city;
