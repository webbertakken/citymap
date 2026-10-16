//! Archipelago: a folder of packages becomes islands, one per package (shared beyond a dozen), its other items one
//! mainland, with canals and bridges between them.
use std::sync::Arc;

use crate::archetype::is_package;
use crate::fixed::{Poly, area2, clip, compare_keys, negate};
use crate::json::Record;
use crate::town::context::{Ctx, Item, ItemKind, Order, demand_of, mass_of, seed_key};
use crate::town::cut::{How, Share, Water, decide, lent, place};
use crate::town::partition::centre_out;
use crate::town::waterway::{CANAL, Into, RIVER, waterway};
use crate::tree::TreeNode;

/// More packages than this share islands, so an archipelago keeps about a dozen canals.
pub const ISLAND_CAP: i64 = 12;

/// Items laid together as one, of the given kind: their summed land and mass, their earliest appearance.
#[must_use]
pub fn group_of<'t>(key: String, items: Vec<Item<'t>>, kind: fn(Vec<Item<'t>>) -> ItemKind<'t>) -> Item<'t> {
    Item {
        key: Arc::from(key),
        demand: demand_of(&items),
        mass_mille: mass_of(&items),
        first_seen: items.iter().map(|i| i.first_seen).min().expect("a group holds items"),
        kind: kind(items),
    }
}

fn by_age(a: &Item, b: &Item) -> std::cmp::Ordering {
    a.first_seen
        .cmp(&b.first_seen)
        .then_with(|| compare_keys(&a.key, &b.key))
}

/// More than a dozen packages share islands: in age order, an island closes once its packages hold a twelfth of all
/// the packages' mass. The islands are remembered; a newcomer joins the last island unless it has closed.
fn island_groups<'t>(ctx: &mut Ctx<'t, '_>, node: &TreeNode, packages: &[Item<'t>]) -> Vec<Item<'t>> {
    let mass = |key: &str| {
        packages
            .iter()
            .find(|p| *p.key == *key)
            .expect("an island's package")
            .mass_mille
    };
    let total = mass_of(packages);
    let closed = |keys: &[String]| keys.iter().map(|k| mass(k)).sum::<i64>() * ISLAND_CAP >= total;
    let known = ctx.plat.islands.as_ref().and_then(|r| r.get(&*node.path)).cloned();
    let islands: Vec<Vec<String>> = match known {
        None => {
            let mut islands = Vec::new();
            let mut current: Vec<String> = Vec::new();
            for p in packages {
                current.push(p.key.to_string());
                if closed(&current) {
                    islands.push(std::mem::take(&mut current));
                }
            }
            if !current.is_empty() {
                islands.push(current);
            }
            let count = i64::try_from(islands.len()).expect("small");
            ctx.emit(
                "plat/islands",
                vec![("key", (&*node.path).into()), ("islands", count.into())],
            );
            islands
        }
        Some(known) => {
            let mut islands: Vec<Vec<String>> = known
                .into_iter()
                .map(|keys| {
                    keys.into_iter()
                        .filter(|k| packages.iter().any(|p| *p.key == **k))
                        .collect()
                })
                .collect();
            for p in packages {
                if islands.iter().flatten().any(|k| **k == *p.key) {
                    continue;
                }
                // A remembered grouping holds at least one island.
                let last = islands.last_mut().expect("a remembered island");
                if closed(last) {
                    islands.push(vec![p.key.to_string()]);
                    let island = i64::try_from(islands.len() - 1).expect("small");
                    ctx.emit(
                        "plat/island-founded",
                        vec![("key", (&*node.path).into()), ("island", island.into())],
                    );
                } else {
                    last.push(p.key.to_string());
                }
            }
            islands
        }
    };
    ctx.plat
        .islands
        .get_or_insert_with(Record::new)
        .insert(node.path.to_string(), islands.clone());
    let item = |key: &str| {
        packages
            .iter()
            .find(|p| *p.key == *key)
            .expect("an island's package")
            .clone()
    };
    islands
        .iter()
        .enumerate()
        .flat_map(|(g, keys)| {
            let members: Vec<Item<'t>> = keys.iter().map(|k| item(k)).collect();
            if members.len() <= 1 {
                members
            } else {
                vec![group_of(format!("{}#island{g}", node.path), members, ItemKind::Group)]
            }
        })
        .collect()
}

/// Cuts between islands and mainland, every cut a canal: the first 2.5 u wide, the rest 1.5 u, each its own tint.
#[allow(clippy::too_many_arguments)]
fn canals<'t>(
    ctx: &mut Ctx<'t, '_>,
    items: &[Item<'t>],
    poly: &Poly,
    mass_mille: i64,
    first: bool,
    key: &str,
    district: &str,
    fair: Option<Share>,
) {
    let share = match fair {
        Some(fair) if !first => fair,
        _ => Share {
            land2: area2(&poly.p),
            demand: demand_of(items),
        },
    };
    let how = How {
        share: Some(share),
        water: Some(Water::Canal),
        ..How::default()
    };
    let Some(decision) = decide(ctx, items, poly, mass_mille, first, key, how) else {
        place(ctx, poly, &items[0], district);
        return;
    };
    if let Some((part, sub)) = lent(&decision, key) {
        canals(ctx, &part, poly, mass_of(&part), false, &sub, district, Some(share));
        return;
    }
    let width = if first { RIVER } else { CANAL };
    let r = &decision.rec;
    waterway(ctx, poly, r, width, Into::Canals);
    let (key_l, key_r) = (format!("{key}>L"), format!("{key}>R"));
    canals(
        ctx,
        &decision.left,
        &clip(poly, r.n, r.c, width),
        mass_of(&decision.left),
        false,
        &key_l,
        &seed_key(&key_l),
        Some(share),
    );
    canals(
        ctx,
        &decision.right,
        &clip(poly, negate(r.n), -r.c, width),
        mass_of(&decision.right),
        false,
        &key_r,
        &seed_key(&key_r),
        Some(share),
    );
}

/// Archipelago: each package an island, the other items one mainland, canals between them. False declines (fewer
/// than two packages).
pub fn archipelago<'t>(
    ctx: &mut Ctx<'t, '_>,
    node: &'t TreeNode,
    items: &[Item<'t>],
    poly: &Poly,
    district: &str,
) -> bool {
    let is_island = |i: &Item| matches!(i.kind, ItemKind::Folder(n) if is_package(n));
    let packages: Vec<Item<'t>> = items.iter().filter(|i| is_island(i)).cloned().collect();
    if packages.len() < 2 {
        return false;
    }
    let islands = if i64::try_from(packages.len()).expect("small") > ISLAND_CAP {
        island_groups(ctx, node, &packages)
    } else {
        packages
    };
    let rest: Vec<Item<'t>> = items.iter().filter(|i| !is_island(i)).cloned().collect();
    let mainland = if rest.len() <= 1 {
        rest
    } else {
        vec![group_of(format!("{}#mainland", node.path), rest, ItemKind::Group)]
    };
    let mut ordered: Vec<Item<'t>> = islands.into_iter().chain(mainland).collect();
    ordered.sort_by(by_age);
    let ordered = if ctx.options.order == Order::CentreOut {
        centre_out(&ordered)
    } else {
        ordered
    };
    canals(ctx, &ordered, poly, node.mass_mille, true, &node.path, district, None);
    true
}
