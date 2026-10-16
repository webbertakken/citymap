import { PAVEMENT, U } from "../constants";
import { isqrt, mulDiv, roundDiv } from "../fixed/arithmetic";
import { DIRECTION, negate } from "../fixed/direction";
import { chord, clip, type Poly, type Pt } from "../fixed/polygon";
import type { CutRecord } from "../plat/plat";
import { road, type Ctx } from "./context";

/** A twin's river, 2.5 u wide, and an archipelago's first canal. */
export const RIVER = (5 * U) / 2;
/** An archipelago's other canals, 1.5 u wide. */
export const CANAL = (3 * U) / 2;

/**
 * Water along a remembered cut, a band of the given width pushed to \`into\` (a twin's water or an archipelago's canals),
 * crossed by one bridge, or two at a third and two thirds of a chord longer than 12 u. The cut crosses its land: a
 * decision keeps only cuts that do.
 */
export function waterway(ctx: Ctx, poly: Poly, r: CutRecord, width: number, into: Pt[][]) {
  const [a, b] = chord(poly.p, r.n, r.c)!;
  const half = (width / 2) * DIRECTION;
  // The band holds the chord, so the water is never empty.
  into.push([...clip(clip(poly, r.n, r.c + half, 0), negate(r.n), -(r.c - half), 0).p]);
  const length = isqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const reachOut = width / 2 + 2 * PAVEMENT;
  for (const [num, den] of length > 12 * U
    ? [
        [1, 3],
        [2, 3],
      ]
    : [[1, 2]]) {
    const m = {
      x: a.x + roundDiv((b.x - a.x) * num!, den!),
      y: a.y + roundDiv((b.y - a.y) * num!, den!),
    };
    const dx = mulDiv(r.n[0], reachOut, DIRECTION, "round");
    const dy = mulDiv(r.n[1], reachOut, DIRECTION, "round");
    road(
      ctx,
      [
        { x: m.x - dx, y: m.y - dy },
        { x: m.x + dx, y: m.y + dy },
      ],
      "street",
    );
  }
}
