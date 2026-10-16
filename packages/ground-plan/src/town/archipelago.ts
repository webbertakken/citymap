import { isPackage } from "../archetype/classify";
import { negate } from "../fixed/direction";
import { compareKeys } from "../fixed/hash";
import { area2, clip, type Poly } from "../fixed/polygon";
import type { TreeNode } from "../tree/tree";
import { demandOf, emit, massOf, seedKey, type Ctx, type Item } from "./context";
import { decide, lent, place, type Share } from "./cut";
import { centreOut } from "./partition";
import { CANAL, RIVER, waterway } from "./waterway";

/** More packages than this share islands, so an archipelago keeps about a dozen canals. */
export const ISLAND_CAP = 12;

const byAge = (a: Item, b: Item) => a.firstSeen - b.firstSeen || compareKeys(a.key, b.key);

/** Items laid together as one: their summed land and mass, their earliest appearance. */
export const groupOf = (kind: "group" | "quarter", key: string, items: readonly Item[]): Item => ({
  kind,
  key,
  demand: demandOf(items),
  massMille: massOf(items),
  firstSeen: Math.min(...items.map((i) => i.firstSeen)),
  items,
});

/**
 * More than a dozen packages share islands: in age order, an island closes once its packages hold a twelfth of all the
 * packages' mass. The islands are remembered; a newcomer joins the last island unless it has closed.
 */
function islandGroups(ctx: Ctx, node: TreeNode, packages: readonly Item[]): Item[] {
  const byKey = new Map(packages.map((p) => [p.key, p]));
  const total = massOf(packages);
  const closed = (keys: readonly string[]) =>
    keys.reduce((sum, k) => sum + byKey.get(k)!.massMille, 0) * ISLAND_CAP >= total;
  const records = (ctx.plat.islands ??= {});
  const known = records[node.path];
  let islands: string[][];
  if (!known) {
    islands = [];
    let current: string[] = [];
    for (const p of packages) {
      current.push(p.key);
      if (closed(current)) {
        islands.push(current);
        current = [];
      }
    }
    if (current.length > 0) islands.push(current);
    emit(ctx, "plat/islands", { key: node.path, islands: islands.length });
  } else {
    islands = known.map((keys) => keys.filter((k) => byKey.has(k)));
    const placed = new Set(islands.flat());
    for (const p of packages) {
      if (placed.has(p.key)) continue;
      // A remembered grouping holds at least one island.
      const last = islands[islands.length - 1]!;
      if (!closed(last)) last.push(p.key);
      else {
        islands.push([p.key]);
        emit(ctx, "plat/island-founded", { key: node.path, island: islands.length - 1 });
      }
    }
  }
  records[node.path] = islands;
  return islands.flatMap((keys, g) => {
    const members = keys.map((k) => byKey.get(k)!);
    if (members.length <= 1) return members;
    return [groupOf("group", `${node.path}#island${g}`, members)];
  });
}

/** Cuts between islands and mainland, every cut a canal: the first 2.5 u wide, the rest 1.5 u, each its own tint. */
function canals(
  ctx: Ctx,
  items: Item[],
  poly: Poly,
  massMille: number,
  first: boolean,
  key: string,
  district: string,
  fair?: Share,
) {
  const share = first || !fair ? { land2: area2(poly.p), demand: demandOf(items) } : fair;
  const decision = decide(ctx, items, poly, massMille, first, key, { share, water: "canal" });
  if (!decision) return place(ctx, poly, items[0]!, district);
  const { rec: r, left, right } = decision;
  const lender = lent(decision, key);
  if (lender) {
    const [part, sub] = lender;
    return canals(ctx, part, poly, massOf(part), false, sub, district, share);
  }
  const width = first ? RIVER : CANAL;
  waterway(ctx, poly, r, width, ctx.canals);
  canals(ctx, left, clip(poly, r.n, r.c, width), massOf(left), false, `${key}>L`, seedKey(`${key}>L`), share);
  canals(
    ctx,
    right,
    clip(poly, negate(r.n), -r.c, width),
    massOf(right),
    false,
    `${key}>R`,
    seedKey(`${key}>R`),
    share,
  );
}

/**
 * Archipelago: a folder of packages becomes islands, one per package (shared beyond a dozen), its other items one
 * mainland, with canals and bridges between them. Declines (false) with fewer than two packages.
 */
export function archipelago(ctx: Ctx, node: TreeNode, items: Item[], poly: Poly, district: string): boolean {
  const packages = items.filter((i) => i.kind === "folder" && isPackage(i.node));
  if (packages.length < 2) return false;
  const islands = packages.length > ISLAND_CAP ? islandGroups(ctx, node, packages) : packages;
  const rest = items.filter((i) => !packages.includes(i));
  const mainland = rest.length <= 1 ? rest : [groupOf("group", `${node.path}#mainland`, rest)];
  const ordered = [...islands, ...mainland].toSorted(byAge);
  canals(
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
