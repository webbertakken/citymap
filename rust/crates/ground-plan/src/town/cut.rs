//! Cuts: the remembered binary decisions that divide a folder's land, the roads they draw, and pinwheels.
use crate::city::{BlockKind, District};
use crate::constants::{GROWTH_PCT, RoadClass, U};
use crate::fixed::{
    DIRECTION, Dir, Poly, Pt, Rounding, area2, chord, clip, extent, floor_div, inset, isqrt, longest_edge, mul_div,
    negate, offset_for, perp, rotate, round_div, unit_mille,
};
use crate::plat::CutRecord;
use crate::roads::{cut_class, reclass, reserve_for};
use crate::town::context::{Ctx, Item, ItemKind, demand_of, mass_of, seed_key};
use crate::town::neighbourhood::neighbourhood;
use crate::town::partition::partition;

/// The largest tilt of a fresh cut, in angle steps (0.175 rad).
const TILT: i64 = 114;
/// A cut at least this share (‰) of its town's diameter long is a long cut, and jogs when it can.
const LONG_CUT_MILLE: i64 = 300;
const JOG: i64 = 3 * U;
const MIN_JOG: i64 = 2 * U;
pub const PAVEMENT_INSET: i64 = 12;

fn grow(demand: i64) -> i64 {
    round_div(demand * GROWTH_PCT, 100)
}

/// Each side's land as laid: its part of the land, less its half of the road's right of way.
fn sides(poly: &Poly, r: &CutRecord) -> (i128, i128) {
    let width = r.right_of_way().width();
    let left = i128::from(area2(&clip(poly, r.n, r.c, width).p));
    let right = i128::from(area2(&clip(poly, negate(r.n), -r.c, width).p));
    (left, right)
}

/// True when the land a remembered line leaves one side has fallen below its share of the demand, shrunk by the band.
fn starved(poly: &Poly, r: &CutRecord, dl: i64, dr: i64) -> bool {
    let (left, right) = sides(poly, r);
    let total = left + right;
    let demand = i128::from(dl + dr);
    let band = i128::from(GROWTH_PCT);
    let short = |land: i128, own: i64| land * demand * band < i128::from(own) * total * 100;
    short(left, dl) || short(right, dr)
}

/// A folder's land (doubled) and demand, as its top cut found them: what every cut below is measured against.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Share {
    pub land2: i64,
    pub demand: i64,
}

/// True when a side's land, after its half of the right of way, is short of its share of the folder's land by more
/// than the band.
fn below_share(poly: &Poly, r: &CutRecord, dl: i64, dr: i64, share: Share) -> bool {
    let (left, right) = sides(poly, r);
    let (land, demand, band) = (
        i128::from(share.land2),
        i128::from(share.demand),
        i128::from(GROWTH_PCT),
    );
    let short = |side: i128, own: i64| side * demand * band < i128::from(own) * land * 100;
    short(left, dl) || short(right, dr)
}

/// The road a cut draws: its class, no wider than its right of way.
#[must_use]
pub fn carriageway(rec: &CutRecord) -> (RoadClass, Option<i64>) {
    let room = rec.right_of_way().width();
    if rec.cls.width() > room {
        (rec.cls, Some(room))
    } else {
        (rec.cls, None)
    }
}

const fn is_major(cls: RoadClass) -> bool {
    !matches!(cls, RoadClass::Street | RoadClass::Lane)
}

pub fn park(ctx: &mut Ctx, poly: &Poly, district: &str) {
    let p = inset(poly, PAVEMENT_INSET);
    if p.p.len() >= 3 {
        ctx.block(p.p, district, BlockKind::Park);
    }
}

pub fn reserve(ctx: &mut Ctx, poly: &Poly, district: &str) {
    let p = inset(poly, PAVEMENT_INSET);
    if p.p.len() >= 3 {
        ctx.block(p.p, district, BlockKind::Reserve);
    }
}

/// Lays one item on its land.
pub fn place<'t>(ctx: &mut Ctx<'t, '_>, poly: &Poly, item: &Item<'t>, district: &str) {
    match &item.kind {
        ItemKind::Folder(node) => partition(ctx, node, poly, district),
        ItemKind::Lots { lots, district } => {
            neighbourhood(
                ctx,
                poly,
                lots,
                0,
                &item.key,
                district,
                crate::archetype::Form::Neighbourhood,
            );
        }
        ItemKind::Park { district } => park(ctx, poly, district),
    }
}

/// The heaviest folder of some items: the first of the heaviest.
fn heaviest_folder<'a, 't>(items: &'a [Item<'t>]) -> Option<&'a Item<'t>> {
    items
        .iter()
        .filter(|i| matches!(i.kind, ItemKind::Folder(_)))
        .fold(None, |a, b| match a {
            Some(a) if a.mass_mille >= b.mass_mille => Some(a),
            _ => Some(b),
        })
}

/// Land bounded by collectors or bigger roads: each side with two or more items records a ward.
fn wards(ctx: &mut Ctx, poly: &Poly, rec: &CutRecord, left: &[Item], right: &[Item], key: &str) {
    let sides = [
        (clip(poly, rec.n, rec.c, 0), left),
        (clip(poly, negate(rec.n), -rec.c, 0), right),
    ];
    for (side, part) in sides {
        if let Some(heaviest) = heaviest_folder(part)
            && part.len() > 1
            && let ItemKind::Folder(node) = heaviest.kind
        {
            ctx.districts.push(District {
                pts: side.p,
                path: format!("{key}#ward"),
                name: node.name.clone(),
                depth: node.depth,
                mass_mille: mass_of(part),
                form: None,
                ward: true,
            });
        }
    }
}

/// A remembered decision: which items go to which side of which line.
pub struct Decision<'t> {
    pub rec: CutRecord,
    pub left: Vec<Item<'t>>,
    pub right: Vec<Item<'t>>,
}

/// A fresh cut's normal: across the land's longer extent, tilted by its seed.
fn fresh_normal(poly: &Poly, key: &str) -> Dir {
    let edge = longest_edge(&poly.p);
    let (a0, a1) = extent(&poly.p, edge);
    let (b0, b1) = extent(&poly.p, perp(edge));
    let base = if a1 - a0 >= b1 - b0 { edge } else { perp(edge) };
    rotate(
        base,
        round_div((unit_mille(&format!("{}#tilt", seed_key(key))) - 500) * TILT, 500),
    )
}

fn keys(items: &[Item]) -> Vec<String> {
    items.iter().map(|i| i.key.to_string()).collect()
}

/// The remembered binary decision at a key. A forced normal replaces the fresh rule; `assign` fixes the sides (a
/// twin's banks). None when one item is left and nothing is remembered.
#[allow(clippy::too_many_arguments)]
pub fn decide<'t>(
    ctx: &mut Ctx<'t, '_>,
    items: &[Item<'t>],
    poly: &Poly,
    mass_mille: i64,
    first: bool,
    key: &str,
    forced: Option<Dir>,
    assign: Option<(&[Item<'t>], &[Item<'t>])>,
    share: Option<Share>,
) -> Option<Decision<'t>> {
    let mut rec = ctx.plat.cuts.get(key).cloned();
    if let Some(known) = &rec {
        let in_rec = |i: &Item| known.left.iter().any(|k| **k == *i.key) || known.right.iter().any(|k| **k == *i.key);
        if chord(&poly.p, known.n, known.c).is_none() || !items.iter().any(in_rec) {
            ctx.forget(key);
            rec = None;
        }
    }
    let r = if let Some(mut r) = rec {
        // A road follows its land's tier, within the band; a river stays a river.
        let cls = if r.river {
            r.cls
        } else {
            reclass(r.cls, mass_mille, first)
        };
        if cls != r.cls {
            ctx.emit(
                "plat/reclass",
                vec![
                    ("key", key.into()),
                    ("from", r.cls.as_str().into()),
                    ("to", cls.as_str().into()),
                ],
            );
            r.cls = cls;
        }
        let side_of = |r: &CutRecord, i: &Item| {
            if r.left.iter().any(|k| **k == *i.key) {
                Some(true)
            } else if r.right.iter().any(|k| **k == *i.key) {
                Some(false)
            } else {
                None
            }
        };
        let demand_on = |r: &CutRecord, left: bool| -> i64 {
            items
                .iter()
                .filter(|i| side_of(r, i) == Some(left))
                .map(|i| i.demand)
                .sum()
        };
        let newcomers: Vec<&Item> = items.iter().filter(|i| side_of(&r, i).is_none()).collect();
        for item in newcomers {
            if r.cap_left - demand_on(&r, true) >= r.cap_right - demand_on(&r, false) {
                r.left.push(item.key.to_string());
            } else {
                r.right.push(item.key.to_string());
            }
        }
        let dl = demand_on(&r, true);
        let dr = demand_on(&r, false);
        let outgrown = dl > r.cap_left || dr > r.cap_right;
        let both = dl > 0 && dr > 0;
        // Short of its share of the folder's land, a side recuts where today's split would move the line.
        let short = both
            && share.is_some_and(|s| below_share(poly, &r, dl, dr, s))
            && offset_for(poly, r.n, dl, dl + dr) != r.c;
        if outgrown || (both && (starved(poly, &r, dl, dr) || short)) {
            if dl > 0 && dr > 0 {
                ctx.emit(
                    "plat/recut",
                    vec![
                        ("key", key.into()),
                        ("reason", if outgrown { "outgrown" } else { "starved" }.into()),
                        ("demandLeft", dl.into()),
                        ("demandRight", dr.into()),
                        ("capLeft", r.cap_left.into()),
                        ("capRight", r.cap_right.into()),
                    ],
                );
                r.c = offset_for(poly, r.n, dl, dl + dr);
                // Laid again: the road takes its class's width, and room for the land at the top of its new band.
                r.row = Some(if r.river { r.cls } else { reserve_for(mass_mille, first) });
                r.cap_left = grow(dl);
                r.cap_right = grow(dr);
            } else {
                // One side is empty: the growing side may take its land without moving anything.
                r.cap_left = r.cap_left.max(grow(dl));
                r.cap_right = r.cap_right.max(grow(dr));
            }
        }
        r
    } else {
        if items.len() == 1 {
            return None;
        }
        let total = demand_of(items);
        let (mut k, mut best, mut acc) = (1, i64::MAX, 0);
        for i in 1..items.len() {
            acc += items[i - 1].demand;
            let d = (2 * acc - total).abs();
            if d < best {
                best = d;
                k = i;
            }
        }
        let (left, right) = assign.unwrap_or((&items[..k], &items[k..]));
        let n = forced.unwrap_or_else(|| fresh_normal(poly, key));
        CutRecord {
            n,
            c: offset_for(poly, n, demand_of(left), total),
            cls: cut_class(mass_mille, first),
            row: Some(if assign.is_some() {
                cut_class(mass_mille, first)
            } else {
                reserve_for(mass_mille, first)
            }),
            left: keys(left),
            right: keys(right),
            cap_left: grow(demand_of(left)),
            cap_right: grow(demand_of(right)),
            river: assign.is_some(),
        }
    };
    ctx.plat.cuts.insert(key.to_owned(), r.clone());
    let left = items
        .iter()
        .filter(|i| r.left.iter().any(|k| **k == *i.key))
        .cloned()
        .collect();
    let right = items
        .iter()
        .filter(|i| r.right.iter().any(|k| **k == *i.key))
        .cloned()
        .collect();
    Some(Decision { rec: r, left, right })
}

/// Cuts the land between ordered items, recursively; every cut is a road.
#[allow(clippy::too_many_arguments)]
pub fn split<'t>(
    ctx: &mut Ctx<'t, '_>,
    items: &[Item<'t>],
    poly: &Poly,
    mass_mille: i64,
    first: bool,
    key: &str,
    district: &str,
    fair: Option<Share>,
) {
    // A folder's top cut sets the share every cut below it is measured against.
    let share = match fair {
        Some(fair) if !first => fair,
        _ => Share {
            land2: area2(&poly.p),
            demand: demand_of(items),
        },
    };
    let Some(decision) = decide(ctx, items, poly, mass_mille, first, key, None, None, Some(share)) else {
        place(ctx, poly, &items[0], district);
        return;
    };
    if pinwheel(ctx, &decision, poly, key, district, share) {
        return;
    }
    let Decision { rec: r, left, right } = decision;
    let major = is_major(r.cls);
    let sub_district = |sub: &str| if major { seed_key(sub) } else { district.to_owned() };
    if left.is_empty() || right.is_empty() {
        // A side left empty lends its land: the other side extends over the whole of it under its own key.
        let (part, sub) = if left.is_empty() {
            (right, format!("{key}>R"))
        } else {
            (left, format!("{key}>L"))
        };
        split(
            ctx,
            &part,
            poly,
            mass_of(&part),
            false,
            &sub,
            &sub_district(&sub),
            Some(share),
        );
        return;
    }
    let (cls, width) = carriageway(&r);
    ctx.road(chord(&poly.p, r.n, r.c).map(Vec::from), cls, width);
    if major {
        wards(ctx, poly, &r, &left, &right, key);
    }
    let w = r.right_of_way().width();
    let (key_l, key_r) = (format!("{key}>L"), format!("{key}>R"));
    split(
        ctx,
        &left,
        &clip(poly, r.n, r.c, w),
        mass_of(&left),
        false,
        &key_l,
        &sub_district(&key_l),
        Some(share),
    );
    split(
        ctx,
        &right,
        &clip(poly, negate(r.n), -r.c, w),
        mass_of(&right),
        false,
        &key_r,
        &sub_district(&key_r),
        Some(share),
    );
}

/// The part of a segment whose coordinate along m lies within [lo, hi] (open bounds are None).
#[must_use]
pub fn trim(seg: Option<[Pt; 2]>, m: Dir, lo: Option<i64>, hi: Option<i64>) -> Option<Vec<Pt>> {
    let [a, b] = seg?;
    let v0 = m[0] * a.x + m[1] * a.y;
    let v1 = m[0] * b.x + m[1] * b.y;
    if v0 == v1 {
        let inside = lo.is_none_or(|lo| v0 >= lo) && hi.is_none_or(|hi| v0 <= hi);
        return inside.then(|| vec![a, b]);
    }
    // Positions along the segment as fractions (v − v0) / (v1 − v0), clamped to [0, 1].
    let den = (v1 - v0).abs();
    let sign = (v1 - v0).signum();
    let at = |v: Option<i64>, open: i64| v.map_or(open, |v| ((v - v0) * sign).clamp(0, den));
    let from = at(lo, if v1 > v0 { 0 } else { den });
    let to = at(hi, if v1 > v0 { den } else { 0 });
    let (u0, u1) = (from.min(to), from.max(to));
    if u1 <= u0 {
        return None;
    }
    let point = |u: i64| {
        Pt::new(
            a.x + mul_div(b.x - a.x, u, den, Rounding::Round),
            a.y + mul_div(b.y - a.y, u, den, Rounding::Round),
        )
    };
    Some(vec![point(u0), point(u1)])
}

/// The town's diameter: that of a circle of its land.
#[must_use]
pub fn diameter_of(land_area2: i64) -> i64 {
    2 * isqrt(floor_div(land_area2 * 113, 2 * 355))
}

/// A long cut whose sides each split again becomes a pinwheel: both cross cuts square to it, the cut stepping sideways
/// between them, four roads ending in T-junctions round a plaza. Every piece is the land within two half-planes.
fn pinwheel<'t>(
    ctx: &mut Ctx<'t, '_>,
    decision: &Decision<'t>,
    poly: &Poly,
    key: &str,
    district: &str,
    share: Share,
) -> bool {
    let Decision { rec: r, left, right } = decision;
    let root_path = ctx.root.path.clone();
    if ctx.options.jog == crate::town::context::Jog::Off || left.len() < 2 || right.len() < 2 {
        return false;
    }
    if ctx.options.jog == crate::town::context::Jog::TopLevel
        && !(key == &*root_path || (key.starts_with(&*root_path) && key[root_path.len()..].starts_with('>')))
    {
        return false;
    }
    // decide keeps only cuts that cross their land, so the chord exists.
    let [s0, s1] = chord(&poly.p, r.n, r.c).expect("a remembered cut crosses its land");
    let length = isqrt((s1.x - s0.x).pow(2) + (s1.y - s0.y).pow(2));
    if length * 1000 < LONG_CUT_MILLE * diameter_of(ctx.land_area2) {
        return false;
    }
    let m = perp(r.n);
    // Both sides hold two or more items, so both decide a cut.
    let left_land = clip(poly, r.n, r.c, 0);
    let below = decide(
        ctx,
        left,
        &left_land,
        mass_of(left),
        false,
        &format!("{key}>L"),
        Some(m),
        None,
        Some(share),
    )
    .expect("two or more items decide a cut");
    let right_land = clip(poly, negate(r.n), -r.c, 0);
    let above = decide(
        ctx,
        right,
        &right_land,
        mass_of(right),
        false,
        &format!("{key}>R"),
        Some(m),
        None,
        Some(share),
    )
    .expect("two or more items decide a cut");
    // Square to the main cut: parallel to m within 0.01 % (table directions are not exactly DIRECTION long).
    let square = |rec: &CutRecord| (rec.n[0] * m[0] + rec.n[1] * m[1]) * 10_000 >= (m[0] * m[0] + m[1] * m[1]) * 9999;
    if !square(&below.rec) || !square(&above.rec) {
        return false;
    }
    if [&below.left, &below.right, &above.left, &above.right]
        .iter()
        .any(|part| part.is_empty())
    {
        return false;
    }
    let (t1, t2) = (below.rec.c, above.rec.c);
    if (t1 - t2).abs() < MIN_JOG * DIRECTION {
        return false;
    }
    let sigma = if t1 > t2 { -1 } else { 1 };
    let s_left = r.c + sigma * JOG * DIRECTION / 2;
    let s_right = r.c - sigma * JOG * DIRECTION / 2;
    let (lo, hi) = (t1.min(t2), t1.max(t2));
    let w_main = r.right_of_way().width();
    let w_below = below.rec.right_of_way().width();
    let w_above = above.rec.right_of_way().width();
    let (main, low, high) = (carriageway(r), carriageway(&below.rec), carriageway(&above.rec));
    let nm = negate(m);
    let nr = negate(r.n);
    let pieces = [
        (
            &below.left,
            clip(&clip(poly, r.n, s_left, w_main), m, t1, w_below),
            format!("{key}>L>L"),
            &below.rec,
        ),
        (
            &below.right,
            clip(&clip(poly, r.n, s_right, w_main), nm, -t1, w_below),
            format!("{key}>L>R"),
            &below.rec,
        ),
        (
            &above.right,
            clip(&clip(poly, nr, -s_right, w_main), nm, -t2, w_above),
            format!("{key}>R>R"),
            &above.rec,
        ),
        (
            &above.left,
            clip(&clip(poly, nr, -s_left, w_main), m, t2, w_above),
            format!("{key}>R>L"),
            &above.rec,
        ),
    ];
    let (s_lo, s_hi) = (s_left.min(s_right), s_left.max(s_right));
    let along = |c: i64| chord(&poly.p, r.n, c);
    let across = |c: i64| chord(&poly.p, m, c);
    ctx.road(trim(along(s_left), m, None, Some(hi)), main.0, main.1);
    ctx.road(trim(along(s_right), m, Some(lo), None), main.0, main.1);
    ctx.road(trim(across(t1), r.n, None, Some(s_hi)), low.0, low.1);
    ctx.road(trim(across(t2), r.n, Some(s_lo), None), high.0, high.1);
    let plaza_land = clip(
        &clip(
            &clip(
                &clip(poly, m, hi, if t1 > t2 { w_below } else { w_above }),
                nm,
                -lo,
                if t1 > t2 { w_above } else { w_below },
            ),
            r.n,
            s_hi,
            w_main,
        ),
        nr,
        -s_lo,
        w_main,
    );
    let plaza = inset(&plaza_land, PAVEMENT_INSET);
    if plaza.p.len() >= 3 {
        ctx.block(plaza.p, district, BlockKind::Plaza);
    }
    let major = is_major(r.cls);
    if major {
        wards(ctx, poly, r, left, right, key);
    }
    for (part, piece, sub, rec) in pieces {
        let side = &sub[..sub.len() - 2];
        let sub_district = if is_major(rec.cls) {
            seed_key(&sub)
        } else if major {
            seed_key(side)
        } else {
            district.to_owned()
        };
        split(
            ctx,
            part,
            &piece,
            mass_of(part),
            false,
            &sub,
            &sub_district,
            Some(share),
        );
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plat::TownPlat;
    use crate::testing::{layout_options, lots_item, rect, tree_of};
    use crate::town::context::{Ctx, Value};

    fn codes(ctx: &Ctx) -> Vec<&'static str> {
        ctx.events.iter().map(|e| e.code).collect()
    }

    fn detail<'e>(ctx: &'e Ctx, i: usize, key: &str) -> &'e Value {
        &ctx.events[i]
            .detail
            .iter()
            .find(|(k, _)| *k == key)
            .expect("a detail")
            .1
    }

    #[test]
    fn moves_a_remembered_cut_when_one_side_starves_while_the_other_has_room() {
        let (options, root) = (layout_options(), tree_of(&[]));
        let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
        let items = [lots_item("a", 1000), lots_item("b", 1000)];
        let c = decide(&mut ctx, &items, &rect(1000, 1000), 2000, true, "k", None, None, None)
            .expect("a cut")
            .rec
            .c;
        // The land grows fourfold on both axes: the absolute line now leaves one side an eighth of it.
        let moved = decide(&mut ctx, &items, &rect(4000, 4000), 2000, true, "k", None, None, None).expect("a cut");
        assert_eq!(codes(&ctx), ["plat/recut"]);
        assert_eq!(detail(&ctx, 0, "reason"), &Value::from("starved"));
        assert_ne!(moved.rec.c, c);
        // Once the land is shared as the demand is, the cut stays put.
        let _ = decide(&mut ctx, &items, &rect(4000, 4000), 2000, true, "k", None, None, None);
        assert_eq!(ctx.events.len(), 1);
    }

    #[test]
    fn keeps_a_remembered_cut_while_each_side_is_within_its_band() {
        let (options, root) = (layout_options(), tree_of(&[]));
        let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
        let items = [lots_item("a", 1000), lots_item("b", 1000)];
        let c = decide(&mut ctx, &items, &rect(1000, 1000), 2000, true, "k", None, None, None)
            .expect("a cut")
            .rec
            .c;
        let kept = decide(&mut ctx, &items, &rect(1100, 1100), 2000, true, "k", None, None, None).expect("a cut");
        assert_eq!(codes(&ctx), Vec::<&str>::new());
        assert_eq!(kept.rec.c, c);
    }

    #[test]
    fn reclasses_a_remembered_cut_by_the_band_and_leaves_a_river_alone() {
        let (options, root) = (layout_options(), tree_of(&[]));
        let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
        let pair = [lots_item("a", 1000), lots_item("b", 1000)];
        let cls = |ctx: &mut Ctx, mass: i64, first: bool, key: &str| {
            decide(ctx, &pair, &rect(1000, 1000), mass, first, key, None, None, None)
                .expect("a cut")
                .rec
                .cls
        };
        assert_eq!(cls(&mut ctx, 20_000, true, "k"), RoadClass::Street);
        assert_eq!(cls(&mut ctx, 37_499, true, "k"), RoadClass::Street);
        assert_eq!(cls(&mut ctx, 37_500, true, "k"), RoadClass::Collector);
        assert_eq!(cls(&mut ctx, 24_000, true, "k"), RoadClass::Collector);
        assert_eq!(cls(&mut ctx, 23_999, true, "k"), RoadClass::Street);
        assert_eq!(codes(&ctx), ["plat/reclass", "plat/reclass"]);
        let _ = cls(&mut ctx, 1000, true, "first");
        assert_eq!(cls(&mut ctx, 4_000_000, true, "first"), RoadClass::Boulevard);
        let _ = cls(&mut ctx, 1000, false, "later");
        assert_eq!(cls(&mut ctx, 4_000_000, false, "later"), RoadClass::Avenue);
        let banks: (&[Item], &[Item]) = (&pair[..1], &pair[1..]);
        let _ = decide(
            &mut ctx,
            &pair,
            &rect(1000, 1000),
            1000,
            true,
            "river",
            None,
            Some(banks),
            None,
        );
        let river = decide(
            &mut ctx,
            &pair,
            &rect(1000, 1000),
            4_000_000,
            true,
            "river",
            None,
            Some(banks),
            None,
        );
        assert_eq!(river.expect("a river").rec.cls, RoadClass::Street);
    }

    #[test]
    fn reserves_the_right_of_way_at_the_top_of_the_band_and_lays_it_again_when_the_cut_moves() {
        let (options, root) = (layout_options(), tree_of(&[]));
        let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
        let pair = [lots_item("a", 1000), lots_item("b", 1000)];
        let first = decide(&mut ctx, &pair, &rect(1000, 1000), 25_000, true, "k", None, None, None).expect("a cut");
        assert_eq!(
            (first.rec.cls, first.rec.row),
            (RoadClass::Street, Some(RoadClass::Collector))
        );
        assert_eq!(carriageway(&first.rec), (RoadClass::Street, None));
        let grown = decide(&mut ctx, &pair, &rect(1000, 1000), 400_000, true, "k", None, None, None).expect("a cut");
        assert_eq!(
            (grown.rec.cls, grown.rec.row),
            (RoadClass::Avenue, Some(RoadClass::Collector))
        );
        assert_eq!(
            carriageway(&grown.rec),
            (RoadClass::Avenue, Some(RoadClass::Collector.width()))
        );
        let heavy = [lots_item("a", 5000), lots_item("b", 1000)];
        let moved = decide(
            &mut ctx,
            &heavy,
            &rect(1000, 1000),
            400_000,
            true,
            "k",
            None,
            None,
            None,
        )
        .expect("a cut");
        assert_eq!(moved.rec.row, Some(RoadClass::Avenue));
        assert_eq!(
            CutRecord {
                row: None,
                ..moved.rec.clone()
            }
            .right_of_way(),
            moved.rec.cls
        );
        split(&mut ctx, &pair, &rect(1000, 1000), 400_000, true, "s", "d", None);
        let mut fresh = Ctx::new(&options, TownPlat::default(), &root, 0);
        let _ = decide(
            &mut fresh,
            &pair,
            &rect(1000, 1000),
            25_000,
            true,
            "k",
            None,
            None,
            None,
        );
        split(&mut fresh, &pair, &rect(1000, 1000), 400_000, true, "k", "d", None);
        assert!(
            fresh
                .roads
                .iter()
                .any(|r| r.cls == RoadClass::Avenue && r.width == Some(RoadClass::Collector.width()))
        );
    }

    #[test]
    fn recuts_a_side_short_of_its_share_of_the_folder_and_only_then() {
        let (options, root) = (layout_options(), tree_of(&[]));
        let laid_at_45 = || {
            let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
            let uneven = [lots_item("a", 900), lots_item("b", 1100)];
            let _ = decide(&mut ctx, &uneven, &rect(1000, 1000), 2000, true, "k", None, None, None);
            ctx
        };
        let even = [lots_item("a", 1000), lots_item("b", 1000)];
        let land2 = 2 * 1000 * 1000;
        let mut short = laid_at_45();
        let before = short.plat.cuts["k"].c;
        let share = Some(Share {
            land2: 2 * land2,
            demand: 2000,
        });
        let moved = decide(&mut short, &even, &rect(1000, 1000), 2000, true, "k", None, None, share).expect("a cut");
        assert_eq!(codes(&short), ["plat/recut"]);
        assert_eq!(detail(&short, 0, "reason"), &Value::from("starved"));
        assert_ne!(moved.rec.c, before);
        let mut within = laid_at_45();
        let _ = decide(
            &mut within,
            &even,
            &rect(1000, 1000),
            2000,
            true,
            "k",
            None,
            None,
            Some(Share { land2, demand: 2000 }),
        );
        assert_eq!(codes(&within), Vec::<&str>::new());
    }

    #[test]
    fn trims_a_segment_to_a_band_along_a_direction() {
        let seg = Some([Pt::new(0, 0), Pt::new(100, 0)]);
        assert_eq!(
            trim(seg, [1, 0], Some(20), Some(60)),
            Some(vec![Pt::new(20, 0), Pt::new(60, 0)])
        );
        assert_eq!(
            trim(seg, [1, 0], None, Some(30)),
            Some(vec![Pt::new(0, 0), Pt::new(30, 0)])
        );
        assert_eq!(
            trim(seg, [-1, 0], Some(-30), None),
            Some(vec![Pt::new(0, 0), Pt::new(30, 0)])
        );
        assert_eq!(trim(seg, [1, 0], Some(200), None), None);
        assert_eq!(
            trim(seg, [0, 1], Some(0), Some(0)),
            Some(vec![Pt::new(0, 0), Pt::new(100, 0)])
        );
        assert_eq!(trim(None, [1, 0], None, None), None);
    }

    #[test]
    fn measures_a_town_diameter_from_its_land() {
        assert_eq!(diameter_of(0), 0);
        assert_eq!(diameter_of(710), 20);
    }
}
