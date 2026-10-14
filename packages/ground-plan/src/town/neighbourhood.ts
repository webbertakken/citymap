import type { FlatForm } from "../archetype/forms";
import { BLOCK_LONG, BLOCK_SHORT, MODULE, PAVEMENT, ROAD_WIDTH, U } from "../constants";
import { floorDiv, mulDiv, roundDiv } from "../fixed/arithmetic";
import { DIRECTION, negate, normalise, perp, type Dir } from "../fixed/direction";
import {
  area2,
  centroid,
  chord,
  clip,
  extent,
  inset,
  longestEdge,
  offsetFor,
  type Poly,
  type Pt,
} from "../fixed/polygon";
import type { GridRecord } from "../plat/plat";
import type { LotSeed } from "../tree/tree";
import { emit, road, toPoly, type Ctx } from "./context";

const MAX_CLASS = 4;
/** A park strip takes at most this share (‰) of its neighbourhood. */
const PARK_CAP = 600;
/** Blocks at least this deep (row pitch less a street) hold lots back to back. */
const HALF_DEPTH = 224;

interface Cell {
  pts: Pt[];
  used: boolean;
  r: number;
  c: number;
  s0: number;
  s1: number;
  halves: [number, number][];
}

interface Slot {
  id: string;
  pts: Pt[];
  cell: number;
}

/** A grid laid on some land: its cells, its row and column range, and its slots at a lot class. */
interface Laid {
  cells: Cell[];
  rows: [number, number];
  cols: [number, number];
  slotsFor: (span: number) => Slot[];
}

const ceilDiv = (a: number, b: number) => -floorDiv(-a, b);
const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const cellId = (cell: Cell) => `${cell.r},${cell.c}`;

/** Clips a polygon to a convex land polygon. */
function clipTo(poly: Poly, land: readonly Pt[]): Poly {
  let out = poly;
  for (let i = 0; i < land.length && out.p.length >= 3; i++) {
    const p = land[i]!;
    // Land comes from inset, which never repeats a point.
    const q = land[(i + 1) % land.length]!;
    const n = normalise(q.y - p.y, p.x - q.x);
    out = clip(out, n, n[0] * p.x + n[1] * p.y, 0);
  }
  return out;
}

/** A fresh grid, aligned with the land's main frontage and fitted to it. */
function freshGrid(land: readonly Pt[]): GridRecord {
  const a = longestEdge(land);
  const b = perp(a);
  const [ea0, ea1] = extent(land, a);
  const [eb0, eb1] = extent(land, b);
  const a0 = floorDiv(ea0, DIRECTION);
  const b0 = floorDiv(eb0, DIRECTION);
  const along = ceilDiv(ea1, DIRECTION) - a0;
  const across = ceilDiv(eb1, DIRECTION) - b0;
  const rows = Math.max(1, roundDiv(across + U, BLOCK_SHORT + U));
  const cols = Math.max(1, roundDiv(along + U, BLOCK_LONG + U));
  return {
    dir: a,
    a0,
    b0,
    rowPitch: floorDiv(across + U, rows),
    colPitch: floorDiv(along + U, cols),
    span: 0,
    park: null,
    slots: {},
  };
}

/** The cells a grid gives on today's land, in serpentine order, and its slots at any lot class. Pure. */
function layGrid(g: GridRecord, land: readonly Pt[]): Laid {
  const A: Dir = g.dir;
  const B: Dir = perp(A);
  const world = (s: number, t: number): Pt => ({
    x: mulDiv(A[0], s, DIRECTION, "round") + mulDiv(B[0], t, DIRECTION, "round"),
    y: mulDiv(A[1], s, DIRECTION, "round") + mulDiv(B[1], t, DIRECTION, "round"),
  });
  const rect = (s0: number, s1: number, t0: number, t1: number): Poly =>
    toPoly([world(s0, t0), world(s1, t0), world(s1, t1), world(s0, t1)]);
  // The grid stays anchored at its remembered origin and pitch; today's land decides which cells exist.
  const [e0, e1] = extent(land, A);
  const [f0, f1] = extent(land, B);
  const rMin = floorDiv(floorDiv(f0, DIRECTION) - g.b0 + U, g.rowPitch);
  const rMax = ceilDiv(ceilDiv(f1, DIRECTION) - g.b0, g.rowPitch) - 1;
  const cMin = floorDiv(floorDiv(e0, DIRECTION) - g.a0 + U, g.colPitch);
  const cMax = ceilDiv(ceilDiv(e1, DIRECTION) - g.a0, g.colPitch) - 1;
  const cells: Cell[] = [];
  const backToBack = g.rowPitch - U >= HALF_DEPTH;
  for (let r = rMin; r <= rMax; r++) {
    const even = ((r % 2) + 2) % 2 === 0;
    for (let cc = cMin; cc <= cMax; cc++) {
      const c = even ? cc : cMax - (cc - cMin);
      const s0 = g.a0 + c * g.colPitch;
      const s1 = s0 + g.colPitch - U;
      const t0 = g.b0 + r * g.rowPitch;
      const t1 = t0 + g.rowPitch - U;
      const block = clipTo(rect(s0, s1, t0, t1), land);
      if (block.p.length < 3) continue;
      const mid = floorDiv(t0 + t1, 2);
      const full = area2(block.p) * 10 >= 4 * (s1 - s0) * (t1 - t0);
      const halves: [number, number][] = !full
        ? []
        : backToBack
          ? [
              [t0, mid],
              [mid, t1],
            ]
          : [[t0, t1]];
      cells.push({ pts: [...block.p], used: false, r, c, s0, s1, halves });
    }
  }
  const slotsFor = (span: number): Slot[] => {
    const out: Slot[] = [];
    const width = MODULE * span;
    cells.forEach((cell, index) => {
      if (cellId(cell) === g.green) return;
      const count = floorDiv(cell.s1 - cell.s0, width);
      cell.halves.forEach(([t0, t1], h) => {
        for (let j = 0; j < count; j++) {
          const k = h === 1 ? count - 1 - j : j;
          const s = cell.s0 + k * width;
          const strip = clipTo(rect(s, s + width, t0, t1), land);
          if (strip.p.length >= 3 && area2(strip.p) * 100 >= 90 * width * (t1 - t0))
            out.push({ id: `${cell.r},${cell.c},${h},${k}`, pts: [...strip.p], cell: index });
        }
      });
    });
    return out;
  };
  return { cells, rows: [rMin, rMax], cols: [cMin, cMax], slotsFor };
}

/** A neighbourhood's land split by its park line: the line, the park strip, and the land left for lots. */
function parkSplit(
  raw: Poly,
  parkDemand: number,
  remembered: GridRecord["park"],
): { line: GridRecord["park"]; strip: Poly | null; land: Pt[] } {
  if (parkDemand <= 0) return { line: null, strip: null, land: [...inset(raw, PAVEMENT).p] };
  // A strip of park along the far side, cut off by a footpath, sized to the park's demand within its cap.
  let line = remembered;
  if (!line) {
    const total2 = area2(raw.p);
    const n = perp(longestEdge(raw.p));
    const num = Math.min(2 * parkDemand * 1000, total2 * PARK_CAP);
    line = { n, c: -offsetFor(raw, negate(n), num, total2 * 1000) };
  }
  return {
    line,
    strip: inset(clip(raw, negate(line.n), -line.c, ROAD_WIDTH.lane), PAVEMENT),
    land: [...inset(clip(raw, line.n, line.c, ROAD_WIDTH.lane), PAVEMENT).p],
  };
}

function pushPark(ctx: Ctx, strip: Poly | null, district: string) {
  if (strip && strip.p.length >= 3) ctx.blocks.push({ pts: [...strip.p], district, kind: "park" });
}

/** A neighbourhood: one block grid holding all its lots, remembered between commits. */
export function neighbourhood(
  ctx: Ctx,
  raw: Poly,
  lots: readonly LotSeed[],
  parkDemand: number,
  key: string,
  district: string,
  form: FlatForm,
) {
  let grid: GridRecord | undefined = ctx.plat.grids[key];
  // A remembered park line is kept while it crosses the land; one that no longer does is laid afresh.
  const rememberedPark = grid?.park && chord(raw.p, grid.park.n, grid.park.c) ? grid.park : null;
  let split = parkSplit(raw, parkDemand, rememberedPark);
  let land = split.land;
  if (land.length < 3 || area2(land) < 2) {
    pushPark(ctx, split.strip, district);
    ctx.overflow += lots.length;
    if (lots.length > 0) emit(ctx, "town/overflow", { key, count: lots.length });
    return;
  }
  if (!grid) {
    grid = freshGrid(land);
    ctx.plat.grids[key] = grid;
  }
  grid.park = split.line;
  let g = grid;
  let laid = layGrid(g, land);
  if (g.span > 1 && laid.slotsFor(g.span).length < lots.length) {
    // The lots outgrew their slots at this class: narrow it until they fit, and re-lay them in order.
    const from = g.span;
    while (g.span > 1 && laid.slotsFor(g.span).length < lots.length) g.span--;
    emit(ctx, "plat/narrow", { key, from, to: g.span });
    g.slots = {};
  }
  if (rememberedPark && g.span > 0 && laid.slotsFor(g.span).length < lots.length) {
    // A park line laid on smaller land may hold most of the land it grew into: lay it afresh, with a fresh grid, when
    // that seats more lots.
    const fresh = parkSplit(raw, parkDemand, null);
    const freshGridRecord = fresh.land.length >= 3 ? { ...freshGrid(fresh.land), park: fresh.line } : null;
    if (freshGridRecord && layGrid(freshGridRecord, fresh.land).slotsFor(1).length > laid.slotsFor(g.span).length) {
      emit(ctx, "plat/repark", { key });
      split = fresh;
      land = fresh.land;
      g = freshGridRecord;
      ctx.plat.grids[key] = g;
      laid = layGrid(g, land);
    }
  }
  pushPark(ctx, split.strip, district);
  if (g.span > 0 && laid.slotsFor(g.span).length < lots.length) {
    // The cuts around it moved its land off the grid: lay the grid afresh when a fresh one seats more lots.
    const fresh = freshGrid(land);
    if (layGrid(fresh, land).slotsFor(1).length > laid.slotsFor(g.span).length) {
      emit(ctx, "plat/regrid", { key });
      g = { ...fresh, park: split.line };
      ctx.plat.grids[key] = g;
      laid = layGrid(g, land);
    }
  }
  const { cells, slotsFor } = laid;
  const [rMin, rMax] = laid.rows;
  const [cMin, cMax] = laid.cols;
  if (g.span === 0 && form === "street-village" && rMax > rMin) g.high = roundDiv(rMin + rMax + 1, 2);
  if (g.span === 0 && form === "hamlet") {
    // A hamlet gathers round a green: the full cell nearest the heart of its land, when the lots can spare it.
    const heart = centroid(land);
    const full = cells.filter((cell) => cell.halves.length > 0);
    const distance = (cell: Cell) => {
      const m = centroid(cell.pts);
      return (m.x - heart.x) ** 2 + (m.y - heart.y) ** 2;
    };
    const nearest = full.reduce<Cell | undefined>((a, b) => (a && distance(a) <= distance(b) ? a : b), undefined);
    if (nearest && full.length > 1) {
      g.green = cellId(nearest);
      if (slotsFor(1).length < lots.length) delete g.green;
    }
  }
  if (g.span === 0) {
    // First lay: one-module slots tell how many blocks the lots need; lots then widen to fill those blocks.
    const narrow = slotsFor(1);
    const lastCell = narrow[Math.max(1, lots.length) - 1]?.cell ?? narrow[narrow.length - 1]?.cell ?? -1;
    const modules = narrow.filter((s) => s.cell <= lastCell).length;
    g.span = Math.min(MAX_CLASS, Math.max(1, floorDiv(modules, Math.max(1, lots.length))));
    while (g.span > 1 && slotsFor(g.span).length < lots.length) g.span--;
  }
  for (let r = rMin + 1; r <= rMax; r++)
    road(
      ctx,
      chord(land, perp(g.dir), (g.b0 + r * g.rowPitch - U / 2) * DIRECTION),
      r === g.high ? "collector" : "street",
    );
  for (let c = cMin + 1; c <= cMax; c++)
    road(ctx, chord(land, g.dir, (g.a0 + c * g.colPitch - U / 2) * DIRECTION), "lane");
  const ordered = slotsFor(g.span);
  // A street village fills outward from its high street: the rows either side of it first.
  const high = g.high;
  const slots =
    high === undefined
      ? ordered
      : ordered
          .map((s, i) => {
            const r = cells[s.cell]!.r;
            return { s, i, d: r >= high ? r - high : high - 1 - r };
          })
          .toSorted((x, y) => x.d - y.d || x.i - y.i)
          .map((x) => x.s);
  const slotIndex = new Map(slots.map((s, i) => [s.id, i]));
  const live = new Set(lots.map((l) => l.key));
  // Renewal: when most remembered lots are vacant, the neighbourhood is re-laid in order.
  const remembered = Object.keys(g.slots);
  const vacant = remembered.filter((k) => !live.has(k)).length;
  if (remembered.length > 0 && vacant * 2 > remembered.length) {
    emit(ctx, "plat/renew", { key, vacant, remembered: remembered.length });
    g.slots = {};
  }
  const taken = new Map<number, string>();
  for (const [lotKey, id] of Object.entries(g.slots)) {
    const i = slotIndex.get(id);
    if (i !== undefined && !taken.has(i)) taken.set(i, lotKey);
    else delete g.slots[lotKey];
  }
  // Newcomers and displaced lots take the first free slot after their folder's last lot, else the first free one.
  const lastOfFolder = new Map<string, number>();
  for (const lot of lots) {
    const i = slotIndex.get(g.slots[lot.key] ?? "");
    if (i !== undefined) lastOfFolder.set(folderOf(lot.path), Math.max(lastOfFolder.get(folderOf(lot.path)) ?? -1, i));
  }
  const free = (from: number) => {
    let i = from;
    while (i < slots.length && taken.has(i)) i++;
    return i;
  };
  let placed = 0;
  for (const lot of lots) {
    if (g.slots[lot.key] === undefined) {
      let i = free((lastOfFolder.get(folderOf(lot.path)) ?? -1) + 1);
      if (i >= slots.length) i = free(0);
      if (i >= slots.length) continue;
      taken.set(i, lot.key);
      g.slots[lot.key] = slots[i]!.id;
      lastOfFolder.set(folderOf(lot.path), Math.max(lastOfFolder.get(folderOf(lot.path)) ?? -1, i));
    }
    const slot = slots[slotIndex.get(g.slots[lot.key]!)!]!;
    cells[slot.cell]!.used = true;
    ctx.plat.addresses[lot.key] ??= `${key}:${slot.id.replaceAll(",", ".")}`;
    ctx.lots.push({
      pts: slot.pts,
      key: lot.key,
      address: ctx.plat.addresses[lot.key]!,
      vacant: false,
      path: lot.path,
      use: lot.use,
      district,
    });
    ctx.lotArea2 += area2(slot.pts);
    placed++;
  }
  for (const [i, lotKey] of taken) {
    if (live.has(lotKey)) continue;
    const slot = slots[i]!;
    cells[slot.cell]!.used = true;
    ctx.lots.push({
      pts: slot.pts,
      key: lotKey,
      // A vacant lot was placed before, so its address was issued then.
      address: ctx.plat.addresses[lotKey]!,
      vacant: true,
      path: "",
      use: "source",
      district,
    });
  }
  for (const cell of cells)
    ctx.blocks.push({
      pts: cell.pts,
      district,
      kind: cellId(cell) === g.green ? "green" : cell.used ? "built" : "reserve",
    });
  if (lots.length > placed) {
    ctx.overflow += lots.length - placed;
    emit(ctx, "town/overflow", { key, count: lots.length - placed });
  }
}
