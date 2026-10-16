import { classifyNode } from "../archetype/classify";
import { ROAD_WIDTH } from "../constants";
import { floorDiv } from "../fixed/arithmetic";
import { TURN, dir, negate } from "../fixed/direction";
import { compareKeys, unitMille } from "../fixed/hash";
import { area2, chord, clip, offsetFor, type Poly } from "../fixed/polygon";
import { classOf, rightOfWayFor } from "../roads";
import type { TreeNode } from "../tree/tree";
import { demandOf, emit, forget, massOf, road, seedKey, type Ctx, type Item } from "./context";
import { carriageway, decide, grow, isMajor, place, rightOfWay, split, wards } from "./cut";
import { centreOut, itemsOf } from "./partition";

/** A gateway is the shortest of this many directions, from a path-seeded start. */
export const GATE_DIRECTIONS = 32;
const GATE_STEP = TURN / GATE_DIRECTIONS;

type FolderItem = Extract<Item, { kind: "folder" }>;

/** The chain of corridors from a folder's items: its levels, the items beside it, and the first folder that is none. */
function chainOf(ctx: Ctx, items: readonly Item[], district: string) {
  const wayside: Item[] = [];
  const levels: TreeNode[] = [];
  let level = items;
  for (;;) {
    const folders = level.filter((i): i is FolderItem => i.kind === "folder");
    const heaviest = folders.reduce<FolderItem | undefined>(
      (a, b) => (a && a.massMille >= b.massMille ? a : b),
      undefined,
    );
    if (!heaviest) return null;
    wayside.push(...level.filter((i) => i !== heaviest));
    const next = heaviest.node;
    const previous = ctx.plat.forms[next.path];
    if (classifyNode(next, previous, ctx.toggles) !== "corridor") return { wayside, levels, destination: heaviest };
    if (previous !== undefined && previous !== "corridor") {
      emit(ctx, "plat/switch", { path: next.path, from: previous, to: "corridor", massMille: next.massMille });
      forget(ctx, next.path);
    }
    ctx.plat.forms[next.path] = "corridor";
    levels.push(next);
    level = itemsOf(ctx, next, district);
  }
}

/** The gateway's fresh line: of the directions, the one whose cut leaving the faubourg its share is shortest. */
function freshGateway(poly: Poly, key: string, faubourg: number, total: number) {
  const start = floorDiv(unitMille(`${seedKey(key)}#gate`) * GATE_STEP, 1000);
  let best = { n: dir(start), c: 0, length2: Infinity };
  for (let k = 0; k < GATE_DIRECTIONS; k++) {
    const n = dir(start + k * GATE_STEP);
    const c = offsetFor(poly, n, faubourg, total);
    // Both sides hold a share of the land, so the line crosses it.
    const seg = chord(poly.p, n, c)!;
    const length2 = (seg[1].x - seg[0].x) ** 2 + (seg[1].y - seg[0].y) ** 2;
    if (length2 < best.length2) best = { n, c, length2 };
  }
  return best;
}

/**
 * Corridor: a folder nearly all of whose mass lies in one child leads through to it. Every level's other items gather
 * in one faubourg on the edge of the land, behind a short gateway; the first folder down the chain that is no corridor
 * (the destination) takes the rest. Declines (false) when there is no chain to lay.
 */
export function corridor(ctx: Ctx, node: TreeNode, items: Item[], poly: Poly, district: string): boolean {
  const chain = chainOf(ctx, items, district);
  if (!chain || chain.wayside.length === 0) return false;
  const { wayside, levels, destination } = chain;
  const key = node.path;
  const known = ctx.plat.cuts[key];
  if (known && (known.right.length !== 1 || known.right[0] !== destination.key || !chord(poly.p, known.n, known.c))) {
    emit(ctx, "plat/corridor-destination", { key, from: known.right.join(","), to: destination.key });
    forget(ctx, key);
  }
  const share = { land2: area2(poly.p), demand: demandOf(wayside) + destination.demand };
  let rec = ctx.plat.cuts[key];
  if (rec) {
    // Newcomers join the faubourg; the gateway then moves only as any cut does.
    const r = rec;
    for (const item of wayside) if (!r.left.includes(item.key)) r.left.push(item.key);
    decide(ctx, [...wayside, destination], poly, node.massMille, false, key, { share });
  } else {
    const dl = demandOf(wayside);
    const line = freshGateway(poly, key, dl, dl + destination.demand);
    rec = {
      n: line.n,
      c: line.c,
      cls: classOf(node.massMille, false, false, ctx.tier),
      row: rightOfWayFor(node.massMille, false, false, ctx.tier),
      left: wayside.map((i) => i.key),
      right: [destination.key],
      capLeft: grow(dl),
      capRight: grow(destination.demand),
    };
    ctx.plat.cuts[key] = rec;
    emit(ctx, "plat/gateway", { key, destination: destination.key, wayside: wayside.length });
  }
  const r = rec;
  const drawn = carriageway(r);
  road(ctx, chord(poly.p, r.n, r.c), drawn.cls, drawn.width);
  const major = isMajor(r.cls);
  if (major) wards(ctx, poly, r, wayside, [destination], key);
  const width = ROAD_WIDTH[rightOfWay(r)];
  // Each level of the chain holds the faubourg's items of its own and the destination: the whole corridor.
  for (const level of levels)
    ctx.districts.push({
      pts: [...poly.p],
      path: level.path,
      name: level.name,
      depth: level.depth,
      massMille: level.massMille,
      form: "corridor",
      ward: false,
    });
  const ordered = wayside.toSorted((a, b) => a.firstSeen - b.firstSeen || compareKeys(a.key, b.key));
  split(
    ctx,
    ctx.options.order === "centre-out" ? centreOut(ordered) : ordered,
    clip(poly, r.n, r.c, width),
    massOf(wayside),
    false,
    `${key}>L`,
    major ? seedKey(`${key}>L`) : district,
  );
  place(ctx, clip(poly, negate(r.n), -r.c, width), destination, major ? seedKey(`${key}>R`) : district);
  return true;
}
