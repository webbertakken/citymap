//! Partition: a folder laid out on its land, by its form; the locality cache; radial and twin forms.
use std::sync::Arc;

use crate::archetype::{Form, classify_node, flatten};
use crate::city::District;
use crate::constants::{GROWTH_PCT, LOT_AREA};
use crate::fixed::{
    DIRECTION, Poly, Pt, Rounding, TURN, area2, centroid, clip, compare_keys, dir, floor_div, isqrt_of_number, mul_div,
    negate, normalise, reach, round_div, unit_mille,
};
use crate::plat::RadialRecord;
use crate::roads::class_of;
use crate::town::archipelago::archipelago;
use crate::town::context::{CacheEntry, CacheKey, Ctx, Item, ItemKind, Order, demand_of, mass_of, seed_key, to_poly};
use crate::town::corridor::corridor;
use crate::town::cut::{How, Water, decide, place, reserve, split};
use crate::town::neighbourhood::neighbourhood;
use crate::town::quarters::quarters;
use crate::town::waterway::{Into, RIVER, waterway};
use crate::tree::{TreeNode, land_for};

/// A sector spans at most this many angle steps (0.95π).
const MAX_SPAN: i64 = 1946;
/// A radial core reaches at most this share (‰) of the way to the edge, so the ring keeps room.
const RADIAL_MAX_SCALE: i64 = 950;

/// Oldest in the middle, then alternately either side, so newcomers join the edges.
#[must_use]
pub fn centre_out<T: Clone>(ordered: &[T]) -> Vec<T> {
    let mut left = Vec::new();
    let mut right = Vec::new();
    for (i, item) in ordered.iter().enumerate() {
        if i % 2 == 0 {
            right.push(item.clone());
        } else {
            left.push(item.clone());
        }
    }
    left.reverse();
    left.extend(right);
    left
}

/// A folder's items: child folders, its own lots, its own park; by first appearance, then key.
#[must_use]
pub fn items_of<'t>(ctx: &Ctx<'t, '_>, node: &'t TreeNode, district: &str) -> Vec<Item<'t>> {
    let mut items: Vec<Item<'t>> = node
        .children
        .iter()
        .map(|c| Item {
            key: c.path.clone(),
            demand: c.demand,
            mass_mille: c.mass_mille,
            first_seen: c.first_seen,
            kind: ItemKind::Folder(c),
        })
        .collect();
    let district: Arc<str> = district.into();
    if let Some(first) = node.lots.first() {
        items.push(Item {
            key: format!("{}#lots", node.path).into(),
            demand: land_for(
                i64::try_from(node.lots.len()).expect("small") * LOT_AREA,
                ctx.options.density_pct,
            ),
            mass_mille: node.lots.iter().map(|l| l.land_use.weight_mille()).sum(),
            first_seen: first.first_seen,
            kind: ItemKind::Lots {
                lots: &node.lots,
                district: district.clone(),
            },
        });
    }
    if node.docs > 0 {
        items.push(Item {
            key: format!("{}#park", node.path).into(),
            demand: land_for(node.docs * LOT_AREA / 2, ctx.options.density_pct),
            mass_mille: 0,
            first_seen: node.first_seen,
            kind: ItemKind::Park { district },
        });
    }
    items.sort_by(|a, b| {
        a.first_seen
            .cmp(&b.first_seen)
            .then_with(|| compare_keys(&a.key, &b.key))
    });
    items
}

/// The folder's own plat record (its grid, first cut or radial layout) is still there: forgetting is the only way
/// anything but the folder's own layout changes its records, and it removes this one.
fn recorded(ctx: &Ctx, path: &str) -> bool {
    ctx.plat.grids.contains_key(path) || ctx.plat.cuts.contains_key(path) || ctx.plat.radial.contains_key(path)
}

/// Lays out a folder on its land, replaying its last layout when nothing about it changed.
pub fn partition<'t>(ctx: &mut Ctx<'t, '_>, node: &'t TreeNode, poly: &Poly, district: &str) {
    if ctx.cache.is_none() || std::ptr::eq(node, ctx.root) {
        lay_folder(ctx, node, poly, district);
        return;
    }
    let key = CacheKey {
        digest: node.digest,
        name: node.name.clone(),
        depth: node.depth,
        district: district.into(),
        pts: poly.p.clone(),
        widths: poly.w.clone(),
    };
    let is_recorded = recorded(ctx, &node.path);
    let cache = ctx.cache.as_mut().expect("checked above");
    if let Some(hit) = cache.entries.get(&node.path)
        && hit.key == key
        && is_recorded
    {
        cache.hits += 1;
        ctx.roads.extend(hit.roads.iter().cloned());
        ctx.blocks.extend(hit.blocks.iter().cloned());
        ctx.lots.extend(hit.lots.iter().cloned());
        ctx.districts.extend(hit.districts.iter().cloned());
        ctx.water.extend(hit.water.iter().cloned());
        ctx.canals.extend(hit.canals.iter().cloned());
        ctx.events.extend(hit.overflow_events.iter().cloned());
        ctx.overflow += hit.overflow;
        ctx.lot_area2 += hit.lot_area2;
        return;
    }
    let before = (
        ctx.roads.len(),
        ctx.blocks.len(),
        ctx.lots.len(),
        ctx.districts.len(),
        ctx.water.len(),
        ctx.events.len(),
        ctx.canals.len(),
    );
    let (overflow, lot_area2) = (ctx.overflow, ctx.lot_area2);
    lay_folder(ctx, node, poly, district);
    let entry = CacheEntry {
        key,
        roads: ctx.roads[before.0..].to_vec(),
        blocks: ctx.blocks[before.1..].to_vec(),
        lots: ctx.lots[before.2..].to_vec(),
        districts: ctx.districts[before.3..].to_vec(),
        water: ctx.water[before.4..].to_vec(),
        canals: ctx.canals[before.6..].to_vec(),
        overflow: ctx.overflow - overflow,
        lot_area2: ctx.lot_area2 - lot_area2,
        overflow_events: ctx.events[before.5..]
            .iter()
            .filter(|e| e.code == "town/overflow")
            .cloned()
            .collect(),
    };
    ctx.cache
        .as_mut()
        .expect("checked above")
        .entries
        .insert(node.path.clone(), entry);
}

/// Lays out a folder on its land: one neighbourhood when flat, else arranged by its district form.
fn lay_folder<'t>(ctx: &mut Ctx<'t, '_>, node: &'t TreeNode, poly: &Poly, district: &str) {
    let is_root = std::ptr::eq(node, ctx.root);
    let previous = ctx.plat.forms.get(&*node.path).copied();
    let form = match ctx.root_form {
        Some(root_form) if is_root => root_form,
        _ => classify_node(node, previous, &ctx.options.toggles),
    };
    if let Some(previous) = previous
        && previous != form
    {
        ctx.emit(
            "plat/switch",
            vec![
                ("path", (&*node.path).into()),
                ("from", previous.as_str().into()),
                ("to", form.as_str().into()),
                ("massMille", node.mass_mille.into()),
            ],
        );
        ctx.forget(&node.path);
    }
    ctx.plat.forms.insert(node.path.to_string(), form);
    if is_root {
        ctx.form = form;
    }
    // Every folder records its district; which are labelled is decided over the whole town at the end of the lay.
    if node.depth >= 1 {
        ctx.districts.push(District {
            pts: poly.p.clone(),
            path: node.path.to_string(),
            name: node.name.clone(),
            depth: node.depth,
            mass_mille: node.mass_mille,
            form: Some(form),
            ward: false,
        });
    }
    let (blocks_before, lots_before) = (ctx.blocks.len(), ctx.lots.len());
    if form.is_flat() {
        let (lots, docs) = flatten(node);
        let park_demand = land_for(docs * LOT_AREA / 2, ctx.options.density_pct);
        neighbourhood(ctx, poly, &lots, park_demand, &node.path, district, form);
        return;
    }
    let items = items_of(ctx, node, district);
    let done = (form == Form::Corridor && corridor(ctx, node, &items, poly, district))
        || (form == Form::Archipelago && archipelago(ctx, node, &items, poly, district))
        || (form == Form::Quarters && quarters(ctx, node, &items, poly, district))
        || (form == Form::Radial && radial(ctx, node, &items, poly, district))
        || (form == Form::Twin && twin(ctx, node, &items, poly, district));
    if !done {
        let ordered = if ctx.options.order == Order::CentreOut {
            centre_out(&items)
        } else {
            items
        };
        split(ctx, &ordered, poly, node.mass_mille, true, &node.path, district, None);
    }
    // Everything laid inside this folder without a district form yet takes this one.
    for block in &mut ctx.blocks[blocks_before..] {
        block.form.get_or_insert(form);
    }
    for lot in &mut ctx.lots[lots_before..] {
        lot.form.get_or_insert(form);
    }
}

/// The point at angle step a, scale (‰) of the way from the centre to the edge.
fn point_at(pts: &[Pt], c: Pt, a: i64, scale: i64) -> Pt {
    let r = mul_div(reach(pts, c, a), scale, 1000, Rounding::Floor);
    let [dx, dy] = dir(a);
    Pt::new(
        c.x + mul_div(dx, r, DIRECTION, Rounding::Round),
        c.y + mul_div(dy, r, DIRECTION, Rounding::Round),
    )
}

/// The sector between spokes at a0 and a1, beyond the core chord between their inner ends.
#[must_use]
pub fn sector(poly: &Poly, c: Pt, a0: i64, a1: i64, scale: i64, w_spoke: i64, w_ring: i64) -> Poly {
    let [c0, s0] = dir(a0);
    let [c1, s1] = dir(a1);
    let out = clip(poly, [s0, -c0], s0 * c.x - c0 * c.y, w_spoke);
    let out = clip(&out, [-s1, c1], -s1 * c.x + c1 * c.y, w_spoke);
    let q0 = point_at(&poly.p, c, a0, scale);
    let q1 = point_at(&poly.p, c, a1, scale);
    if q0 == q1 {
        return out;
    }
    // Sectors turn anticlockwise and span under half a turn, so the right-hand normal of q0 → q1 points outward.
    let back = negate(normalise(q1.y - q0.y, q0.x - q1.x));
    clip(&out, back, back[0] * q0.x + back[1] * q0.y, w_ring)
}

/// The sector bounds at a core scale: each the least step whose sector reaches its share of the land.
fn angles(
    poly: &Poly,
    c: Pt,
    start: i64,
    demands: &[i128],
    total_area2: i128,
    total_demand: i128,
    scale: i64,
) -> Option<Vec<i64>> {
    let mut bounds = vec![start];
    for (i, &demand) in demands.iter().enumerate().take(demands.len() - 1) {
        let a0 = bounds[i];
        let target = demand * total_area2;
        let reaches = |a1: i64| i128::from(area2(&sector(poly, c, a0, a1, scale, 0, 0).p)) * total_demand >= target;
        if !reaches(a0 + MAX_SPAN) {
            return None;
        }
        let (mut lo, mut hi) = (a0, a0 + MAX_SPAN);
        while lo < hi {
            let mid = lo + floor_div(hi - lo, 2);
            if reaches(mid) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        bounds.push(lo);
    }
    bounds.push(start + TURN);
    let last = bounds[bounds.len() - 1] - bounds[bounds.len() - 2];
    (last > 0 && last <= MAX_SPAN).then_some(bounds)
}

/// Radial: the heaviest child at the core, the others in ring sectors by age, a ring road round the core and spokes
/// between the sectors. Declines (false) when the ring cannot be laid.
fn radial<'t>(ctx: &mut Ctx<'t, '_>, node: &'t TreeNode, items: &[Item<'t>], poly: &Poly, district: &str) -> bool {
    let core = items
        .iter()
        .filter(|i| matches!(i.kind, ItemKind::Folder(_)))
        .fold(None::<&Item>, |a, b| match a {
            Some(a) if a.mass_mille >= b.mass_mille => Some(a),
            _ => Some(b),
        });
    let Some(core) = core else { return false };
    let c = centroid(&poly.p);
    let total_area2 = i128::from(area2(&poly.p));
    let total_demand = i128::from(demand_of(items));
    let present: Vec<&Item> = items.iter().filter(|i| i.key != core.key).collect();
    let path: &str = &node.path;
    let known = ctx.plat.radial.get(path).filter(|r| *r.core == *core.key).cloned();
    let outgrown = known.as_ref().is_some_and(|known| {
        let cap_exceeded = |i: &Item| known.caps.get(&*i.key).is_some_and(|&cap| i.demand > cap);
        present
            .iter()
            .any(|i| !known.order.iter().any(|k| **k == *i.key) || cap_exceeded(i))
            || cap_exceeded(core)
    });
    let by_key = |key: &str| items.iter().find(|i| *i.key == *key);
    let rec = match known {
        Some(rec) if !outgrown => rec,
        known => {
            let order: Vec<String> = match &known {
                Some(known) => known
                    .order
                    .iter()
                    .filter(|k| present.iter().any(|i| *i.key == ***k))
                    .cloned()
                    .chain(
                        present
                            .iter()
                            .filter(|i| !known.order.iter().any(|k| **k == *i.key))
                            .map(|i| i.key.to_string()),
                    )
                    .collect(),
                None => present.iter().map(|i| i.key.to_string()).collect(),
            };
            if order.len() < 3 {
                return false;
            }
            let start = known.as_ref().map_or_else(
                || floor_div(unit_mille(&format!("{}#radial", seed_key(path))) * TURN, 1000),
                |k| k.start,
            );
            let demands: Vec<i128> = order
                .iter()
                .map(|k| i128::from(by_key(k).expect("an ordered item").demand))
                .collect();
            let core_demand = i128::from(core.demand);
            // Four rounds fit the core polygon to its demand; the fifth lays the final sectors.
            let mut scale = isqrt_of_number(core_demand * 1_000_000 / total_demand);
            let mut bounds;
            let mut round = 0;
            loop {
                bounds = angles(poly, c, start, &demands, total_area2, total_demand, scale);
                let Some(found) = &bounds else { break };
                if round == 4 {
                    break;
                }
                let inner: Vec<Pt> = found[..found.len() - 1]
                    .iter()
                    .map(|&a| point_at(&poly.p, c, a, scale))
                    .collect();
                let core_area2 = i128::from(area2(&inner).max(1));
                let ratio = core_demand * total_area2 * 1_000_000 / (total_demand * core_area2);
                let scaled = i128::from(scale) * i128::from(isqrt_of_number(ratio));
                scale = i64::try_from(scaled.div_euclid(1000).min(i128::from(RADIAL_MAX_SCALE))).expect("capped");
                round += 1;
            }
            let Some(bounds) = bounds else { return false };
            if known.is_some() {
                ctx.emit("plat/radial-resector", vec![("path", path.into())]);
                // Every sector turns: each item lays afresh in its new land rather than keep a grid across it.
                for item in items {
                    ctx.forget(&item.key);
                }
            }
            let rec = RadialRecord {
                core: core.key.to_string(),
                start,
                order,
                bounds,
                scale_mille: scale,
                caps: items
                    .iter()
                    .map(|i| (i.key.to_string(), round_div(i.demand * GROWTH_PCT, 100)))
                    .collect(),
            };
            ctx.plat.radial.insert(path.to_owned(), rec.clone());
            rec
        }
    };
    // The ring is the folder's first road: under tiers, the town's first when the folder is the root.
    let ring_class = class_of(node.mass_mille, true, std::ptr::eq(node, ctx.root), ctx.tier);
    let spoke_class = class_of(node.mass_mille, false, false, ctx.tier);
    let (w_ring, w_spoke) = (ring_class.width(), spoke_class.width());
    let spokes = &rec.bounds[..rec.bounds.len() - 1];
    let inner: Vec<Pt> = spokes
        .iter()
        .map(|&a| point_at(&poly.p, c, a, rec.scale_mille))
        .collect();
    let mut ring = inner.clone();
    ring.push(inner[0]);
    ctx.road(Some(ring), ring_class, None);
    for &a in spokes {
        ctx.road(
            Some(vec![
                point_at(&poly.p, c, a, rec.scale_mille),
                point_at(&poly.p, c, a, 1000),
            ]),
            spoke_class,
            None,
        );
    }
    let sub = |key: &str| seed_key(&format!("{path}>{key}"));
    for (i, key) in rec.order.iter().enumerate() {
        let piece = sector(
            poly,
            c,
            rec.bounds[i],
            rec.bounds[i + 1],
            rec.scale_mille,
            w_spoke,
            w_ring,
        );
        match by_key(key) {
            Some(item) => place(ctx, &piece, item, &sub(&item.key)),
            None => reserve(ctx, &piece, district),
        }
    }
    place(ctx, &to_poly(&inner, w_ring), core, &sub(&core.key));
    true
}

/// Twin: the two heaviest children on either bank of a river, the rest joining the bank with less demand.
fn twin<'t>(ctx: &mut Ctx<'t, '_>, node: &'t TreeNode, items: &[Item<'t>], poly: &Poly, district: &str) -> bool {
    let mut folders: Vec<&Item> = items.iter().filter(|i| matches!(i.kind, ItemKind::Folder(_))).collect();
    folders.sort_by_key(|i| std::cmp::Reverse(i.mass_mille));
    let (Some(first), Some(second)) = (folders.first().copied(), folders.get(1).copied()) else {
        return false;
    };
    let mut left = vec![first.clone()];
    let mut right = vec![second.clone()];
    for item in items {
        if item.key == first.key || item.key == second.key {
            continue;
        }
        if demand_of(&left) <= demand_of(&right) {
            left.push(item.clone());
        } else {
            right.push(item.clone());
        }
    }
    // A switch to twin forgets the folder's cuts, so this decision is fresh: a river that crosses the land.
    let decision = decide(
        ctx,
        items,
        poly,
        node.mass_mille,
        true,
        &node.path,
        How {
            assign: Some((left.as_slice(), right.as_slice())),
            water: Some(Water::River),
            ..How::default()
        },
    )
    .expect("a twin decides its river");
    let r = &decision.rec;
    waterway(ctx, poly, r, RIVER, Into::Water);
    let banks = [
        (&decision.left, clip(poly, r.n, r.c, RIVER), format!("{}>L", node.path)),
        (
            &decision.right,
            clip(poly, negate(r.n), -r.c, RIVER),
            format!("{}>R", node.path),
        ),
    ];
    for (part, bank, sub) in banks {
        if part.is_empty() {
            reserve(ctx, &bank, district);
        } else {
            split(ctx, part, &bank, mass_of(part), false, &sub, &seed_key(&sub), None);
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_items_centre_out() {
        assert_eq!(centre_out(&[0, 1, 2, 3, 4]), vec![3, 1, 0, 2, 4]);
        assert_eq!(centre_out::<i32>(&[]), Vec::<i32>::new());
    }
}
