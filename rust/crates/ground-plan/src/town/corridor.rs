//! Corridor: a folder nearly all of whose mass lies in one child leads through to it; the chain's other items gather
//! in one faubourg behind a short gateway.
use crate::archetype::{Form, classify_node};
use crate::city::District;
use crate::fixed::{Dir, Poly, TURN, area2, chord, clip, compare_keys, dir, floor_div, negate, offset_for, unit_mille};
use crate::plat::CutRecord;
use crate::roads::{class_of, right_of_way_for};
use crate::town::context::{Ctx, Item, ItemKind, Order, demand_of, mass_of, seed_key};
use crate::town::cut::{How, Share, carriageway, decide, grow, is_major, place, split, wards};
use crate::town::partition::{centre_out, items_of};
use crate::tree::TreeNode;

/// A gateway is the shortest of this many directions, from a path-seeded start.
pub const GATE_DIRECTIONS: i64 = 32;
const GATE_STEP: i64 = TURN / GATE_DIRECTIONS;

/// The chain of corridors from a folder's items.
struct Chain<'t> {
    wayside: Vec<Item<'t>>,
    levels: Vec<&'t TreeNode>,
    destination: Item<'t>,
}

/// Walks the chain: each level's heaviest folder leads on while it is a corridor too; the rest is the wayside.
fn chain_of<'t>(ctx: &mut Ctx<'t, '_>, items: &[Item<'t>], district: &str) -> Option<Chain<'t>> {
    let mut wayside = Vec::new();
    let mut levels = Vec::new();
    let mut level = items.to_vec();
    loop {
        let heaviest = level
            .iter()
            .filter(|i| matches!(i.kind, ItemKind::Folder(_)))
            .fold(None, |a: Option<&Item<'t>>, b| match a {
                Some(a) if a.mass_mille >= b.mass_mille => Some(a),
                _ => Some(b),
            })?
            .clone();
        wayside.extend(level.iter().filter(|i| i.key != heaviest.key).cloned());
        let ItemKind::Folder(next) = heaviest.kind else {
            unreachable!("the heaviest is a folder")
        };
        let previous = ctx.plat.forms.get(&*next.path).copied();
        if classify_node(next, previous, &ctx.options.toggles) != Form::Corridor {
            return Some(Chain {
                wayside,
                levels,
                destination: heaviest,
            });
        }
        if let Some(previous) = previous
            && previous != Form::Corridor
        {
            ctx.emit(
                "plat/switch",
                vec![
                    ("path", (&*next.path).into()),
                    ("from", previous.as_str().into()),
                    ("to", Form::Corridor.as_str().into()),
                    ("massMille", next.mass_mille.into()),
                ],
            );
            ctx.forget(&next.path);
        }
        ctx.plat.forms.insert(next.path.to_string(), Form::Corridor);
        levels.push(next);
        level = items_of(ctx, next, district);
    }
}

/// The gateway's fresh line: of the directions, the one whose cut leaving the faubourg its share is shortest.
fn fresh_gateway(poly: &Poly, key: &str, faubourg: i64, total: i64) -> (Dir, i64) {
    let start = floor_div(unit_mille(&format!("{}#gate", seed_key(key))) * GATE_STEP, 1000);
    let mut best: Option<(Dir, i64, i64)> = None;
    for k in 0..GATE_DIRECTIONS {
        let n = dir(start + k * GATE_STEP);
        let c = offset_for(poly, n, faubourg, total);
        // Both sides hold a share of the land, so the line crosses it.
        let [a, b] = chord(&poly.p, n, c).expect("a gateway crosses its land");
        let length2 = (b.x - a.x).pow(2) + (b.y - a.y).pow(2);
        if best.is_none_or(|(_, _, l)| length2 < l) {
            best = Some((n, c, length2));
        }
    }
    let (n, c, _) = best.expect("a gateway has directions");
    (n, c)
}

/// Corridor: every level's other items gather in one faubourg on the edge of the land, behind a short gateway; the
/// first folder down the chain that is no corridor (the destination) takes the rest. False declines.
pub fn corridor<'t>(
    ctx: &mut Ctx<'t, '_>,
    node: &'t TreeNode,
    items: &[Item<'t>],
    poly: &Poly,
    district: &str,
) -> bool {
    let Some(Chain {
        wayside,
        levels,
        destination,
    }) = chain_of(ctx, items, district)
    else {
        return false;
    };
    if wayside.is_empty() {
        return false;
    }
    let key: &str = &node.path;
    if let Some(known) = ctx.plat.cuts.get(key)
        && (known.right.len() != 1 || *known.right[0] != *destination.key || chord(&poly.p, known.n, known.c).is_none())
    {
        let from = known.right.join(",");
        ctx.emit(
            "plat/corridor-destination",
            vec![
                ("key", key.into()),
                ("from", from.into()),
                ("to", (&*destination.key).into()),
            ],
        );
        ctx.forget(key);
    }
    let share = Share {
        land2: area2(&poly.p),
        demand: demand_of(&wayside) + destination.demand,
    };
    let r = if let Some(known) = ctx.plat.cuts.get_mut(key) {
        // Newcomers join the faubourg; the gateway then moves only as any cut does.
        for item in &wayside {
            if !known.left.iter().any(|k| **k == *item.key) {
                known.left.push(item.key.to_string());
            }
        }
        let mut all = wayside.clone();
        all.push(destination.clone());
        let how = How {
            share: Some(share),
            ..How::default()
        };
        decide(ctx, &all, poly, node.mass_mille, false, key, how)
            .expect("a remembered gateway decides")
            .rec
    } else {
        let dl = demand_of(&wayside);
        let (n, c) = fresh_gateway(poly, key, dl, dl + destination.demand);
        let rec = CutRecord {
            n,
            c,
            cls: class_of(node.mass_mille, false, false, ctx.tier),
            row: Some(right_of_way_for(node.mass_mille, false, false, ctx.tier)),
            left: wayside.iter().map(|i| i.key.to_string()).collect(),
            right: vec![destination.key.to_string()],
            cap_left: grow(dl),
            cap_right: grow(destination.demand),
            river: false,
            canal: false,
        };
        ctx.plat.cuts.insert(key.to_owned(), rec.clone());
        let count = i64::try_from(wayside.len()).expect("small");
        ctx.emit(
            "plat/gateway",
            vec![
                ("key", key.into()),
                ("destination", (&*destination.key).into()),
                ("wayside", count.into()),
            ],
        );
        rec
    };
    let (cls, width) = carriageway(&r);
    ctx.road(chord(&poly.p, r.n, r.c).map(Vec::from), cls, width);
    let major = is_major(r.cls);
    if major {
        wards(ctx, poly, &r, &wayside, std::slice::from_ref(&destination), key);
    }
    let w = r.right_of_way().width();
    // Each level of the chain holds the faubourg's items of its own and the destination: the whole corridor.
    for level in levels {
        ctx.districts.push(District {
            pts: poly.p.clone(),
            path: level.path.to_string(),
            name: level.name.clone(),
            depth: level.depth,
            mass_mille: level.mass_mille,
            form: Some(Form::Corridor),
            ward: false,
        });
    }
    let mut ordered = wayside.clone();
    ordered.sort_by(|a, b| {
        a.first_seen
            .cmp(&b.first_seen)
            .then_with(|| compare_keys(&a.key, &b.key))
    });
    let ordered = if ctx.options.order == Order::CentreOut {
        centre_out(&ordered)
    } else {
        ordered
    };
    let (key_l, key_r) = (format!("{key}>L"), format!("{key}>R"));
    let district_l = if major { seed_key(&key_l) } else { district.to_owned() };
    let district_r = if major { seed_key(&key_r) } else { district.to_owned() };
    split(
        ctx,
        &ordered,
        &clip(poly, r.n, r.c, w),
        mass_of(&wayside),
        false,
        &key_l,
        &district_l,
        None,
    );
    place(ctx, &clip(poly, negate(r.n), -r.c, w), &destination, &district_r);
    true
}
