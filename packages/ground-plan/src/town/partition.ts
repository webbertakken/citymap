import { classifyNode, flatten } from "../archetype/classify";
import { isFlat } from "../archetype/forms";
import { LOT_AREA, PAVEMENT, ROAD_WIDTH, U } from "../constants";
import { floorDiv, isqrt, mulDiv, roundDiv } from "../fixed/arithmetic";
import { DIRECTION, TURN, dir, negate, normalise } from "../fixed/direction";
import { compareKeys, unitMille } from "../fixed/hash";
import { area2, centroid, chord, clip, reach, type Poly, type Pt } from "../fixed/polygon";
import { WEIGHT_MILLE } from "../land-use/land-use";
import type { RadialRecord } from "../plat/plat";
import { landFor, type TreeNode } from "../tree/tree";
import { demandOf, emit, forget, road, seedKey, toPoly, type Ctx, type Item } from "./context";
import { cutClass, decide, place, reserve, split, type Decision } from "./cut";
import { neighbourhood } from "./neighbourhood";

const GROWTH_PCT = 135;
/** A sector spans at most this many angle steps (0.95π). */
const MAX_SPAN = 1946;
/** A radial core reaches at most this share (‰) of the way to the edge, so the ring keeps room. */
const RADIAL_MAX_SCALE = 950;
const RIVER = (5 * U) / 2;
/** A folder is labelled when it is a top-level folder or holds at least this share (‰) of the town's mass. */
const LABEL_MILLE = 15;

/** Oldest in the middle, then alternately either side, so newcomers join the edges. */
export function centreOut<T>(ordered: readonly T[]): T[] {
  const left: T[] = [];
  const right: T[] = [];
  ordered.forEach((item, i) => (i % 2 === 0 ? right : left).push(item));
  return [...left.reverse(), ...right];
}

/** A folder's items: child folders, its own lots, its own park; by first appearance, then key. */
function itemsOf(ctx: Ctx, node: TreeNode, district: string): Item[] {
  const items: Item[] = node.children.map((c) => ({
    kind: "folder" as const,
    key: c.path,
    demand: c.demand,
    massMille: c.massMille,
    firstSeen: c.firstSeen,
    node: c,
  }));
  const first = node.lots[0];
  if (first)
    items.push({
      kind: "lots",
      key: `${node.path}#lots`,
      demand: landFor(node.lots.length * LOT_AREA, ctx.options.densityPct),
      massMille: node.lots.reduce((sum, l) => sum + WEIGHT_MILLE[l.use], 0),
      firstSeen: first.firstSeen,
      lots: node.lots,
      district,
    });
  if (node.docs > 0)
    items.push({
      kind: "park",
      key: `${node.path}#park`,
      demand: landFor((node.docs * LOT_AREA) / 2, ctx.options.densityPct),
      massMille: 0,
      firstSeen: node.firstSeen,
      district,
    });
  return items.sort((a, b) => a.firstSeen - b.firstSeen || compareKeys(a.key, b.key));
}

/** Lays out a folder on its land: one neighbourhood when flat, else arranged by its district form. */
export function partition(ctx: Ctx, node: TreeNode, poly: Poly, district: string) {
  const previous = ctx.plat.forms[node.path];
  const form = node === ctx.root && ctx.rootForm !== undefined ? ctx.rootForm : classifyNode(node, previous);
  if (previous !== undefined && previous !== form) {
    emit(ctx, "plat/switch", { path: node.path, from: previous, to: form, massMille: node.massMille });
    forget(ctx, node.path);
  }
  ctx.plat.forms[node.path] = form;
  if (node === ctx.root) ctx.form = form;
  if (node.depth >= 1 && (node.depth === 1 || node.massMille * 1000 >= LABEL_MILLE * ctx.root.massMille))
    ctx.districts.push({
      pts: [...poly.p],
      path: node.path,
      name: node.name,
      depth: node.depth,
      massMille: node.massMille,
      form,
      ward: false,
    });
  const blocksBefore = ctx.blocks.length;
  const lotsBefore = ctx.lots.length;
  if (isFlat(form)) {
    const flat = flatten(node);
    const parkDemand = landFor((flat.docs * LOT_AREA) / 2, ctx.options.densityPct);
    neighbourhood(ctx, poly, flat.lots, parkDemand, node.path, district, form);
    return;
  }
  const items = itemsOf(ctx, node, district);
  const done =
    (form === "radial" && radial(ctx, node, items, poly, district)) ||
    (form === "twin" && twin(ctx, node, items, poly, district));
  if (!done)
    split(
      ctx,
      ctx.options.order === "centre-out" ? centreOut(items) : items,
      poly,
      node.massMille,
      true,
      node.path,
      district,
    );
  // Everything laid inside this folder without a district form yet takes this one.
  for (let i = blocksBefore; i < ctx.blocks.length; i++) (ctx.blocks[i] as { form?: typeof form }).form ??= form;
  for (let i = lotsBefore; i < ctx.lots.length; i++) (ctx.lots[i] as { form?: typeof form }).form ??= form;
}

/** The point at angle step a, scale (‰) of the way from the centre to the edge. */
const pointAt = (pts: readonly Pt[], c: Pt, a: number, scale: number): Pt => {
  const r = mulDiv(reach(pts, c, a), scale, 1000, "floor");
  const [dx, dy] = dir(a);
  return { x: c.x + mulDiv(dx, r, DIRECTION, "round"), y: c.y + mulDiv(dy, r, DIRECTION, "round") };
};

/** The sector between spokes at a0 and a1, beyond the core chord between their inner ends. */
export function sector(poly: Poly, c: Pt, a0: number, a1: number, scale: number, wSpoke: number, wRing: number): Poly {
  const [c0, s0] = dir(a0);
  const [c1, s1] = dir(a1);
  let out = clip(poly, [s0, -c0], s0 * c.x - c0 * c.y, wSpoke);
  out = clip(out, [-s1, c1], -s1 * c.x + c1 * c.y, wSpoke);
  const q0 = pointAt(poly.p, c, a0, scale);
  const q1 = pointAt(poly.p, c, a1, scale);
  if (q0.x === q1.x && q0.y === q1.y) return out;
  // Sectors turn anticlockwise and span under half a turn, so the right-hand normal of q0 → q1 points outward.
  const back = negate(normalise(q1.y - q0.y, q0.x - q1.x));
  return clip(out, back, back[0] * q0.x + back[1] * q0.y, wRing);
}

/**
 * Radial: the heaviest child at the core, the others in ring sectors by age, a ring road round the core and spokes
 * between the sectors. Declines (false) when the ring cannot be laid.
 */
export function radial(ctx: Ctx, node: TreeNode, items: Item[], poly: Poly, district: string): boolean {
  const folders = items.filter((i) => i.kind === "folder");
  const core = folders.reduce<Item | undefined>((a, b) => (a && a.massMille >= b.massMille ? a : b), undefined);
  if (!core) return false;
  const c = centroid(poly.p);
  const totalArea2 = BigInt(area2(poly.p));
  const totalDemand = BigInt(demandOf(items));
  const present = items.filter((i) => i !== core);
  let rec: RadialRecord | undefined = ctx.plat.radial[node.path];
  if (rec && rec.core !== core.key) rec = undefined;
  const known = rec;
  const outgrown =
    known !== undefined &&
    // Caps cover every item laid at the last sectoring: the core and every ring item still in the order.
    (present.some((i) => !known.order.includes(i.key) || i.demand > (known.caps[i.key] as number)) ||
      core.demand > (known.caps[core.key] as number));
  const byKey = new Map(items.map((i) => [i.key, i]));
  if (!rec || outgrown) {
    const order = known
      ? [
          ...known.order.filter((k) => present.some((i) => i.key === k)),
          ...present.filter((i) => !known.order.includes(i.key)).map((i) => i.key),
        ]
      : present.map((i) => i.key);
    if (order.length < 3) return false;
    const start = known?.start ?? floorDiv(unitMille(`${seedKey(node.path)}#radial`) * TURN, 1000);
    const demands = order.map((k) => BigInt((byKey.get(k) as Item).demand));
    // Sector bounds: each the least step whose sector reaches its share of the land.
    const angles = (scale: number): number[] | null => {
      const bounds = [start];
      for (let i = 0; i < demands.length - 1; i++) {
        const a0 = bounds[i] as number;
        const target = (demands[i] as bigint) * totalArea2;
        const reaches = (a1: number) => BigInt(area2(sector(poly, c, a0, a1, scale, 0, 0).p)) * totalDemand >= target;
        if (!reaches(a0 + MAX_SPAN)) return null;
        let lo = a0;
        let hi = a0 + MAX_SPAN;
        while (lo < hi) {
          const mid = lo + floorDiv(hi - lo, 2);
          if (reaches(mid)) hi = mid;
          else lo = mid + 1;
        }
        bounds.push(lo);
      }
      bounds.push(start + TURN);
      const last = (bounds[bounds.length - 1] as number) - (bounds[bounds.length - 2] as number);
      return last > 0 && last <= MAX_SPAN ? bounds : null;
    };
    const coreDemand = BigInt(core.demand);
    // Four rounds fit the core polygon to its demand; the fifth lays the final sectors.
    let scale = isqrt(Number((coreDemand * 1_000_000n) / totalDemand));
    let bounds: number[] | null = null;
    for (let round = 0; ; round++) {
      bounds = angles(scale);
      if (!bounds || round === 4) break;
      const coreArea2 = BigInt(Math.max(1, area2(bounds.slice(0, -1).map((a) => pointAt(poly.p, c, a, scale)))));
      const ratio = Number((coreDemand * totalArea2 * 1_000_000n) / (totalDemand * coreArea2));
      scale = Math.min(RADIAL_MAX_SCALE, floorDiv(scale * isqrt(ratio), 1000));
    }
    if (!bounds) return false;
    if (known) {
      emit(ctx, "plat/radial-resector", { path: node.path });
      // Every sector turns: each item lays afresh in its new land rather than keep a grid that lies across it.
      for (const item of items) forget(ctx, item.key);
    }
    rec = {
      core: core.key,
      start,
      order,
      bounds,
      scaleMille: scale,
      caps: Object.fromEntries(items.map((i) => [i.key, roundDiv(i.demand * GROWTH_PCT, 100)])),
    };
    ctx.plat.radial[node.path] = rec;
  }
  const r = rec;
  const ringClass = cutClass(node.massMille, true);
  const spokeClass = cutClass(node.massMille, false);
  const wRing = ROAD_WIDTH[ringClass];
  const wSpoke = ROAD_WIDTH[spokeClass];
  const spokes = r.bounds.slice(0, -1);
  const inner = spokes.map((a) => pointAt(poly.p, c, a, r.scaleMille));
  road(ctx, [...inner, inner[0] as Pt], ringClass);
  for (const a of spokes) road(ctx, [pointAt(poly.p, c, a, r.scaleMille), pointAt(poly.p, c, a, 1000)], spokeClass);
  const sub = (key: string) => seedKey(`${node.path}>${key}`);
  r.order.forEach((key, i) => {
    const piece = sector(poly, c, r.bounds[i] as number, r.bounds[i + 1] as number, r.scaleMille, wSpoke, wRing);
    const item = byKey.get(key);
    if (item) place(ctx, piece, item, sub(item.key));
    else reserve(ctx, piece, district);
  });
  place(ctx, toPoly(inner, wRing), core, sub(core.key));
  return true;
}

/** Twin: the two heaviest children on either bank of a river, the rest joining the bank with less demand. */
export function twin(ctx: Ctx, node: TreeNode, items: Item[], poly: Poly, district: string): boolean {
  const folders = items.filter((i) => i.kind === "folder").sort((a, b) => b.massMille - a.massMille);
  const [first, second] = folders;
  if (!first || !second) return false;
  const left: Item[] = [first];
  const right: Item[] = [second];
  for (const item of items) {
    if (item === first || item === second) continue;
    (demandOf(left) <= demandOf(right) ? left : right).push(item);
  }
  // A switch to twin forgets the folder's cuts, so this decision is fresh: a river that crosses the land.
  const decision = decide(ctx, items, poly, node.massMille, true, node.path, undefined, [left, right]) as Decision;
  const { rec: r } = decision;
  const seg = chord(poly.p, r.n, r.c) as [Pt, Pt];
  const half = (RIVER / 2) * DIRECTION;
  // The band holds the chord, so the water is never empty.
  ctx.water.push([...clip(clip(poly, r.n, r.c + half, 0), negate(r.n), -(r.c - half), 0).p]);
  const [a, b] = seg;
  const length = isqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const reachOut = RIVER / 2 + 2 * PAVEMENT;
  for (const [num, den] of length > 12 * U
    ? [
        [1, 3],
        [2, 3],
      ]
    : [[1, 2]]) {
    const m = {
      x: a.x + roundDiv((b.x - a.x) * (num as number), den as number),
      y: a.y + roundDiv((b.y - a.y) * (num as number), den as number),
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
  const banks: [Item[], Poly, string][] = [
    [decision.left, clip(poly, r.n, r.c, RIVER), `${node.path}>L`],
    [decision.right, clip(poly, negate(r.n), -r.c, RIVER), `${node.path}>R`],
  ];
  for (const [part, bank, sub] of banks) {
    if (part.length === 0) reserve(ctx, bank, district);
    else
      split(
        ctx,
        part,
        bank,
        part.reduce((sum, i) => sum + i.massMille, 0),
        false,
        sub,
        seedKey(sub),
      );
  }
  return true;
}
