// Stability: how many lots move from one commit to the next. A lot moves when its slot (address) changes or its centre
// shifts more than MOVE_UNITS; a lot whose edge grows or shrinks in place has not moved.
import { centroid, type City, type Lot } from "@citymap/ground-plan";

/** A centre shift beyond this many fixed units is a move (a quarter of a lot module). */
export const MOVE_UNITS = 16;

export interface Step {
  readonly compared: number;
  readonly moved: number;
  /** The commit deleted at least one file. */
  readonly deleting: boolean;
}

const lotsOf = (city: City) =>
  new Map(
    city.towns.flatMap((t) => t.lots.filter((l) => !l.vacant).map((l): [string, Lot] => [`${t.key}\u0000${l.key}`, l])),
  );

/** The lots both cities hold, and how many of them moved. */
export function compareCities(before: City, after: City): { compared: number; moved: number } {
  const next = lotsOf(after);
  let compared = 0;
  let moved = 0;
  for (const [key, lot] of lotsOf(before)) {
    const now = next.get(key);
    if (!now) continue;
    compared++;
    const a = centroid(lot.pts);
    const b = centroid(now.pts);
    if (lot.address !== now.address || Math.hypot(a.x - b.x, a.y - b.y) > MOVE_UNITS) moved++;
  }
  return { compared, moved };
}

const mille = (shares: readonly number[]) =>
  shares.length === 0 ? 0 : Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 1000);

/** The mean share of lots moved per commit, over all commits and over those that delete files, in per mille. */
export function summarise(steps: readonly Step[]) {
  const counted = steps.filter((s) => s.compared > 0);
  const deleting = counted.filter((s) => s.deleting);
  const share = (s: Step) => s.moved / s.compared;
  return {
    commits: counted.length,
    deleting: deleting.length,
    perCommitMille: mille(counted.map(share)),
    deletingMille: mille(deleting.map(share)),
  };
}
