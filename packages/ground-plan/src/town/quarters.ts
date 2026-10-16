import { classifyNode } from "../archetype/classify";
import { isFlat } from "../archetype/forms";
import { BLOCK_LONG, BLOCK_SHORT, ROAD_WIDTH, U } from "../constants";
import { negate, perp } from "../fixed/direction";
import type { Dir } from "../fixed/direction";
import { compareKeys } from "../fixed/hash";
import { area2, chord, clip, extent, longestEdge, type Poly } from "../fixed/polygon";
import type { TreeNode } from "../tree/tree";
import { groupOf } from "./archipelago";
import { demandOf, emit, massOf, road, type Ctx, type Item } from "./context";
import { decide, heaviestFolder, lent, place, split, type Share } from "./cut";
import { centreOut } from "./partition";

/** A quarter closes once its members need this many blocks of land: about five blocks across. */
export const QUARTER_BLOCKS = 24;
export const QUARTER_LAND = QUARTER_BLOCKS * (BLOCK_SHORT + U) * (BLOCK_LONG + U);
/** At the first lay, a last quarter under this share (‰) of a full one joins the quarter before it. */
export const QUARTER_TAIL_MILLE = 400;

type QuarterItem = Extract<Item, { kind: "quarter" }>;

/** The items a folder's quarters can hold: its own lots, and children small enough to flatten. */
function eligible(ctx: Ctx, items: readonly Item[]): Item[] {
  return items.filter(
    (i) =>
      i.kind === "lots" ||
      (i.kind === "folder" &&
        i.demand <= QUARTER_LAND &&
        isFlat(classifyNode(i.node, ctx.plat.forms[i.key], ctx.toggles))),
  );
}

/** Each quarter's members, remembered: fresh in age order, or as last laid with newcomers at the end. */
function membersOf(ctx: Ctx, node: TreeNode, small: readonly Item[]): string[][] {
  const byKey = new Map(small.map((i) => [i.key, i]));
  // Remembered keys are filtered to the items laid now, so every key has its item.
  const demand = (keys: readonly string[]) => keys.reduce((sum, k) => sum + byKey.get(k)!.demand, 0);
  const records = (ctx.plat.quarters ??= {});
  const known = records[node.path];
  let groups: string[][];
  if (!known) {
    groups = [];
    let current: string[] = [];
    for (const item of small) {
      current.push(item.key);
      if (demand(current) >= QUARTER_LAND) {
        groups.push(current);
        current = [];
      }
    }
    const last = groups[groups.length - 1];
    if (current.length > 0) {
      if (last && demand(current) * 1000 < QUARTER_TAIL_MILLE * QUARTER_LAND) last.push(...current);
      else groups.push(current);
    }
    emit(ctx, "plat/quarters", { key: node.path, quarters: groups.length });
  } else {
    groups = known.map((keys) => keys.filter((k) => byKey.has(k)));
    const placed = new Set(groups.flat());
    for (const item of small) {
      if (placed.has(item.key)) continue;
      // A remembered grouping holds at least one quarter.
      const last = groups[groups.length - 1]!;
      if (demand(last) < QUARTER_LAND) last.push(item.key);
      else {
        groups.push([item.key]);
        emit(ctx, "plat/quarter-opened", { key: node.path, quarter: groups.length - 1 });
      }
    }
  }
  records[node.path] = groups;
  return groups;
}

/**
 * Quarters: many similar small folders grouped into planned quarters in age order, each cut square to its own frame.
 * Quarters and the larger children are cut as usual. Declines (false) with fewer than two small items.
 */
export function quarters(ctx: Ctx, node: TreeNode, items: Item[], poly: Poly, district: string): boolean {
  const small = eligible(ctx, items);
  if (small.length < 2) return false;
  const byKey = new Map(small.map((i) => [i.key, i]));
  const groups = membersOf(ctx, node, small);
  const grouped = new Set(groups.flat());
  const quarterItems = groups.flatMap((keys, q) =>
    keys.length === 0
      ? []
      : [
          groupOf(
            "quarter",
            `${node.path}#q${q}`,
            keys.map((k) => byKey.get(k)!),
          ),
        ],
  );
  const ordered = [...quarterItems, ...items.filter((i) => !grouped.has(i.key))].toSorted(
    (a, b) => a.firstSeen - b.firstSeen || compareKeys(a.key, b.key),
  );
  split(
    ctx,
    ctx.options.order === "centre-out" ? centreOut(ordered) : ordered,
    poly,
    node.massMille,
    true,
    node.path,
    district,
  );
  return true;
}

/** Cuts a quarter's land by streets square to its frame, across the land's longer extent. */
function frameSplit(ctx: Ctx, items: Item[], poly: Poly, key: string, district: string, frame: Dir, fair?: Share) {
  const share = fair ?? { land2: area2(poly.p), demand: demandOf(items) };
  const [a0, a1] = extent(poly.p, frame);
  const [b0, b1] = extent(poly.p, perp(frame));
  const forced = a1 - a0 >= b1 - b0 ? frame : perp(frame);
  const decision = decide(ctx, items, poly, massOf(items), false, key, { forced, fixed: "street", share });
  if (!decision) return place(ctx, poly, items[0]!, district);
  const { rec: r, left, right } = decision;
  const lender = lent(decision, key);
  if (lender) {
    const [part, sub] = lender;
    return frameSplit(ctx, part, poly, sub, district, frame, share);
  }
  road(ctx, chord(poly.p, r.n, r.c), "street");
  frameSplit(ctx, left, clip(poly, r.n, r.c, ROAD_WIDTH.street), `${key}>L`, district, frame, share);
  frameSplit(ctx, right, clip(poly, negate(r.n), -r.c, ROAD_WIDTH.street), `${key}>R`, district, frame, share);
}

/** One quarter: a ward named after its heaviest folder, its members cut square to its own frame. */
export function quarter(ctx: Ctx, poly: Poly, item: QuarterItem, district: string) {
  const heaviest = heaviestFolder(item.items);
  if (heaviest)
    ctx.districts.push({
      pts: [...poly.p],
      path: item.key,
      name: heaviest.node.name,
      depth: heaviest.node.depth,
      massMille: item.massMille,
      form: "quarters",
      ward: true,
    });
  frameSplit(ctx, [...item.items], poly, item.key, district, longestEdge(poly.p));
}
