// District regions for the organic layer: each top-level folder of a town takes the land nearer its lots than any
// other folder's (a Voronoi diagram of lot centres, merged per folder). Presentation only: it never touches the plat.
import type { City, Town } from "../city/city";
import { U } from "../constants";
import { compareKeys } from "../fixed/hash";
import { area2, centroid, type Pt } from "../fixed/polygon";
import { densify } from "../fixed/warp";
import { delaunay } from "./delaunay";

export interface Region {
  /** The folder the region belongs to, from the repository's root. */
  readonly path: string;
  /** Its outline, anticlockwise. */
  readonly pts: readonly Pt[];
}

/** The outline is sampled this often; the samples close every region inside the town. */
const GHOST_STEP = U;

/** n / d rounded half up, for a positive d: BigInt division truncates, so a negative quotient is floored by hand. */
function roundDiv(n: bigint, d: bigint): number {
  const twice = 2n * n + d;
  const q = twice / (2n * d);
  return Number(twice % (2n * d) < 0n ? q - 1n : q);
}

/** The circumcentre of a triangle, rounded to whole fixed units (exact before rounding). */
function circumcentre(a: Pt, b: Pt, c: Pt): Pt {
  const [ax, ay, bx, by, cx, cy] = [BigInt(a.x), BigInt(a.y), BigInt(b.x), BigInt(b.y), BigInt(c.x), BigInt(c.y)];
  // Twice the triangle's orientation: positive, as every triangle is anticlockwise.
  const d = 2n * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const [a2, b2, c2] = [ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy];
  return {
    x: roundDiv(a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by), d),
    y: roundDiv(a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax), d),
  };
}

/** The regions of one town, its folders `depth` levels deep, sorted by path. */
function townRegions(town: Town, depth: number): Region[] {
  const seen = new Set<string>();
  const points: Pt[] = [];
  const labels: (string | null)[] = [];
  const add = (p: Pt, label: string | null) => {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push(p);
    labels.push(label);
  };
  for (const lot of town.lots)
    if (!lot.vacant && lot.path.split("/").length > depth)
      add(centroid(lot.pts), lot.path.split("/").slice(0, depth).join("/"));
  if (points.length === 0) return [];
  for (const p of densify(town.outline, GHOST_STEP, true)) add(p, null);
  const { triangles, neighbours } = delaunay(points);
  const centres = triangles.map(([a, b, c]) => circumcentre(points[a]!, points[b]!, points[c]!));
  // Each Voronoi edge between a folder's cell and another's, turning anticlockwise round the folder.
  const edges = new Map<string, Map<string, Pt[]>>();
  triangles.forEach((tri, t) => {
    for (let k = 0; k < 3; k++) {
      const [u, v] = [tri[(k + 1) % 3]!, tri[(k + 2) % 3]!];
      const [mine, theirs] = [labels[u] ?? null, labels[v] ?? null];
      const beyond = neighbours[t]![k]!;
      if (mine === null || mine === theirs || beyond < 0) continue;
      const [from, to] = [centres[beyond]!, centres[t]!];
      if (from.x === to.x && from.y === to.y) continue;
      const byStart = edges.get(mine) ?? new Map<string, Pt[]>();
      edges.set(mine, byStart);
      const key = `${from.x},${from.y}`;
      byStart.set(key, [...(byStart.get(key) ?? []), to]);
    }
  });
  // Chain each folder's edges into rings; its region is the largest.
  return [...edges]
    .toSorted(([a], [b]) => compareKeys(a, b))
    .map(([path, byStart]) => {
      const rings: Pt[][] = [];
      for (const [start] of byStart) {
        while (byStart.get(start)!.length > 0) {
          const ring: Pt[] = [];
          let at = start;
          for (let next = byStart.get(at)?.pop(); next; next = byStart.get(at)?.pop()) {
            ring.push(next);
            at = `${next.x},${next.y}`;
            if (at === start) break;
          }
          rings.push(ring);
        }
      }
      const pts = rings.reduce<Pt[]>((best, ring) => (area2(ring) > area2(best) ? ring : best), []);
      return { path, pts };
    });
}

/**
 * The district regions of every town of a city, in town order: each top-level folder of a town (below its root for a
 * split or group town) gets the land nearer its lots than any other folder's. Old towns, frozen as they stood, get none.
 */
export function cityRegions(city: City): Region[][] {
  return city.towns.map((town) => {
    if (town.old) return [];
    const root = town.key === city.repository ? "" : town.key.slice(city.repository.length + 1);
    return townRegions(town, root === "" ? 1 : root.split("/").length + 1);
  });
}
