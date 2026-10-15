import { GROWTH_PCT, ROAD_WIDTH, U, type RoadClass } from "../constants";
import { floorDiv, isqrt, mulDiv, roundDiv } from "../fixed/arithmetic";
import { DIRECTION, negate, perp, rotate, type Dir } from "../fixed/direction";
import { unitMille } from "../fixed/hash";
import { area2, chord, clip, extent, inset, longestEdge, offsetFor, type Poly, type Pt } from "../fixed/polygon";
import type { CutRecord } from "../plat/plat";
import { cutClass, reclass, reserveFor } from "../roads";
import { demandOf, emit, forget, massOf, road, seedKey, type Ctx, type Item } from "./context";
import { neighbourhood } from "./neighbourhood";
import { partition } from "./partition";

export { cutClass, reclass } from "../roads";

/** The largest tilt of a fresh cut, in angle steps (0.175 rad). */
const TILT = 114;
/** A cut at least this share (‰) of its town's diameter long is a long cut, and jogs when it can. */
const LONG_CUT_MILLE = 300;
const JOG = 3 * U;
const MIN_JOG = 2 * U;
export const PAVEMENT_INSET = 12;

const grow = (demand: number) => roundDiv(demand * GROWTH_PCT, 100);

/**
 * True when the land a remembered line leaves one side has fallen below its share of the demand, shrunk by the band,
 * while the other side holds more than its share: the land around the line changed shape, not the demand.
 */
function starved(poly: Poly, r: CutRecord, dl: number, dr: number): boolean {
  // Each side's land as laid: its part of the land, less its half of the road's right of way.
  const width = ROAD_WIDTH[rightOfWay(r)];
  const left = BigInt(area2(clip(poly, r.n, r.c, width).p));
  const right = BigInt(area2(clip(poly, negate(r.n), -r.c, width).p));
  const total = left + right;
  const demand = BigInt(dl + dr);
  const band = BigInt(GROWTH_PCT);
  // left / total < (dl / demand) × 100 / band, and the same for the right, in integers.
  const short = (land: bigint, own: number) => land * demand * band < BigInt(own) * total * 100n;
  return short(left, dl) || short(right, dr);
}

/** A folder's land (doubled) and demand, as its top cut found them: what every cut below is measured against. */
export interface Share {
  readonly land2: number;
  readonly demand: number;
}

/**
 * True when a side's land, after its half of the right of way, is short of its share of the folder's land by more than
 * the band. Shortfalls within the band at every level of a folder's cut tree would otherwise compound (a folder of many
 * children is cut a dozen levels deep).
 */
function belowShare(poly: Poly, r: CutRecord, dl: number, dr: number, share: Share): boolean {
  const width = ROAD_WIDTH[rightOfWay(r)];
  const left = BigInt(area2(clip(poly, r.n, r.c, width).p));
  const right = BigInt(area2(clip(poly, negate(r.n), -r.c, width).p));
  const [land, demand, band] = [BigInt(share.land2), BigInt(share.demand), BigInt(GROWTH_PCT)];
  const short = (side: bigint, own: number) => side * demand * band < BigInt(own) * land * 100n;
  return short(left, dl) || short(right, dr);
}

/** The class whose width a cut's land was laid at; a cut laid before rights of way existed has its own class. */
export const rightOfWay = (rec: { readonly cls: RoadClass; readonly row?: RoadClass }) => rec.row ?? rec.cls;

/** The road a cut draws: its class, no wider than its right of way (a wider class waits for the cut to be laid again). */
export function carriageway(rec: { readonly cls: RoadClass; readonly row?: RoadClass }): {
  cls: RoadClass;
  width?: number;
} {
  const room = ROAD_WIDTH[rightOfWay(rec)];
  return ROAD_WIDTH[rec.cls] > room ? { cls: rec.cls, width: room } : { cls: rec.cls };
}

const isMajor = (cls: RoadClass) => cls !== "street" && cls !== "lane";

export function park(ctx: Ctx, poly: Poly, district: string) {
  const p = inset(poly, PAVEMENT_INSET);
  if (p.p.length >= 3) ctx.blocks.push({ pts: [...p.p], district, kind: "park" });
}

export function reserve(ctx: Ctx, poly: Poly, district: string) {
  const p = inset(poly, PAVEMENT_INSET);
  if (p.p.length >= 3) ctx.blocks.push({ pts: [...p.p], district, kind: "reserve" });
}

/** Lays one item on its land. */
export function place(ctx: Ctx, poly: Poly, item: Item, district: string) {
  if (item.kind === "folder") partition(ctx, item.node, poly, district);
  else if (item.kind === "lots") neighbourhood(ctx, poly, item.lots, 0, item.key, item.district, "neighbourhood");
  else park(ctx, poly, item.district);
}

/** Land bounded by collectors or bigger roads: each side with two or more items records a ward. */
function wards(ctx: Ctx, poly: Poly, rec: CutRecord, left: Item[], right: Item[], key: string) {
  const sides: [Poly, Item[]][] = [
    [clip(poly, rec.n, rec.c, 0), left],
    [clip(poly, negate(rec.n), -rec.c, 0), right],
  ];
  for (const [side, part] of sides) {
    const heaviest = part
      .filter((i): i is Extract<Item, { kind: "folder" }> => i.kind === "folder")
      .reduce<Extract<Item, { kind: "folder" }> | undefined>(
        (a, b) => (a && a.massMille >= b.massMille ? a : b),
        undefined,
      );
    if (heaviest && part.length > 1)
      ctx.districts.push({
        pts: [...side.p],
        path: `${key}#ward`,
        name: heaviest.node.name,
        depth: heaviest.node.depth,
        massMille: massOf(part),
        ward: true,
      });
  }
}

export interface Decision {
  readonly rec: CutRecord;
  readonly left: Item[];
  readonly right: Item[];
}

/** A fresh cut's normal: across the land's longer extent, tilted by its seed. */
function freshNormal(poly: Poly, key: string): Dir {
  const edge = longestEdge(poly.p);
  const [a0, a1] = extent(poly.p, edge);
  const [b0, b1] = extent(poly.p, perp(edge));
  const base = a1 - a0 >= b1 - b0 ? edge : perp(edge);
  return rotate(base, roundDiv((unitMille(`${seedKey(key)}#tilt`) - 500) * TILT, 500));
}

/**
 * The remembered binary decision at a key: which items go to which side of which line. A forced normal replaces the
 * fresh rule; assign fixes the sides (a twin's banks). Null when one item is left and nothing is remembered.
 */
export function decide(
  ctx: Ctx,
  items: Item[],
  poly: Poly,
  massMille: number,
  first: boolean,
  key: string,
  forced?: Dir,
  assign?: [Item[], Item[]],
  share?: Share,
): Decision | null {
  let rec = ctx.plat.cuts[key];
  if (rec) {
    const known = rec;
    if (
      !chord(poly.p, known.n, known.c) ||
      !items.some((i) => known.left.includes(i.key) || known.right.includes(i.key))
    ) {
      forget(ctx, key);
      rec = undefined;
    }
  }
  if (!rec) {
    if (items.length === 1) return null;
    const total = demandOf(items);
    let k = 1;
    let best = Infinity;
    let acc = 0;
    for (let i = 1; i < items.length; i++) {
      acc += items[i - 1]!.demand;
      const d = Math.abs(2 * acc - total);
      if (d < best) {
        best = d;
        k = i;
      }
    }
    const left = assign ? assign[0] : items.slice(0, k);
    const right = assign ? assign[1] : items.slice(k);
    const n = forced ?? freshNormal(poly, key);
    rec = {
      n,
      c: offsetFor(poly, n, demandOf(left), total),
      cls: cutClass(massMille, first),
      row: assign ? cutClass(massMille, first) : reserveFor(massMille, first),
      left: left.map((i) => i.key),
      right: right.map((i) => i.key),
      capLeft: grow(demandOf(left)),
      capRight: grow(demandOf(right)),
      ...(assign ? { river: true as const } : {}),
    };
    ctx.plat.cuts[key] = rec;
  } else {
    const r = rec;
    // A road follows its land's tier, within the band; a river stays a river.
    const cls = r.river ? r.cls : reclass(r.cls, massMille, first);
    if (cls !== r.cls) {
      emit(ctx, "plat/reclass", { key, from: r.cls, to: cls });
      r.cls = cls;
    }
    const sideOf = (i: Item) => (r.left.includes(i.key) ? "L" : r.right.includes(i.key) ? "R" : null);
    const demandOn = (s: "L" | "R") => demandOf(items.filter((i) => sideOf(i) === s));
    for (const item of items.filter((i) => sideOf(i) === null))
      (r.capLeft - demandOn("L") >= r.capRight - demandOn("R") ? r.left : r.right).push(item.key);
    const dl = demandOn("L");
    const dr = demandOn("R");
    const outgrown = dl > r.capLeft || dr > r.capRight;
    const both = dl > 0 && dr > 0;
    // Short of its share of the folder's land, a side recuts where today's split would move the line.
    const short =
      both && share !== undefined && belowShare(poly, r, dl, dr, share) && offsetFor(poly, r.n, dl, dl + dr) !== r.c;
    if (outgrown || (both && (starved(poly, r, dl, dr) || short))) {
      if (dl > 0 && dr > 0) {
        emit(ctx, "plat/recut", {
          key,
          reason: outgrown ? "outgrown" : "starved",
          demandLeft: dl,
          demandRight: dr,
          capLeft: r.capLeft,
          capRight: r.capRight,
        });
        r.c = offsetFor(poly, r.n, dl, dl + dr);
        // Laid again: the road takes its class's width, and room for the land at the top of its new band.
        r.row = r.river ? r.cls : reserveFor(massMille, first);
        r.capLeft = grow(dl);
        r.capRight = grow(dr);
      } else {
        // One side is empty: the growing side may take its land without moving anything.
        r.capLeft = Math.max(r.capLeft, grow(dl));
        r.capRight = Math.max(r.capRight, grow(dr));
      }
    }
  }
  const r = rec;
  return {
    rec: r,
    left: items.filter((i) => r.left.includes(i.key)),
    right: items.filter((i) => r.right.includes(i.key)),
  };
}

/** Cuts the land between ordered items, recursively; every cut is a road. */
export function split(
  ctx: Ctx,
  items: Item[],
  poly: Poly,
  massMille: number,
  first: boolean,
  key: string,
  district: string,
  fair?: Share,
) {
  // A folder's top cut sets the share every cut below it is measured against.
  const share = first || !fair ? { land2: area2(poly.p), demand: demandOf(items) } : fair;
  const decision = decide(ctx, items, poly, massMille, first, key, undefined, undefined, share);
  if (!decision) return place(ctx, poly, items[0]!, district);
  if (pinwheel(ctx, decision, poly, key, district, share)) return;
  const { rec: r, left, right } = decision;
  const major = isMajor(r.cls);
  if (left.length === 0 || right.length === 0) {
    // A side left empty lends its land: the other side extends over the whole of it under its own key. Cuts and
    // grids are absolute, so nothing already laid moves; the vacated land becomes room to grow.
    const [part, sub] = left.length > 0 ? [left, `${key}>L`] : [right, `${key}>R`];
    return split(ctx, part, poly, massOf(part), false, sub, major ? seedKey(sub) : district, share);
  }
  const drawn = carriageway(r);
  road(ctx, chord(poly.p, r.n, r.c), drawn.cls, drawn.width);
  if (major) wards(ctx, poly, r, left, right, key);
  const width = ROAD_WIDTH[rightOfWay(r)];
  split(
    ctx,
    left,
    clip(poly, r.n, r.c, width),
    massOf(left),
    false,
    `${key}>L`,
    major ? seedKey(`${key}>L`) : district,
    share,
  );
  split(
    ctx,
    right,
    clip(poly, negate(r.n), -r.c, width),
    massOf(right),
    false,
    `${key}>R`,
    major ? seedKey(`${key}>R`) : district,
    share,
  );
}

/** The part of a segment whose coordinate along m lies within [lo, hi] (null bounds are open). */
export function trim(seg: readonly [Pt, Pt] | null, m: Dir, lo: number | null, hi: number | null): Pt[] | null {
  if (!seg) return null;
  const [a, b] = seg;
  const v0 = m[0] * a.x + m[1] * a.y;
  const v1 = m[0] * b.x + m[1] * b.y;
  if (v0 === v1) return (lo === null || v0 >= lo) && (hi === null || v0 <= hi) ? [a, b] : null;
  // Positions along the segment as fractions (v − v0) / (v1 − v0), clamped to [0, 1].
  const den = Math.abs(v1 - v0);
  const at = (v: number | null, open: number) =>
    v === null ? open : Math.min(den, Math.max(0, (v - v0) * Math.sign(v1 - v0)));
  const from = at(lo, v1 > v0 ? 0 : den);
  const to = at(hi, v1 > v0 ? den : 0);
  const u0 = Math.min(from, to);
  const u1 = Math.max(from, to);
  if (u1 <= u0) return null;
  const point = (u: number): Pt => ({
    x: a.x + mulDiv(b.x - a.x, u, den, "round"),
    y: a.y + mulDiv(b.y - a.y, u, den, "round"),
  });
  return [point(u0), point(u1)];
}

/** The town's diameter: that of a circle of its land. */
export const diameterOf = (landArea2: number) => 2 * isqrt(floorDiv(landArea2 * 113, 2 * 355));

/**
 * A long cut whose sides each split again becomes a pinwheel: both cross cuts square to it, the cut stepping sideways
 * between them, four roads ending in T-junctions round a plaza. Every piece is the land within two half-planes.
 */
function pinwheel(ctx: Ctx, decision: Decision, poly: Poly, key: string, district: string, share: Share): boolean {
  const { rec: r, left, right } = decision;
  const rootPath = ctx.root.path;
  if (ctx.options.jog === "off" || left.length < 2 || right.length < 2) return false;
  if (ctx.options.jog === "top-level" && !(key === rootPath || key.startsWith(`${rootPath}>`))) return false;
  // decide keeps only cuts that cross their land, so the chord exists.
  const seg = chord(poly.p, r.n, r.c)!;
  const length = isqrt((seg[1].x - seg[0].x) ** 2 + (seg[1].y - seg[0].y) ** 2);
  if (length * 1000 < LONG_CUT_MILLE * diameterOf(ctx.landArea2)) return false;
  const m = perp(r.n);
  // Both sides hold two or more items, so both decide a cut.
  const below = decide(ctx, left, clip(poly, r.n, r.c, 0), massOf(left), false, `${key}>L`, m, undefined, share)!;
  const above = decide(
    ctx,
    right,
    clip(poly, negate(r.n), -r.c, 0),
    massOf(right),
    false,
    `${key}>R`,
    m,
    undefined,
    share,
  )!;
  // Square to the main cut: parallel to m within 0.01 % (compared with |m|², as table directions are not exactly DIRECTION long).
  const square = (rec: CutRecord) => (rec.n[0] * m[0] + rec.n[1] * m[1]) * 10_000 >= (m[0] * m[0] + m[1] * m[1]) * 9999;
  if (!square(below.rec) || !square(above.rec)) return false;
  if ([below.left, below.right, above.left, above.right].some((part) => part.length === 0)) return false;
  const t1 = below.rec.c;
  const t2 = above.rec.c;
  if (Math.abs(t1 - t2) < MIN_JOG * DIRECTION) return false;
  const sigma = t1 > t2 ? -1 : 1;
  const sLeft = r.c + (sigma * JOG * DIRECTION) / 2;
  const sRight = r.c - (sigma * JOG * DIRECTION) / 2;
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  const wMain = ROAD_WIDTH[rightOfWay(r)];
  const wBelow = ROAD_WIDTH[rightOfWay(below.rec)];
  const wAbove = ROAD_WIDTH[rightOfWay(above.rec)];
  const [main, low, high] = [carriageway(r), carriageway(below.rec), carriageway(above.rec)];
  const nm = negate(m);
  const nr = negate(r.n);
  const pieces: [Item[], Poly, string, CutRecord][] = [
    [below.left, clip(clip(poly, r.n, sLeft, wMain), m, t1, wBelow), `${key}>L>L`, below.rec],
    [below.right, clip(clip(poly, r.n, sRight, wMain), nm, -t1, wBelow), `${key}>L>R`, below.rec],
    [above.right, clip(clip(poly, nr, -sRight, wMain), nm, -t2, wAbove), `${key}>R>R`, above.rec],
    [above.left, clip(clip(poly, nr, -sLeft, wMain), m, t2, wAbove), `${key}>R>L`, above.rec],
  ];
  const sLo = Math.min(sLeft, sRight);
  const sHi = Math.max(sLeft, sRight);
  const along = (c: number) => chord(poly.p, r.n, c);
  const across = (c: number) => chord(poly.p, m, c);
  road(ctx, trim(along(sLeft), m, null, hi), main.cls, main.width);
  road(ctx, trim(along(sRight), m, lo, null), main.cls, main.width);
  road(ctx, trim(across(t1), r.n, null, sHi), low.cls, low.width);
  road(ctx, trim(across(t2), r.n, sLo, null), high.cls, high.width);
  const plazaLand = clip(
    clip(clip(clip(poly, m, hi, t1 > t2 ? wBelow : wAbove), nm, -lo, t1 > t2 ? wAbove : wBelow), r.n, sHi, wMain),
    nr,
    -sLo,
    wMain,
  );
  const plaza = inset(plazaLand, PAVEMENT_INSET);
  if (plaza.p.length >= 3) ctx.blocks.push({ pts: [...plaza.p], district, kind: "plaza" });
  const major = isMajor(r.cls);
  if (major) wards(ctx, poly, r, left, right, key);
  const sideDistrict = (side: string) => (major ? seedKey(side) : district);
  for (const [part, piece, sub, rec] of pieces) {
    const side = sub.slice(0, -2);
    split(ctx, part, piece, massOf(part), false, sub, isMajor(rec.cls) ? seedKey(sub) : sideDistrict(side), share);
  }
  return true;
}
