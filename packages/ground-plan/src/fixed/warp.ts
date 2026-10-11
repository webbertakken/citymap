import { CitymapError } from "../errors";
import { floorDiv, isqrt, roundDiv } from "./arithmetic";
import type { Pt } from "./polygon";

const ONE = 65536;

/** A seeded 32-bit hash of a lattice point, as an integer in [−32768, 32767]. */
export function lattice(seed: number, i: number, j: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 16) - 32768;
}

/** The quintic fade t³(t(6t − 15) + 10) for t in [0, ONE), in 1/ONE steps. */
function fade(t: number): number {
  const inner = floorDiv(t * (6 * t - 15 * ONE), ONE) + 10 * ONE;
  const cube = floorDiv(floorDiv(t * t, ONE) * t, ONE);
  return floorDiv(cube * inner, ONE);
}

/** Smooth value noise at (x, y) / wavelength, in [−32768, 32767]. */
export function noise(seed: number, x: number, y: number, wavelength: number): number {
  const fx = floorDiv(x * ONE, wavelength);
  const fy = floorDiv(y * ONE, wavelength);
  const i = floorDiv(fx, ONE);
  const j = floorDiv(fy, ONE);
  const u = fade(fx - i * ONE);
  const v = fade(fy - j * ONE);
  const a = lattice(seed, i, j);
  const b = lattice(seed, i + 1, j);
  const c = lattice(seed, i, j + 1);
  const d = lattice(seed, i + 1, j + 1);
  return (
    a + floorDiv((b - a) * u, ONE) + floorDiv((c - a) * v, ONE) + floorDiv(floorDiv(u * v, ONE) * (a - b - c + d), ONE)
  );
}

/** One warp octave: the largest displacement and the wavelength, both in fixed units. */
export type Octave = readonly [amplitude: number, wavelength: number];

/** A smooth, topology-preserving domain warp: value noise per axis and octave. */
export function warper(seed: number, octaves: readonly Octave[]): (q: Pt) => Pt {
  for (const [amplitude, wavelength] of octaves)
    if (amplitude * 5 >= wavelength)
      throw new CitymapError("fixed/warp-folds", `amplitude ${amplitude} could fold wavelength ${wavelength}`);
  return (q) => {
    let dx = 0;
    let dy = 0;
    octaves.forEach(([amplitude, wavelength], i) => {
      dx += roundDiv(noise(seed ^ Math.imul(0x9e3779b9, i + 1), q.x, q.y, wavelength) * amplitude, 32768);
      dy += roundDiv(noise(seed ^ Math.imul(0x7f4a7c15, i + 1), q.x, q.y, wavelength) * amplitude, 32768);
    });
    return { x: q.x + dx, y: q.y + dy };
  };
}

/** Inserts points so no segment is longer than step; a closed ring does not repeat its first point. */
export function densify(pts: readonly Pt[], step: number, closed: boolean): Pt[] {
  const out: Pt[] = [];
  const segments = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segments; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    const length = isqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const parts = Math.max(1, floorDiv(length + step - 1, step));
    for (let k = 0; k < parts; k++)
      out.push({ x: a.x + roundDiv((b.x - a.x) * k, parts), y: a.y + roundDiv((b.y - a.y) * k, parts) });
  }
  const last = pts[pts.length - 1];
  if (!closed && last) out.push(last);
  return out;
}
