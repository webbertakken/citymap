import { CitymapError } from "../errors";
import { isqrt, mulDiv, roundDiv } from "../fixed/arithmetic";
import { dir } from "../fixed/direction";
import { unitMille } from "../fixed/hash";
import { area2, type Pt } from "../fixed/polygon";

/** Each outline vertex's radius varies by up to this share (‰) either way. */
const JITTER = 60;

/** An irregular convex octagon of the given doubled area about a centre, seeded by the town's key. */
export function outlineFor(targetArea2: number, centre: Pt, key: string): Pt[] {
  if (!Number.isSafeInteger(targetArea2) || targetArea2 < 0)
    throw new CitymapError("engine/invariant", `outline land ${targetArea2} is not a non-negative integer`, {
      targetArea2,
    });
  const base = Array.from({ length: 8 }, (_, k) => {
    const radius = 1000 + roundDiv((unitMille(`${key}#r${k}`) - 500) * JITTER * 2, 1000);
    const [x, y] = dir(k * 512 + 256);
    return { x: x * radius, y: y * radius };
  });
  // Scale by √(target / base area), held in 1/2^24 steps.
  const scale = isqrt(Number((BigInt(targetArea2) << 48n) / BigInt(area2(base))));
  return base.map((p) => ({
    x: centre.x + mulDiv(p.x, scale, 2 ** 24, "round"),
    y: centre.y + mulDiv(p.y, scale, 2 ** 24, "round"),
  }));
}
