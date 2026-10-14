// Morphometrics of a laid town: road length by class group, how coarse that statistic is, and where the hierarchy
// inverts. Shares are judged per tier, and only for towns fine-grained enough for a share to mean anything.
import { roadWidth, type Pt, type Road, type RoadClass, type Town } from "@citymap/ground-plan";

export type Tier = "hamlet" | "village" | "town" | "city" | "metropolis";
export interface Shares {
  readonly local: number;
  readonly collector: number;
  readonly arterial: number;
}
type Bands = { readonly [K in keyof Shares]: readonly [number, number] };

/**
 * Provisional bands per tier (research: road-hierarchy-targets), to be replaced by real-city figures. Hamlets and villages
 * have none: a few roads cannot hold a share.
 */
export const TIER_TARGETS: Partial<Record<Tier, Bands>> = {
  town: { local: [0.6, 0.8], collector: [0.1, 0.25], arterial: [0.05, 0.2] },
  city: { local: [0.6, 0.75], collector: [0.1, 0.2], arterial: [0.1, 0.2] },
  metropolis: { local: [0.6, 0.75], collector: [0.1, 0.2], arterial: [0.1, 0.2] },
};
/** A town whose largest road is more than this share of its length is too coarse for its shares to be judged. */
export const COARSE_SHARE = 0.05;

const KEYS: readonly (keyof Shares)[] = ["local", "collector", "arterial"];
const RANK: Readonly<Record<RoadClass, number>> = {
  lane: 0,
  street: 1,
  collector: 2,
  avenue: 3,
  boulevard: 4,
  highway: 5,
};
const GROUP = (cls: RoadClass): keyof Shares =>
  cls === "lane" || cls === "street" ? "local" : cls === "collector" ? "collector" : "arterial";

/** The tier of a town by its lots, on the decades of the spec's tiers. */
export const tierOf = (town: Town): Tier =>
  (["hamlet", "village", "town", "city"] as const).find((_, i) => town.stats.lots < 30 * 10 ** i) ?? "metropolis";

const length = (r: Road) =>
  r.pts.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p.x - r.pts[i - 1]!.x, p.y - r.pts[i - 1]!.y)), 0);

/** Distance from p to the segment a-b. */
function distance(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A town's road length shares, its largest road's share, and its road ends that meet a lesser road. */
export function measureTown(town: Town) {
  const total = town.roads.reduce((sum, r) => sum + length(r), 0);
  const shares = { local: 0, collector: 0, arterial: 0 };
  // Roads without length (or none) give nothing to measure.
  if (total === 0) return { shares, largest: 0, ends: 0, violations: 0 };
  for (const r of town.roads) shares[GROUP(r.cls)] += length(r) / total;
  const largest = Math.max(...town.roads.map((r) => length(r) / total));
  const ends = town.roads.flatMap((r, i) => [r.pts[0]!, r.pts[r.pts.length - 1]!].map((p) => ({ p, r, i })));
  // An end meets the roads it touches (within their half width); ending on a lesser one inverts the hierarchy.
  const violations = ends.filter(({ p, r, i }) =>
    town.roads.some(
      (other, j) =>
        j !== i &&
        RANK[other.cls] < RANK[r.cls] &&
        other.pts.some((q, k) => k > 0 && distance(p, other.pts[k - 1]!, q) <= roadWidth(other) / 2),
    ),
  ).length;
  return { shares, largest, ends: ends.length, violations };
}

/** A town's tier and measures, and its verdict: within or outside its tier's bands, too coarse, or untargeted. */
export function judgeTown(town: Town) {
  const tier = tierOf(town);
  const m = measureTown(town);
  const bands = TIER_TARGETS[tier];
  const verdict = !bands
    ? "untargeted"
    : m.largest > COARSE_SHARE
      ? "coarse"
      : KEYS.every((k) => m.shares[k] >= bands[k][0] && m.shares[k] <= bands[k][1])
        ? "within"
        : "outside";
  return { tier, ...m, verdict };
}
