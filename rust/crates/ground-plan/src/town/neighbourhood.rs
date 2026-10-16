//! A neighbourhood: one block grid holding all of a flattened folder's lots, remembered between commits.
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;

use crate::archetype::Form;
use crate::city::BlockKind;
use crate::constants::{BLOCK_LONG, BLOCK_SHORT, MODULE, PAVEMENT, RoadClass, U};
use crate::fixed::{
    DIRECTION, Dir, Poly, Pt, Rounding, area2, centroid, chord, clip, extent, floor_div, inset, longest_edge, mul_div,
    negate, normalise, offset_for, perp, round_div,
};
use crate::land_use::LandUse;
use crate::plat::{GridRecord, ParkLine, Slots};
use crate::snapshot::folder_of;
use crate::town::context::{Ctx, DraftLot, tint, to_poly};
use crate::tree::LotSeed;

const MAX_CLASS: i64 = 4;
/// A park strip takes at most this share (‰) of its neighbourhood.
const PARK_CAP: i64 = 600;
/// Blocks at least this deep (row pitch less a street) hold lots back to back.
const HALF_DEPTH: i64 = 224;

#[derive(Debug)]
struct Cell {
    pts: Vec<Pt>,
    r: i64,
    c: i64,
    s0: i64,
    s1: i64,
    halves: Vec<(i64, i64)>,
}

impl Cell {
    fn id(&self) -> String {
        format!("{},{}", self.r, self.c)
    }
}

#[derive(Debug)]
struct Slot {
    id: String,
    pts: Vec<Pt>,
    cell: usize,
}

fn ceil_div(a: i64, b: i64) -> i64 {
    -floor_div(-a, b)
}

/// The kept-side lines of a convex land polygon's edges.
fn lines_of(land: &[Pt]) -> Vec<(Dir, i64)> {
    (0..land.len())
        .map(|i| {
            let p = land[i];
            // Land comes from inset, which never repeats a point.
            let q = land[(i + 1) % land.len()];
            let n = normalise(q.y - p.y, p.x - q.x);
            (n, n[0] * p.x + n[1] * p.y)
        })
        .collect()
}

/// Clips a polygon to a convex land polygon, given its edges' lines.
fn clip_to(poly: Poly, lines: &[(Dir, i64)]) -> Poly {
    let mut out = poly;
    for &(n, c) in lines {
        if out.p.len() < 3 {
            break;
        }
        out = clip(&out, n, c, 0);
    }
    out
}

/// A fresh grid, aligned with the land's main frontage and fitted to it.
fn fresh_grid(land: &[Pt]) -> GridRecord {
    let a = longest_edge(land);
    let b = perp(a);
    let (ea0, ea1) = extent(land, a);
    let (eb0, eb1) = extent(land, b);
    let a0 = floor_div(ea0, DIRECTION);
    let b0 = floor_div(eb0, DIRECTION);
    let along = ceil_div(ea1, DIRECTION) - a0;
    let across = ceil_div(eb1, DIRECTION) - b0;
    let rows = round_div(across + U, BLOCK_SHORT + U).max(1);
    let cols = round_div(along + U, BLOCK_LONG + U).max(1);
    GridRecord {
        a0,
        b0,
        col_pitch: floor_div(along + U, cols),
        dir: a,
        green: None,
        high: None,
        park: None,
        row_pitch: floor_div(across + U, rows),
        slots: Slots::new(),
        span: 0,
    }
}

/// A grid laid on some land: its cells in serpentine order, its row and column range, and its slots at any lot class.
/// Slots remembered per lot class and green cell.
type SlotMemo = RefCell<HashMap<(i64, Option<String>), Rc<Vec<Slot>>>>;

#[derive(Debug)]
pub struct Laid {
    a: Dir,
    b: Dir,
    lines: Vec<(Dir, i64)>,
    cells: Vec<Cell>,
    rows: (i64, i64),
    cols: (i64, i64),
    slots: SlotMemo,
}

impl Laid {
    fn world(&self, s: i64, t: i64) -> Pt {
        let (a, b) = (self.a, self.b);
        Pt::new(
            mul_div(a[0], s, DIRECTION, Rounding::Round) + mul_div(b[0], t, DIRECTION, Rounding::Round),
            mul_div(a[1], s, DIRECTION, Rounding::Round) + mul_div(b[1], t, DIRECTION, Rounding::Round),
        )
    }

    fn rect(&self, s0: i64, s1: i64, t0: i64, t1: i64) -> Poly {
        to_poly(
            &[
                self.world(s0, t0),
                self.world(s1, t0),
                self.world(s1, t1),
                self.world(s0, t1),
            ],
            0,
        )
    }

    /// The cells a grid gives on today's land. Pure.
    fn new(g: &GridRecord, land: &[Pt]) -> Self {
        let a = g.dir;
        let mut laid = Self {
            a,
            b: perp(a),
            lines: lines_of(land),
            cells: Vec::new(),
            rows: (0, 0),
            cols: (0, 0),
            slots: RefCell::new(HashMap::new()),
        };
        // The grid stays anchored at its remembered origin and pitch; today's land decides which cells exist.
        let (e0, e1) = extent(land, a);
        let (f0, f1) = extent(land, laid.b);
        let r_min = floor_div(floor_div(f0, DIRECTION) - g.b0 + U, g.row_pitch);
        let r_max = ceil_div(ceil_div(f1, DIRECTION) - g.b0, g.row_pitch) - 1;
        let c_min = floor_div(floor_div(e0, DIRECTION) - g.a0 + U, g.col_pitch);
        let c_max = ceil_div(ceil_div(e1, DIRECTION) - g.a0, g.col_pitch) - 1;
        let back_to_back = g.row_pitch - U >= HALF_DEPTH;
        for r in r_min..=r_max {
            let even = r.rem_euclid(2) == 0;
            for cc in c_min..=c_max {
                let c = if even { cc } else { c_max - (cc - c_min) };
                let s0 = g.a0 + c * g.col_pitch;
                let s1 = s0 + g.col_pitch - U;
                let t0 = g.b0 + r * g.row_pitch;
                let t1 = t0 + g.row_pitch - U;
                let block = clip_to(laid.rect(s0, s1, t0, t1), &laid.lines);
                if block.p.len() < 3 {
                    continue;
                }
                let mid = floor_div(t0 + t1, 2);
                let full = area2(&block.p) * 10 >= 4 * (s1 - s0) * (t1 - t0);
                let halves = if !full {
                    vec![]
                } else if back_to_back {
                    vec![(t0, mid), (mid, t1)]
                } else {
                    vec![(t0, t1)]
                };
                laid.cells.push(Cell {
                    pts: block.p,
                    r,
                    c,
                    s0,
                    s1,
                    halves,
                });
            }
        }
        laid.rows = (r_min, r_max);
        laid.cols = (c_min, c_max);
        laid
    }

    /// The slots at a lot class, skipping the green cell. Pure, so remembered per class and green.
    fn slots_for(&self, span: i64, green: Option<&str>) -> Rc<Vec<Slot>> {
        let key = (span, green.map(str::to_owned));
        if let Some(known) = self.slots.borrow().get(&key) {
            return known.clone();
        }
        let mut out = Vec::new();
        let width = MODULE * span;
        for (index, cell) in self.cells.iter().enumerate() {
            if green.is_some_and(|g| cell.id() == g) {
                continue;
            }
            let count = floor_div(cell.s1 - cell.s0, width);
            for (h, &(t0, t1)) in cell.halves.iter().enumerate() {
                for j in 0..count {
                    let k = if h == 1 { count - 1 - j } else { j };
                    let s = cell.s0 + k * width;
                    let strip = clip_to(self.rect(s, s + width, t0, t1), &self.lines);
                    if strip.p.len() >= 3 && area2(&strip.p) * 100 >= 90 * width * (t1 - t0) {
                        out.push(Slot {
                            id: format!("{},{},{h},{k}", cell.r, cell.c),
                            pts: strip.p,
                            cell: index,
                        });
                    }
                }
            }
        }
        let out = Rc::new(out);
        self.slots.borrow_mut().insert(key, out.clone());
        out
    }

    fn count(&self, span: i64, green: Option<&str>) -> usize {
        self.slots_for(span, green).len()
    }
}

/// A neighbourhood's last grid and the land it was laid on: laying the same grid on the same land gives the same cells and
/// slots, so they are kept between commits.
#[derive(Debug)]
pub struct KeptGrid {
    geometry: (Dir, i64, i64, i64, i64),
    land: Vec<Pt>,
    laid: Laid,
}

fn geometry(g: &GridRecord) -> (Dir, i64, i64, i64, i64) {
    (g.dir, g.a0, g.b0, g.row_pitch, g.col_pitch)
}

/// The grid laid on the land, as kept from the last commit when neither changed.
fn kept_or_new(ctx: &mut Ctx, key: &str, g: &GridRecord, land: &[Pt]) -> Laid {
    if let Some(cache) = ctx.cache.as_deref_mut()
        && let Some(kept) = cache.grids.remove(key)
        && kept.geometry == geometry(g)
        && kept.land == land
    {
        return kept.laid;
    }
    Laid::new(g, land)
}

/// True for land too small to lay anything on.
fn empty(pts: &[Pt]) -> bool {
    pts.len() < 3 || area2(pts) < 2
}

/// A neighbourhood's land split by its park line: the line, the park strip, and the land left for lots.
struct ParkSplit {
    line: Option<ParkLine>,
    strip: Option<Poly>,
    land: Vec<Pt>,
}

fn park_split(raw: &Poly, park_demand: i64, remembered: Option<ParkLine>) -> ParkSplit {
    if park_demand <= 0 {
        return ParkSplit {
            line: None,
            strip: None,
            land: inset(raw, PAVEMENT).p,
        };
    }
    // A strip of park along the far side, cut off by a footpath, sized to the park's demand within its cap.
    let line = remembered.unwrap_or_else(|| {
        let total2 = area2(&raw.p);
        let n = perp(longest_edge(&raw.p));
        let num = (2 * park_demand * 1000).min(total2 * PARK_CAP);
        ParkLine {
            n,
            c: -offset_for(raw, negate(n), num, total2 * 1000),
        }
    });
    let lane = RoadClass::Lane.width();
    ParkSplit {
        line: Some(line),
        strip: Some(inset(&clip(raw, negate(line.n), -line.c, lane), PAVEMENT)),
        land: inset(&clip(raw, line.n, line.c, lane), PAVEMENT).p,
    }
}

fn push_park(ctx: &mut Ctx, strip: Option<&Poly>, district: &str) {
    if let Some(strip) = strip
        && strip.p.len() >= 3
    {
        ctx.block(strip.p.clone(), district, BlockKind::Park);
    }
}

fn count_of(n: usize) -> i64 {
    i64::try_from(n).expect("small")
}

/// A neighbourhood: one block grid holding all its lots, remembered between commits.
#[allow(clippy::too_many_lines)]
pub fn neighbourhood(
    ctx: &mut Ctx,
    raw: &Poly,
    lots: &[LotSeed],
    park_demand: i64,
    key: &str,
    district: &str,
    form: Form,
) {
    let remembered_grid = ctx.plat.grids.remove(key);
    // A remembered park line is kept while it crosses the land; one that no longer does is laid afresh.
    let remembered_park = remembered_grid
        .as_ref()
        .and_then(|g| g.park)
        .filter(|park| chord(&raw.p, park.n, park.c).is_some());
    let mut split = park_split(raw, park_demand, remembered_park);
    if remembered_park.is_some() && empty(&split.land) {
        // The land moved under a remembered park line until the line leaves the lots nothing: lay it afresh.
        let fresh = park_split(raw, park_demand, None);
        if !empty(&fresh.land) {
            ctx.emit("plat/repark", vec![("key", key.into())]);
            split = fresh;
        }
    }
    let mut land = split.land.clone();
    let lot_count = lots.len();
    if empty(&land) {
        if let Some(grid) = remembered_grid {
            ctx.plat.grids.insert(key.to_owned(), grid);
        }
        push_park(ctx, split.strip.as_ref(), district);
        ctx.overflow += count_of(lot_count);
        if lot_count > 0 {
            ctx.emit(
                "town/overflow",
                vec![("key", key.into()), ("count", count_of(lot_count).into())],
            );
        }
        return;
    }
    let mut g = remembered_grid.unwrap_or_else(|| fresh_grid(&land));
    g.park = split.line;
    let mut laid = kept_or_new(ctx, key, &g, &land);
    if g.span > 1 && laid.count(g.span, g.green.as_deref()) < lot_count {
        // The lots outgrew their slots at this class: narrow it until they fit, and re-lay them in order.
        let from = g.span;
        while g.span > 1 && laid.count(g.span, g.green.as_deref()) < lot_count {
            g.span -= 1;
        }
        ctx.emit(
            "plat/narrow",
            vec![("key", key.into()), ("from", from.into()), ("to", g.span.into())],
        );
        g.slots = Slots::new();
    }
    if remembered_park.is_some() && g.span > 0 && laid.count(g.span, g.green.as_deref()) < lot_count {
        // A park line laid on smaller land may hold most of the land it grew into: lay it afresh, with a fresh grid,
        // when that seats more lots.
        let fresh = park_split(raw, park_demand, None);
        if fresh.land.len() >= 3 {
            let fresh_grid_record = GridRecord {
                park: fresh.line,
                ..fresh_grid(&fresh.land)
            };
            let seats = Laid::new(&fresh_grid_record, &fresh.land).count(1, None);
            if seats > laid.count(g.span, g.green.as_deref()) {
                ctx.emit("plat/repark", vec![("key", key.into())]);
                land.clone_from(&fresh.land);
                split = fresh;
                g = fresh_grid_record;
                laid = Laid::new(&g, &land);
            }
        }
    }
    push_park(ctx, split.strip.as_ref(), district);
    if g.span > 0 && laid.count(g.span, g.green.as_deref()) < lot_count {
        // The cuts around it moved its land off the grid: lay the grid afresh when a fresh one seats more lots.
        let fresh = fresh_grid(&land);
        if Laid::new(&fresh, &land).count(1, None) > laid.count(g.span, g.green.as_deref()) {
            ctx.emit("plat/regrid", vec![("key", key.into())]);
            g = GridRecord {
                park: split.line,
                ..fresh
            };
            laid = Laid::new(&g, &land);
        }
    }
    let (r_min, r_max) = laid.rows;
    let (c_min, c_max) = laid.cols;
    if g.span == 0 && form == Form::StreetVillage && r_max > r_min {
        g.high = Some(round_div(r_min + r_max + 1, 2));
    }
    if g.span == 0 && form == Form::Hamlet {
        // A hamlet gathers round a green: the full cell nearest the heart of its land, when the lots can spare it.
        let heart = centroid(&land);
        let full: Vec<&Cell> = laid.cells.iter().filter(|cell| !cell.halves.is_empty()).collect();
        let distance = |cell: &Cell| {
            let m = centroid(&cell.pts);
            (m.x - heart.x).pow(2) + (m.y - heart.y).pow(2)
        };
        let nearest = full.iter().fold(None::<&Cell>, |a, b| match a {
            Some(a) if distance(a) <= distance(b) => Some(a),
            _ => Some(b),
        });
        if let Some(nearest) = nearest
            && full.len() > 1
        {
            g.green = Some(nearest.id());
            if laid.count(1, g.green.as_deref()) < lot_count {
                g.green = None;
            }
        }
    }
    if g.span == 0 {
        // First lay: one-module slots tell how many blocks the lots need; lots then widen to fill those blocks.
        let narrow = laid.slots_for(1, g.green.as_deref());
        let last_cell = narrow
            .get(lot_count.max(1) - 1)
            .or_else(|| narrow.last())
            .map_or(-1, |s| count_of(s.cell));
        let modules = count_of(narrow.iter().filter(|s| count_of(s.cell) <= last_cell).count());
        g.span = floor_div(modules, count_of(lot_count.max(1))).clamp(1, MAX_CLASS);
        while g.span > 1 && laid.count(g.span, g.green.as_deref()) < lot_count {
            g.span -= 1;
        }
    }
    for r in r_min + 1..=r_max {
        let c = (g.b0 + r * g.row_pitch - U / 2) * DIRECTION;
        let cls = if g.high == Some(r) {
            RoadClass::Collector
        } else {
            RoadClass::Street
        };
        ctx.road(chord(&land, perp(g.dir), c).map(Vec::from), cls, None);
    }
    for col in c_min + 1..=c_max {
        let c = (g.a0 + col * g.col_pitch - U / 2) * DIRECTION;
        ctx.road(chord(&land, g.dir, c).map(Vec::from), RoadClass::Lane, None);
    }
    let ordered = laid.slots_for(g.span, g.green.as_deref());
    // A street village fills outward from its high street: the rows either side of it first.
    let mut slots: Vec<&Slot> = ordered.iter().collect();
    if let Some(high) = g.high {
        let d = |s: &Slot| {
            let r = laid.cells[s.cell].r;
            if r >= high { r - high } else { high - 1 - r }
        };
        slots.sort_by_key(|s| d(s));
    }
    let slot_index: HashMap<&str, usize> = slots.iter().enumerate().map(|(i, s)| (s.id.as_str(), i)).collect();
    let live: std::collections::HashSet<&str> = lots.iter().map(|l| &*l.key).collect();
    // Renewal: when most remembered lots are vacant, the neighbourhood is re-laid in order.
    let remembered = g.slots.len();
    let vacant = g.slots.keys().filter(|k| !live.contains(&***k)).count();
    if remembered > 0 && vacant * 2 > remembered {
        ctx.emit(
            "plat/renew",
            vec![
                ("key", key.into()),
                ("vacant", count_of(vacant).into()),
                ("remembered", count_of(remembered).into()),
            ],
        );
        g.slots = Slots::new();
    }
    // Slot index to lot key, and the order the slots were taken in.
    let mut taken: Vec<Option<Arc<str>>> = vec![None; slots.len()];
    let mut taken_order: Vec<usize> = Vec::new();
    g.slots.retain(|lot_key, id| match slot_index.get(id.as_str()) {
        Some(&i) if taken[i].is_none() => {
            taken[i] = Some(lot_key.clone());
            taken_order.push(i);
            true
        }
        _ => false,
    });
    // Newcomers and displaced lots take the first free slot after their folder's last lot, else the first free one.
    let mut last_of_folder: HashMap<&str, i64> = HashMap::new();
    for lot in lots {
        if let Some(&i) = g.slots.get(&lot.key).and_then(|id| slot_index.get(id.as_str())) {
            let entry = last_of_folder.entry(folder_of(&lot.path)).or_insert(-1);
            *entry = (*entry).max(count_of(i));
        }
    }
    let free = |taken: &[Option<Arc<str>>], from: usize| {
        let mut i = from;
        while i < taken.len() && taken[i].is_some() {
            i += 1;
        }
        i
    };
    let mut placed = 0;
    let mut used = vec![false; laid.cells.len()];
    for lot in lots {
        if !g.slots.contains_key(&lot.key) {
            let folder = folder_of(&lot.path);
            let after = usize::try_from(last_of_folder.get(folder).copied().unwrap_or(-1) + 1).expect("not negative");
            let mut i = free(&taken, after);
            if i >= slots.len() {
                i = free(&taken, 0);
            }
            if i >= slots.len() {
                continue;
            }
            taken[i] = Some(lot.key.clone());
            taken_order.push(i);
            g.slots.insert(lot.key.clone(), slots[i].id.clone());
            let entry = last_of_folder.entry(folder).or_insert(-1);
            *entry = (*entry).max(count_of(i));
        }
        let slot = slots[slot_index[g.slots[&lot.key].as_str()]];
        used[slot.cell] = true;
        let address = ctx
            .plat
            .addresses
            .entry(lot.key.to_string())
            .or_insert_with(|| format!("{key}:{}", slot.id.replace(',', ".")));
        ctx.lots.push(DraftLot {
            pts: slot.pts.clone(),
            key: lot.key.clone(),
            address: address.clone(),
            vacant: false,
            path: lot.path.clone(),
            land_use: lot.land_use,
            district: tint(district),
            form: None,
        });
        ctx.lot_area2 += area2(&slot.pts);
        placed += 1;
    }
    for &i in &taken_order {
        let lot_key = taken[i].as_ref().expect("a taken slot holds its lot");
        if live.contains(&**lot_key) {
            continue;
        }
        let slot = slots[i];
        used[slot.cell] = true;
        // A vacant lot was placed before, so its address was issued then.
        let address = ctx.plat.addresses.get(&**lot_key).cloned().unwrap_or_default();
        ctx.lots.push(DraftLot {
            pts: slot.pts.clone(),
            key: lot_key.clone(),
            address,
            vacant: true,
            path: "".into(),
            land_use: LandUse::Source,
            district: tint(district),
            form: None,
        });
    }
    for (cell, &used) in laid.cells.iter().zip(&used) {
        let kind = if g.green.as_deref() == Some(cell.id().as_str()) {
            BlockKind::Green
        } else if used {
            BlockKind::Built
        } else {
            BlockKind::Reserve
        };
        ctx.block(cell.pts.clone(), district, kind);
    }
    if lot_count > placed {
        let overflow = count_of(lot_count - placed);
        ctx.overflow += overflow;
        ctx.emit("town/overflow", vec![("key", key.into()), ("count", overflow.into())]);
    }
    if let Some(cache) = ctx.cache.as_deref_mut() {
        cache.grids.insert(
            key.to_owned(),
            KeptGrid {
                geometry: geometry(&g),
                land,
                laid,
            },
        );
    }
    ctx.plat.grids.insert(key.to_owned(), g);
}
