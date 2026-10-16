//! Golden towns: the Rust layout writes the TypeScript engine's golden files byte for byte.
use serde::Serialize;

use crate::city::Town;
use crate::fixed::Pt;
use crate::json::canonical_json;
use crate::plat::TownPlat;
use crate::region::outline::outline_for;
use crate::testing::{sources, tree_of};
use crate::town::context::{Jog, LayoutOptions, Order};
use crate::town::layout::layout_town;
use crate::tree::TreeNode;

#[derive(Serialize)]
struct Golden<'a> {
    plat: &'a TownPlat,
    town: &'a Town,
}

fn lay(tree: &TreeNode, room: i64) -> String {
    let options = LayoutOptions {
        order: Order::CentreOut,
        jog: Jog::TopLevel,
        warp: true,
        density_pct: 50,
        loops: true,
        // With every toggle off, the golden towns are the towns laid before the toggles, byte for byte.
        toggles: vec![],
    };
    let outline = outline_for(tree.demand * 2 * room / 100, Pt::new(0, 0), "golden");
    let laid = layout_town(
        "golden",
        "golden",
        tree,
        &outline,
        TownPlat::default(),
        &options,
        None,
        None,
    );
    canonical_json(&Golden {
        plat: &laid.plat,
        town: &laid.draft.town(None),
    })
    .expect("a town serialises")
}

fn assert_same(actual: &str, expected: &str, name: &str) {
    if actual != expected {
        let at = actual
            .bytes()
            .zip(expected.bytes())
            .position(|(a, b)| a != b)
            .unwrap_or(actual.len().min(expected.len()));
        let from = at.saturating_sub(200);
        panic!(
            "{name} differs at byte {at}:\n  rust: {}\n  ts:   {}",
            &actual[from..(at + 200).min(actual.len())],
            &expected[from..(at + 200).min(expected.len())]
        );
    }
}

#[test]
fn lays_a_hamlet() {
    let tree = tree_of(&sources("", 20, 0));
    assert_same(
        &lay(&tree, 300),
        include_str!("../../../../../packages/ground-plan/src/town/__golden__/hamlet.json"),
        "hamlet",
    );
}

#[test]
fn lays_a_twin() {
    let mut files = sources("lib", 300, 0);
    files.extend(sources("kit", 250, 400));
    files.extend(sources("misc", 50, 800));
    assert_same(
        &lay(&tree_of(&files), 100),
        include_str!("../../../../../packages/ground-plan/src/town/__golden__/twin.json"),
        "twin",
    );
}

#[test]
fn lays_a_radial_town() {
    let mut files = sources("core", 400, 0);
    for (i, d) in ["north", "east", "south", "west", "up"].into_iter().enumerate() {
        files.extend(sources(d, 40, 500 + i64::try_from(i).expect("small") * 100));
    }
    assert_same(
        &lay(&tree_of(&files), 100),
        include_str!("../../../../../packages/ground-plan/src/town/__golden__/radial.json"),
        "radial",
    );
}
