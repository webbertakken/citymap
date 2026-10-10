// Convex polygon geometry for the neighbourhood prototype. Edges carry a road width so cuts become streets.

export interface Pt {
  x: number;
  y: number;
}

/** A convex polygon, counter-clockwise; w[i] is the width of the road on the edge from p[i] to p[i + 1]. */
export interface Poly {
  p: Pt[];
  w: number[];
}

export const area = (pts: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

export const centroid = (pts: Pt[]): Pt => {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-9) return pts[0];
  return { x: cx / (3 * a), y: cy / (3 * a) };
};

/** Keeps the part of the polygon where n·p <= c; the new edge along the cut gets width cutWidth. */
export function clip(poly: Poly, nx: number, ny: number, c: number, cutWidth: number): Poly {
  const out: Pt[] = [];
  const widths: number[] = [];
  const n = poly.p.length;
  const side = (p: Pt) => nx * p.x + ny * p.y - c;
  for (let i = 0; i < n; i++) {
    const cur = poly.p[i];
    const next = poly.p[(i + 1) % n];
    const sc = side(cur);
    const sn = side(next);
    const cross = (): Pt => {
      const t = sc / (sc - sn);
      return { x: cur.x + (next.x - cur.x) * t, y: cur.y + (next.y - cur.y) * t };
    };
    if (sc <= 0) {
      out.push(cur);
      widths.push(poly.w[i]);
      if (sn > 0) {
        out.push(cross());
        widths.push(cutWidth);
      }
    } else if (sn <= 0) {
      out.push(cross());
      widths.push(poly.w[i]);
    }
  }
  return { p: out, w: widths };
}

/** Moves every edge inwards by half its road width plus a pavement margin. */
export function inset(poly: Poly, pavement: number): Poly {
  let result: Poly = { p: poly.p, w: poly.w.map(() => 0) };
  for (let i = 0; i < poly.p.length; i++) {
    const a = poly.p[i];
    const b = poly.p[(i + 1) % poly.p.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    // Outward normal of a counter-clockwise polygon edge.
    const nx = (b.y - a.y) / len;
    const ny = -(b.x - a.x) / len;
    const d = poly.w[i] / 2 + pavement;
    result = clip(result, nx, ny, nx * a.x + ny * a.y - d, 0);
    if (result.p.length < 3) return { p: [], w: [] };
  }
  return { p: result.p, w: poly.w.slice(0, result.p.length) };
}

/** The chord of the line n·p = c through the polygon, if any. */
export function chord(pts: Pt[], nx: number, ny: number, c: number): [Pt, Pt] | null {
  const hits: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const sa = nx * a.x + ny * a.y - c;
    const sb = nx * b.x + ny * b.y - c;
    if ((sa <= 0 && sb > 0) || (sa > 0 && sb <= 0)) {
      const t = sa / (sa - sb);
      hits.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return hits.length >= 2 ? [hits[0], hits[1]] : null;
}

/** Angle of the polygon's longest edge, in radians. */
export function longestEdgeAngle(pts: Pt[]): number {
  let best = 0;
  let angle = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best) {
      best = len;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  return angle;
}

/** Extent of the points projected onto the unit direction (dx, dy). */
export function extent(pts: Pt[], dx: number, dy: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const t = p.x * dx + p.y * dy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return [lo, hi];
}

/** Inserts points so no segment is longer than step (for smooth warping). */
export function densify(pts: Pt[], step: number, closed: boolean): Pt[] {
  const out: Pt[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < parts; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / parts, y: a.y + ((b.y - a.y) * k) / parts });
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

export const fnv1a = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

/** Deterministic value in [0, 1) from a key. */
export const unit = (key: string): number => fnv1a(key) / 4294967296;

const lattice = (seed: number, i: number, j: number): number => {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
};

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise in [-0.5, 0.5], seeded, no global state. */
export function noise(seed: number, x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = fade(x - i);
  const v = fade(y - j);
  const a = lattice(seed, i, j);
  const b = lattice(seed, i + 1, j);
  const c = lattice(seed, i, j + 1);
  const d = lattice(seed, i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A smooth, topology-preserving domain warp: value noise per axis, one octave per [amplitude, wavelength]. */
export function warper(seed: number, octaves: [number, number][]): (p: Pt) => Pt {
  return (p) => {
    let dx = 0;
    let dy = 0;
    octaves.forEach(([amplitude, wavelength], i) => {
      dx += noise(seed ^ (0x9e3779b9 * (i + 1)), p.x / wavelength, p.y / wavelength) * amplitude * 2;
      dy += noise(seed ^ (0x7f4a7c15 * (i + 1)), p.x / wavelength, p.y / wavelength) * amplitude * 2;
    });
    return { x: p.x + dx, y: p.y + dy };
  };
}
