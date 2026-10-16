// Laying a snapshot into a city, with the CLI's default options and the chosen toggles, so the browser lays what
// `citymap --no-history --toggles=…` does.
import {
  DEFAULT_LAND_USES,
  DEFAULT_SPLIT,
  initialState,
  layCity,
  type City,
  type Options,
  type Snapshot,
  type Toggle,
} from "@citymap/ground-plan";

export type Lay = (snapshot: Snapshot, toggles: readonly Toggle[]) => Promise<City>;

/** The CLI's defaults, with the toggles chosen. */
export const liveOptions = (toggles: readonly Toggle[]): Options => ({
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  loops: true,
  split: DEFAULT_SPLIT,
  toggles,
});

/** Lays on the calling thread: in the worker, and in tests. */
export const layHere: Lay = async (snapshot, toggles) => {
  const options = liveOptions(toggles);
  return layCity(snapshot, initialState(options), options).city;
};
