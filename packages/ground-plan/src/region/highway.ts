import type { Road, Town } from "../city/city";
import type { RoadClass } from "../constants";
import { centroid, type Pt } from "../fixed/polygon";

const RANK: readonly RoadClass[] = ["lane", "street", "collector", "avenue", "boulevard"];
const distance2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

interface End {
  readonly p: Pt;
  readonly rank: number;
}

/** A town ready to be joined: one without roads gains an approach street from its edge nearest `toward` to its heart. */
export function withApproach(town: Town, toward: Pt): Town {
  if (town.roads.length > 0) return town;
  const c = centroid(town.outline);
  const door = town.outline.reduce((a, b) => (distance2(b, toward) < distance2(a, toward) ? b : a));
  return { ...town, roads: [{ pts: [door, c], cls: "street" }] };
}

/** The road ends at a town's edge (at least 80 % of its reach from its heart), or every end when none reach it. */
export function edgeEnds(town: Town): End[] {
  const c = centroid(town.outline);
  const reach2 = Math.max(...town.outline.map((p) => distance2(p, c)));
  const all = town.roads.flatMap((r) => [
    { p: r.pts[0]!, rank: RANK.indexOf(r.cls) },
    { p: r.pts[r.pts.length - 1]!, rank: RANK.indexOf(r.cls) },
  ]);
  const edge = all.filter((e) => distance2(e.p, c) * 100 >= 64 * reach2);
  return edge.length > 0 ? edge : all;
}

/**
 * A highway between two towns (each with roads): it joins the closest pair of edge road ends of the highest class
 * both offer, and takes that class, so it reads as one road.
 */
export function highwayBetween(from: Town, to: Town): Road {
  const a = edgeEnds(from);
  const b = edgeEnds(to);
  const rank = Math.max(0, Math.min(Math.max(...a.map((e) => e.rank)), Math.max(...b.map((e) => e.rank))));
  const pick = (list: End[]) => (list.some((e) => e.rank === rank) ? list.filter((e) => e.rank === rank) : list);
  let best: [Pt, Pt] = [a[0]!.p, b[0]!.p];
  let bestLength = Infinity;
  for (const x of pick(a))
    for (const y of pick(b)) {
      const length = distance2(x.p, y.p);
      if (length < bestLength) {
        bestLength = length;
        best = [x.p, y.p];
      }
    }
  return { pts: best, cls: RANK[rank]! };
}
