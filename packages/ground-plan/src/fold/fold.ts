import type { City } from "../city/city";
import { landKey } from "../land-use/land-use";
import { emptyPlat, type Plat } from "../plat/plat";
import { layCity, type FoldState, type Options } from "../region/compose";
import type { Snapshot } from "../snapshot/snapshot";
import type { PlatEvent } from "../town/context";

/** A fold's first state: an empty plat for the options' land setting, or a lockfile's plat; with a locality cache. */
export const initialState = (options: Options, plat?: Plat, cache = true): FoldState => {
  const start = { plat: plat ?? emptyPlat(landKey(options.landUses)), last: {} };
  return cache ? { ...start, cache: { towns: {}, hits: 0 } } : start;
};

/** Folds a history of snapshots, oldest first, into the last city and its state; events go to the listener. */
export function foldHistory(
  snapshots: Iterable<Snapshot>,
  options: Options,
  start: FoldState = initialState(options),
  listen: (snapshot: Snapshot, events: readonly PlatEvent[]) => void = () => {},
): { city: City | null; state: FoldState } {
  let state = start;
  let city: City | null = null;
  for (const snapshot of snapshots) {
    const laid = layCity(snapshot, state, options);
    state = laid.state;
    city = laid.city;
    listen(snapshot, laid.events);
  }
  return { city, state };
}
