//! The toggles' forms laid whole: corridor, archipelago, quarters and tiers, as the TypeScript tests lay them.
use std::collections::BTreeMap;
use std::sync::Arc;

use crate::archetype::Form;
use crate::city::Town;
use crate::constants::RoadClass;
use crate::fixed::{Pt, compare_keys};
use crate::json::canonical_json;
use crate::land_use::{classify_land_use, default_land_uses};
use crate::plat::TownPlat;
use crate::region::outline::outline_for;
use crate::roads::Tier;
use crate::snapshot::FileEntry;
use crate::testing::{snapshot_of, sources};
use crate::toggles::Toggle;
use crate::town::context::{Jog, LayoutOptions, Order, PlatEvent, Value};
use crate::town::layout::layout_town;
use crate::town::quarters::QUARTER_LAND;
use crate::tree::{Shares, TreeNode, TreeOptions, build_tree};

fn tree_at(entries: &[FileEntry], members: &[String], density_pct: i64) -> TreeNode {
    let snapshot = snapshot_of(entries);
    let options = TreeOptions {
        root: String::new(),
        exclude: vec![],
        land_uses: default_land_uses(),
        density_pct,
        members: members.to_vec(),
    };
    let built = build_tree(&snapshot, &snapshot.files, &options, &Shares::new(), &|_, f| {
        classify_land_use(&f.path)
    });
    Arc::unwrap_or_clone(built.tree)
}

fn tree(entries: &[FileEntry]) -> TreeNode {
    tree_at(entries, &[], 50)
}

struct Laid {
    town: Town,
    plat: TownPlat,
    events: Vec<PlatEvent>,
}

#[derive(Default)]
struct More {
    plat: Option<TownPlat>,
    land_of: Option<TreeNode>,
    density_pct: Option<i64>,
    root_form: Option<Form>,
    order: Option<Order>,
}

fn lay_more(root: &TreeNode, toggles: &[Toggle], more: More) -> Laid {
    let land_of = more.land_of.as_ref().unwrap_or(root);
    let outline = outline_for(land_of.demand * 2, Pt::new(0, 0), "demo");
    let options = LayoutOptions {
        order: more.order.unwrap_or(Order::CentreOut),
        jog: Jog::TopLevel,
        warp: false,
        density_pct: more.density_pct.unwrap_or(50),
        loops: true,
        toggles: toggles.to_vec(),
    };
    let laid = layout_town(
        "demo",
        "demo",
        root,
        &outline,
        more.plat.unwrap_or_default(),
        &options,
        more.root_form,
        None,
    );
    Laid {
        town: laid.draft.town(None),
        plat: laid.plat,
        events: laid.events,
    }
}

fn lay(root: &TreeNode, toggles: &[Toggle]) -> Laid {
    lay_more(root, toggles, More::default())
}

fn again(root: &TreeNode, toggles: &[Toggle], plat: &TownPlat, land_of: Option<&TreeNode>) -> Laid {
    lay_more(
        root,
        toggles,
        More {
            plat: Some(plat.clone()),
            land_of: land_of.cloned(),
            ..More::default()
        },
    )
}

fn codes(events: &[PlatEvent]) -> Vec<&'static str> {
    events.iter().map(|e| e.code).collect()
}

fn joined(parts: &[Vec<FileEntry>]) -> Vec<FileEntry> {
    parts.concat()
}

const CORRIDOR: &[Toggle] = &[Toggle::Corridor];
const ARCHIPELAGO: &[Toggle] = &[Toggle::Archipelago];
const QUARTERS: &[Toggle] = &[Toggle::Quarters];
const TIERS: &[Toggle] = &[Toggle::Tiers];

/// One folder holds nearly everything; three small ones and a few own files stand beside it.
fn corridor_repo(extra: &[FileEntry]) -> Vec<FileEntry> {
    joined(&[
        sources("main/x", 140, 0),
        sources("main/y", 140, 200),
        sources("main/z", 140, 400),
        sources("a", 8, 600),
        sources("b", 8, 700),
        sources("", 2, 800),
        extra.to_vec(),
    ])
}

#[test]
fn corridor_gathers_the_small_folders_into_one_faubourg_behind_a_gateway() {
    let laid = lay(&tree(&corridor_repo(&[])), CORRIDOR);
    assert_eq!(laid.town.form, Form::Corridor);
    let gate = &laid.plat.cuts[""];
    assert_eq!(gate.right, ["main"]);
    let mut left = gate.left.clone();
    left.sort_by(|a, b| compare_keys(a, b));
    assert_eq!(left, ["#lots", "a", "b"]);
    assert!(codes(&laid.events).contains(&"plat/gateway"));
    assert!(laid.plat.cuts.contains_key(">L"));
    assert_eq!(laid.plat.forms["main"], Form::Polycentric);
}

#[test]
fn corridor_is_laid_as_cuts_with_its_toggle_off() {
    let laid = lay(&tree(&corridor_repo(&[])), &[]);
    assert_eq!(laid.town.form, Form::Radial);
    assert!(!codes(&laid.events).contains(&"plat/gateway"));
}

#[test]
fn corridor_takes_a_newcomer_into_the_faubourg_without_moving_the_gateway_or_the_destination() {
    let first_tree = tree(&corridor_repo(&[]));
    let first = lay(&first_tree, CORRIDOR);
    let next = again(
        &tree(&corridor_repo(&sources("c", 4, 900))),
        CORRIDOR,
        &first.plat,
        Some(&first_tree),
    );
    assert!(next.plat.cuts[""].left.iter().any(|k| k == "c"));
    assert_eq!(next.plat.cuts[""].c, first.plat.cuts[""].c);
    let before: BTreeMap<&str, String> = first
        .town
        .lots
        .iter()
        .map(|l| (l.key.as_str(), canonical_json(&l.pts).expect("json")))
        .collect();
    let in_main: Vec<_> = next.town.lots.iter().filter(|l| l.path.starts_with("main/")).collect();
    assert_eq!(in_main.len(), 420);
    for lot in in_main {
        assert_eq!(canonical_json(&lot.pts).expect("json"), before[lot.key.as_str()]);
    }
}

#[test]
fn corridor_lays_its_faubourg_in_age_order_when_the_order_is_first_seen() {
    let more = More {
        order: Some(Order::FirstSeen),
        ..More::default()
    };
    assert_eq!(
        lay_more(&tree(&corridor_repo(&[])), CORRIDOR, more).town.form,
        Form::Corridor
    );
}

#[test]
fn corridor_declines_to_cuts_when_there_is_no_chain_or_nothing_beside_the_destination() {
    let flat = lay_more(
        &tree(&sources("", 300, 0)),
        CORRIDOR,
        More {
            root_form: Some(Form::Corridor),
            ..More::default()
        },
    );
    assert!(flat.plat.cuts.get("").is_none_or(|c| c.right != ["main"]));
    let lone = lay(
        &tree(&joined(&[sources("main/x", 140, 0), sources("main/y", 140, 200)])),
        CORRIDOR,
    );
    assert!(!codes(&lone.events).contains(&"plat/gateway"));
}

#[test]
fn corridor_walks_a_chain_of_corridors_to_the_first_folder_that_is_none() {
    let chained = joined(&[
        sources("main/core/x", 140, 0),
        sources("main/core/y", 140, 200),
        sources("main/core/z", 140, 400),
        sources("main/util", 6, 600),
        sources("a", 8, 700),
        sources("", 2, 800),
    ]);
    let laid = lay(&tree(&chained), CORRIDOR);
    assert_eq!(laid.plat.forms["main"], Form::Corridor);
    assert_eq!(laid.plat.cuts[""].right, ["main/core"]);
    assert!(laid.plat.cuts[""].left.iter().any(|k| k == "main/util"));
    let level = laid
        .town
        .districts
        .iter()
        .find(|d| d.path == "main")
        .expect("the chain's level");
    assert_eq!((level.form, level.ward), (Some(Form::Corridor), false));
}

#[test]
fn corridor_switches_a_folder_that_grows_into_a_corridor_of_the_chain() {
    let even = joined(&[
        sources("main/x", 140, 0),
        sources("main/y", 140, 200),
        sources("main/z", 140, 400),
        sources("a", 8, 700),
    ]);
    let first = lay(&tree(&even), CORRIDOR);
    assert_eq!(first.plat.forms["main"], Form::Polycentric);
    let dominated = joined(&[
        sources("main/x", 2000, 0),
        sources("main/y", 10, 200),
        sources("a", 8, 700),
    ]);
    let next = again(&tree(&dominated), CORRIDOR, &first.plat, None);
    assert_eq!(next.plat.forms["main"], Form::Corridor);
    assert!(next.events.iter().any(|e| e.code == "plat/switch"
        && e.detail.iter().any(|(k, v)| *k == "path" && *v == Value::from("main"))));
}

#[test]
fn corridor_lays_afresh_when_its_destination_changes() {
    let first = lay(&tree(&corridor_repo(&[])), CORRIDOR);
    let regrown = joined(&[
        sources("main/x", 140, 0),
        sources("main/y", 140, 200),
        sources("main/z", 140, 400),
        sources("a", 9000, 600),
    ]);
    let next = again(&tree(&regrown), CORRIDOR, &first.plat, None);
    assert!(codes(&next.events).contains(&"plat/corridor-destination"));
    assert_eq!(next.plat.cuts[""].right, ["a"]);
}

fn package(name: &str, n: usize, born: i64) -> Vec<FileEntry> {
    let mut entries = vec![FileEntry::new(
        &format!("{name}/package.json"),
        &format!("{name}/package.json@{born}"),
        born,
    )];
    entries.extend(sources(&format!("{name}/src"), n, born + 1));
    entries
}

fn islands(count: i64, n: usize) -> Vec<FileEntry> {
    (0..count).flat_map(|i| package(&format!("p{i}"), n, i * 100)).collect()
}

fn members(count: i64) -> Vec<String> {
    (0..count).map(|i| format!("p{i}")).collect()
}

fn islanded(entries: &[FileEntry], count: i64) -> TreeNode {
    tree_at(entries, &members(count), 50)
}

#[test]
fn archipelago_makes_each_package_an_island_with_canals_and_bridges_between_them() {
    let entries = joined(&[islands(4, 60), sources("", 3, 5000), sources("tools", 5, 6000)]);
    let laid = lay(&islanded(&entries, 4), ARCHIPELAGO);
    assert_eq!(laid.town.form, Form::Archipelago);
    assert_eq!(laid.plat.cuts.values().filter(|c| c.canal).count(), 4);
    assert_eq!(laid.town.canals.len(), 4);
    assert!(laid.plat.cuts.get("#mainland").is_none_or(|c| !c.canal));
    assert!(laid.town.roads.iter().filter(|r| r.cls == RoadClass::Street).count() >= 4);
}

#[test]
fn archipelago_lays_packages_as_cuts_with_its_toggle_off_and_draws_no_canals() {
    let laid = lay(&islanded(&islands(4, 60), 4), &[]);
    assert_ne!(laid.town.form, Form::Archipelago);
    assert_eq!(laid.town.canals.len(), 0);
}

#[test]
fn archipelago_shares_islands_beyond_a_dozen_packages_and_remembers_them() {
    let fourteen = islanded(&islands(14, 30), 14);
    let first = lay(&fourteen, ARCHIPELAGO);
    let grouped = first.plat.islands.as_ref().expect("islands")[""].clone();
    assert_eq!(grouped.iter().flatten().count(), 14);
    assert!(grouped.len() < 14);
    assert!(codes(&first.events).contains(&"plat/islands"));
    let next = again(
        &islanded(&islands(15, 30), 15),
        ARCHIPELAGO,
        &first.plat,
        Some(&fourteen),
    );
    let after = &next.plat.islands.as_ref().expect("islands")[""];
    assert!(after.iter().flatten().any(|k| k == "p14"));
    assert_eq!(after[..grouped.len() - 1], grouped[..grouped.len() - 1]);
    assert!(codes(&next.events).contains(&"plat/island-founded"));
    let later = again(
        &islanded(&islands(16, 30), 16),
        ARCHIPELAGO,
        &next.plat,
        Some(&fourteen),
    );
    let last = later.plat.islands.as_ref().expect("islands")[""].last().cloned();
    assert_eq!(last, Some(vec!["p14".to_owned(), "p15".to_owned()]));
}

#[test]
fn archipelago_keeps_a_remainder_of_packages_as_the_last_island() {
    // Thirteen equal packages of one age, so in key order: islands of two close at a twelfth, the last stands alone.
    let laid = lay(&islanded(&islands(13, 30), 13), ARCHIPELAGO);
    let last = laid.plat.islands.as_ref().expect("islands")[""].last().cloned();
    assert_eq!(last, Some(vec!["p9".to_owned()]));
}

#[test]
fn archipelago_lays_in_age_order_when_the_order_is_first_seen_and_declines_without_packages() {
    let aged = lay_more(
        &islanded(&islands(4, 60), 4),
        ARCHIPELAGO,
        More {
            order: Some(Order::FirstSeen),
            ..More::default()
        },
    );
    assert_eq!(aged.town.canals.len(), 3);
    let none = lay_more(
        &tree(&islands(4, 60)),
        ARCHIPELAGO,
        More {
            root_form: Some(Form::Archipelago),
            ..More::default()
        },
    );
    assert_eq!(none.town.canals.len(), 0);
}

#[test]
fn archipelago_lends_an_island_s_land_to_its_neighbour_when_its_package_goes() {
    let four = islanded(&joined(&[islands(4, 60), sources("", 3, 5000)]), 4);
    let first = lay(&four, ARCHIPELAGO);
    let three: Vec<FileEntry> = joined(&[islands(4, 60), sources("", 3, 5000)])
        .into_iter()
        .filter(|f| !f.path.starts_with("p3/"))
        .collect();
    let next = again(&islanded(&three, 3), ARCHIPELAGO, &first.plat, Some(&four));
    assert_eq!(next.town.form, Form::Archipelago);
    assert_eq!(next.town.canals.len(), 3);
}

#[test]
fn archipelago_forgets_its_islands_when_the_folder_stops_being_one() {
    let first = lay(&islanded(&islands(14, 30), 14), ARCHIPELAGO);
    let plain = again(&tree(&islands(14, 30)), ARCHIPELAGO, &first.plat, None);
    assert_ne!(plain.town.form, Form::Archipelago);
    assert!(plain.plat.islands.is_none());
}

fn fan(count: usize) -> Vec<FileEntry> {
    (0..count)
        .flat_map(|i| sources(&format!("f{i:02}"), 24, i64::try_from(i).expect("small") * 50))
        .collect()
}

fn quarter_lists(laid: &Laid) -> Vec<Vec<String>> {
    laid.plat.quarters.as_ref().expect("quarters")[""].clone()
}

#[test]
fn quarters_group_similar_small_folders_each_a_ward_cut_by_streets() {
    let laid = lay(&tree(&fan(40)), QUARTERS);
    assert_eq!(laid.town.form, Form::Quarters);
    let quarters = quarter_lists(&laid);
    assert_eq!(quarters.iter().flatten().count(), 40);
    assert!(quarters.len() > 1);
    assert!(codes(&laid.events).contains(&"plat/quarters"));
    let wards: Vec<_> = laid
        .town
        .districts
        .iter()
        .filter(|d| d.form == Some(Form::Quarters))
        .collect();
    assert_eq!(wards.len(), quarters.len());
    assert!(wards.iter().all(|d| d.ward));
    let inside: Vec<_> = laid.plat.cuts.iter().filter(|(k, _)| k.starts_with("#q")).collect();
    assert_ne!(inside.len(), 0);
    assert!(
        inside
            .iter()
            .all(|(_, c)| c.cls == RoadClass::Street && c.row == Some(RoadClass::Street))
    );
}

#[test]
fn quarters_keep_their_members_as_a_newcomer_joins_the_last_one() {
    let forty = tree(&fan(40));
    let first = lay(&forty, QUARTERS);
    let grown = joined(&[fan(40), sources("f40", 24, 9000)]);
    let next = again(&tree(&grown), QUARTERS, &first.plat, Some(&forty));
    let (before, after) = (quarter_lists(&first), quarter_lists(&next));
    assert_eq!(after[..after.len() - 1], before[..before.len() - 1]);
    assert!(after.iter().flatten().any(|k| k == "f40"));
}

#[test]
fn quarters_open_a_new_quarter_when_the_last_is_full_and_lend_a_gone_member_s_land() {
    let forty = tree(&fan(40));
    let first = lay(&forty, QUARTERS);
    let before = quarter_lists(&first);
    let more: Vec<FileEntry> = (0..30)
        .flat_map(|i| sources(&format!("g{i:02}"), 24, 9000 + i * 50))
        .collect();
    let grown = again(&tree(&joined(&[fan(40), more])), QUARTERS, &first.plat, Some(&forty));
    assert!(quarter_lists(&grown).len() > before.len());
    assert!(codes(&grown.events).contains(&"plat/quarter-opened"));
    let gone = before[0][0].clone();
    let fewer: Vec<FileEntry> = fan(40)
        .into_iter()
        .filter(|f| !f.path.starts_with(&format!("{gone}/")))
        .collect();
    let shrunk = again(&tree(&fewer), QUARTERS, &first.plat, Some(&forty));
    assert!(!quarter_lists(&shrunk)[0].contains(&gone));
    assert_eq!(shrunk.town.lots.iter().filter(|l| !l.vacant).count(), fewer.len());
}

#[test]
fn quarters_keep_an_emptied_quarter_s_place_and_a_quarter_of_own_files_only() {
    let owned = joined(&[sources("", 24, 0), fan(40)]);
    let owned_tree = tree(&owned);
    let first = lay(&owned_tree, QUARTERS);
    let lists = quarter_lists(&first);
    let (q0, q1) = (lists[0].clone(), lists[1].clone());
    assert_eq!(q0[0], "#lots");
    let kept: Vec<FileEntry> = owned
        .iter()
        .filter(|f| !q0.iter().any(|k| k != "#lots" && f.path.starts_with(&format!("{k}/"))))
        .cloned()
        .collect();
    let thinned = again(&tree(&kept), QUARTERS, &first.plat, Some(&owned_tree));
    assert_eq!(quarter_lists(&thinned)[0], ["#lots"]);
    assert!(!thinned.town.districts.iter().any(|d| d.path == "#q0"));
    let rest: Vec<FileEntry> = owned
        .iter()
        .filter(|f| !q1.iter().any(|k| f.path.starts_with(&format!("{k}/"))))
        .cloned()
        .collect();
    let emptied = again(&tree(&rest), QUARTERS, &first.plat, Some(&owned_tree));
    assert_eq!(quarter_lists(&emptied)[1].len(), 0);
    assert!(!emptied.town.districts.iter().any(|d| d.path == "#q1"));
}

#[test]
fn quarters_join_a_small_last_quarter_to_the_one_before_and_keep_one_for_a_few_folders() {
    let counts = |n: usize| -> Vec<usize> {
        quarter_lists(&lay(&tree(&fan(n)), QUARTERS))
            .iter()
            .map(Vec::len)
            .collect()
    };
    assert_eq!(counts(25), [25]);
    assert_eq!(counts(46), [23, 23]);
    assert_eq!(counts(10), [10]);
}

#[test]
fn quarters_close_at_24_blocks_of_land() {
    let laid = lay(&tree(&fan(40)), QUARTERS);
    let demand = tree(&fan(1)).demand;
    assert_eq!(
        i64::try_from(quarter_lists(&laid)[0].len()).expect("small"),
        (QUARTER_LAND + demand - 1) / demand
    );
}

#[test]
fn quarters_leave_a_folder_that_does_not_flatten_outside_every_quarter() {
    let big = joined(&[sources("big/x", 150, 3000), sources("big/y", 150, 3200)]);
    let laid = lay(&tree(&joined(&[fan(40), big])), QUARTERS);
    assert!(!laid.plat.forms["big"].is_flat());
    let lists = quarter_lists(&laid);
    assert_eq!(lists.iter().flatten().count(), 40);
    assert!(!lists.iter().flatten().any(|k| k == "big"));
}

#[test]
fn quarters_lay_in_age_order_when_the_order_is_first_seen_and_decline_with_one_small_item() {
    let aged = lay_more(
        &tree(&fan(40)),
        QUARTERS,
        More {
            order: Some(Order::FirstSeen),
            ..More::default()
        },
    );
    assert_eq!(aged.town.form, Form::Quarters);
    let one = joined(&[
        sources("big/x", 150, 0),
        sources("big/y", 150, 200),
        sources("s", 24, 400),
    ]);
    let declined = lay_more(
        &tree(&one),
        QUARTERS,
        More {
            root_form: Some(Form::Quarters),
            ..More::default()
        },
    );
    assert!(declined.plat.quarters.is_none());
}

#[test]
fn quarters_are_forgotten_when_the_folder_stops_taking_them() {
    let first = lay(&tree(&fan(40)), QUARTERS);
    let one = again(
        &tree(&joined(&[fan(40), sources("huge", 3000, 9000)])),
        QUARTERS,
        &first.plat,
        None,
    );
    assert_ne!(one.town.form, Form::Quarters);
    assert!(one.plat.quarters.is_none());
}

#[test]
fn quarters_are_laid_as_cuts_with_their_toggle_off() {
    let laid = lay(&tree(&fan(40)), &[]);
    assert_eq!(laid.town.form, Form::Polycentric);
    assert!(laid.plat.quarters.is_none());
}

#[test]
fn tiers_give_the_town_one_road_of_its_top_class() {
    // A village-tier town (240 files of mass) with a nested folder whose own first cut would be a collector by mass.
    let village = joined(&[
        sources("a/x", 60, 0),
        sources("a/y", 60, 100),
        sources("b", 60, 200),
        sources("c", 60, 300),
    ]);
    let root = tree_at(&village, &[], 20);
    let at20 = |toggles: &[Toggle]| {
        lay_more(
            &root,
            toggles,
            More {
                density_pct: Some(20),
                ..More::default()
            },
        )
    };
    let (tiered, plain) = (at20(TIERS), at20(&[]));
    assert_eq!(tiered.plat.tier, Some(Tier::Village));
    assert_eq!(plain.plat.tier, None);
    let collectors = |laid: &Laid| laid.town.roads.iter().filter(|r| r.cls == RoadClass::Collector).count();
    assert!(collectors(&plain) > 1);
    assert_eq!(collectors(&tiered), 1);
    let a = &tiered.plat.cuts["a"];
    assert_eq!((a.cls, a.row), (RoadClass::Street, Some(RoadClass::Street)));
}

#[test]
fn tiers_narrow_a_village_s_high_street_to_a_street() {
    let laid = lay(&tree(&sources("", 60, 0)), TIERS);
    assert_eq!(laid.town.form, Form::StreetVillage);
    assert!(laid.plat.grids[""].high.is_some());
    assert!(!laid.town.roads.iter().any(|r| r.cls == RoadClass::Collector));
}

#[test]
fn tiers_report_a_change_of_tier() {
    let small = tree(&sources("", 20, 0));
    let first = lay(&small, TIERS);
    let grown = again(&tree(&sources("", 60, 0)), TIERS, &first.plat, Some(&small));
    assert_eq!(first.plat.tier, Some(Tier::Hamlet));
    let tier = grown
        .events
        .iter()
        .find(|e| e.code == "plat/tier")
        .expect("a tier event");
    assert_eq!(tier.line(), "plat/tier key=demo from=hamlet to=village");
}
