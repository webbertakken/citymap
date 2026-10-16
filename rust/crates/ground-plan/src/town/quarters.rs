//! Quarters: many similar small folders grouped into planned quarters in age order, each cut square to its own frame.
use crate::archetype::{Form, classify_node};
use crate::city::District;
use crate::constants::{BLOCK_LONG, BLOCK_SHORT, RoadClass, U};
use crate::fixed::{Dir, Poly, area2, chord, clip, compare_keys, extent, longest_edge, negate, perp};
use crate::json::Record;
use crate::town::archipelago::group_of;
use crate::town::context::{Ctx, Item, ItemKind, Order, demand_of, mass_of};
use crate::town::cut::{How, Share, decide, heaviest_folder, lent, place, split};
use crate::town::partition::centre_out;
use crate::tree::TreeNode;

/// A quarter closes once its members need this many blocks of land: about five blocks across.
pub const QUARTER_BLOCKS: i64 = 24;
pub const QUARTER_LAND: i64 = QUARTER_BLOCKS * (BLOCK_SHORT + U) * (BLOCK_LONG + U);
/// At the first lay, a last quarter under this share (‰) of a full one joins the quarter before it.
pub const QUARTER_TAIL_MILLE: i64 = 400;

/// The items a folder's quarters can hold: its own lots, and children small enough to flatten.
fn eligible<'t>(ctx: &Ctx<'t, '_>, items: &[Item<'t>]) -> Vec<Item<'t>> {
    items
        .iter()
        .filter(|i| match i.kind {
            ItemKind::Lots { .. } => true,
            ItemKind::Folder(node) => {
                i.demand <= QUARTER_LAND
                    && classify_node(node, ctx.plat.forms.get(&*i.key).copied(), &ctx.options.toggles).is_flat()
            }
            _ => false,
        })
        .cloned()
        .collect()
}

/// Each quarter's members, remembered: fresh in age order, or as last laid with newcomers at the end.
fn members_of(ctx: &mut Ctx, node: &TreeNode, small: &[Item]) -> Vec<Vec<String>> {
    // Remembered keys are filtered to the items laid now, so every key has its item.
    let demand = |keys: &[String]| -> i64 {
        keys.iter()
            .map(|k| small.iter().find(|i| *i.key == **k).expect("a quarter's member").demand)
            .sum()
    };
    let known = ctx.plat.quarters.as_ref().and_then(|r| r.get(&*node.path)).cloned();
    let groups: Vec<Vec<String>> = match known {
        None => {
            let mut groups: Vec<Vec<String>> = Vec::new();
            let mut current: Vec<String> = Vec::new();
            for item in small {
                current.push(item.key.to_string());
                if demand(&current) >= QUARTER_LAND {
                    groups.push(std::mem::take(&mut current));
                }
            }
            if !current.is_empty() {
                let tail = demand(&current) * 1000 < QUARTER_TAIL_MILLE * QUARTER_LAND;
                match groups.last_mut() {
                    Some(last) if tail => last.extend(current),
                    _ => groups.push(current),
                }
            }
            let count = i64::try_from(groups.len()).expect("small");
            ctx.emit(
                "plat/quarters",
                vec![("key", (&*node.path).into()), ("quarters", count.into())],
            );
            groups
        }
        Some(known) => {
            let mut groups: Vec<Vec<String>> = known
                .into_iter()
                .map(|keys| {
                    keys.into_iter()
                        .filter(|k| small.iter().any(|i| *i.key == **k))
                        .collect()
                })
                .collect();
            for item in small {
                if groups.iter().flatten().any(|k| **k == *item.key) {
                    continue;
                }
                // A remembered grouping holds at least one quarter.
                let last = groups.last_mut().expect("a remembered quarter");
                if demand(last) < QUARTER_LAND {
                    last.push(item.key.to_string());
                } else {
                    groups.push(vec![item.key.to_string()]);
                    let quarter = i64::try_from(groups.len() - 1).expect("small");
                    ctx.emit(
                        "plat/quarter-opened",
                        vec![("key", (&*node.path).into()), ("quarter", quarter.into())],
                    );
                }
            }
            groups
        }
    };
    ctx.plat
        .quarters
        .get_or_insert_with(Record::new)
        .insert(node.path.to_string(), groups.clone());
    groups
}

/// Quarters: small folders grouped into planned quarters in age order; quarters and larger children cut as usual.
/// False declines (fewer than two small items).
pub fn quarters<'t>(
    ctx: &mut Ctx<'t, '_>,
    node: &'t TreeNode,
    items: &[Item<'t>],
    poly: &Poly,
    district: &str,
) -> bool {
    let small = eligible(ctx, items);
    if small.len() < 2 {
        return false;
    }
    let groups = members_of(ctx, node, &small);
    let item = |key: &str| {
        small
            .iter()
            .find(|i| *i.key == *key)
            .expect("a quarter's member")
            .clone()
    };
    let grouped = |key: &str| groups.iter().flatten().any(|k| *k == key);
    let quarter_items = groups
        .iter()
        .enumerate()
        .filter(|(_, keys)| !keys.is_empty())
        .map(|(q, keys)| {
            group_of(
                format!("{}#q{q}", node.path),
                keys.iter().map(|k| item(k)).collect(),
                ItemKind::Quarter,
            )
        });
    let mut ordered: Vec<Item<'t>> = quarter_items
        .chain(items.iter().filter(|i| !grouped(&i.key)).cloned())
        .collect();
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
    split(ctx, &ordered, poly, node.mass_mille, true, &node.path, district, None);
    true
}

/// Cuts a quarter's land by streets square to its frame, across the land's longer extent.
fn frame_split<'t>(
    ctx: &mut Ctx<'t, '_>,
    items: &[Item<'t>],
    poly: &Poly,
    key: &str,
    district: &str,
    frame: Dir,
    fair: Option<Share>,
) {
    let share = fair.unwrap_or_else(|| Share {
        land2: area2(&poly.p),
        demand: demand_of(items),
    });
    let (a0, a1) = extent(&poly.p, frame);
    let (b0, b1) = extent(&poly.p, perp(frame));
    let forced = if a1 - a0 >= b1 - b0 { frame } else { perp(frame) };
    let how = How {
        forced: Some(forced),
        fixed: Some(RoadClass::Street),
        share: Some(share),
        ..How::default()
    };
    let Some(decision) = decide(ctx, items, poly, mass_of(items), false, key, how) else {
        place(ctx, poly, &items[0], district);
        return;
    };
    if let Some((part, sub)) = lent(&decision, key) {
        frame_split(ctx, &part, poly, &sub, district, frame, Some(share));
        return;
    }
    let r = &decision.rec;
    ctx.road(chord(&poly.p, r.n, r.c).map(Vec::from), RoadClass::Street, None);
    let w = RoadClass::Street.width();
    let (key_l, key_r) = (format!("{key}>L"), format!("{key}>R"));
    frame_split(
        ctx,
        &decision.left,
        &clip(poly, r.n, r.c, w),
        &key_l,
        district,
        frame,
        Some(share),
    );
    frame_split(
        ctx,
        &decision.right,
        &clip(poly, negate(r.n), -r.c, w),
        &key_r,
        district,
        frame,
        Some(share),
    );
}

/// One quarter: a ward named after its heaviest folder, its members cut square to its own frame.
pub fn quarter<'t>(ctx: &mut Ctx<'t, '_>, poly: &Poly, key: &str, mass_mille: i64, items: &[Item<'t>], district: &str) {
    if let Some(heaviest) = heaviest_folder(items)
        && let ItemKind::Folder(node) = heaviest.kind
    {
        ctx.districts.push(District {
            pts: poly.p.clone(),
            path: key.to_owned(),
            name: node.name.clone(),
            depth: node.depth,
            mass_mille,
            form: Some(Form::Quarters),
            ward: true,
        });
    }
    frame_split(ctx, items, poly, key, district, longest_edge(&poly.p), None);
}
