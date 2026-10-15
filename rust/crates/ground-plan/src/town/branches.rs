//! The layout's edge cases: pinwheel guards, radial and twin fallbacks, and every neighbourhood branch.
use crate::archetype::Form;
use crate::city::{BlockKind, Town};
use crate::constants::RoadClass;
use crate::fixed::{DIRECTION, Poly, Pt, TURN, area2};
use crate::land_use::LandUse;
use crate::plat::TownPlat;
use crate::region::outline::outline_for;
use crate::snapshot::FileEntry;
use crate::testing::{layout_options, rect, sources, tree_of};
use crate::town::context::{Ctx, Jog, LayoutOptions, PlatEvent};
use crate::town::cut::{park, reserve, trim};
use crate::town::layout::layout_town;
use crate::town::neighbourhood::neighbourhood;
use crate::town::partition::sector;
use crate::tree::{LotSeed, TreeNode};

struct Laid {
    town: Town,
    plat: TownPlat,
}

fn lay_with(tree: &TreeNode, plat: TownPlat, options: &LayoutOptions, land_of: &TreeNode, form: Option<Form>) -> Laid {
    let outline = outline_for(land_of.demand * 2, Pt::new(0, 0), "demo");
    let laid = layout_town("demo", "demo", tree, &outline, plat, options, form, None);
    Laid {
        town: laid.draft.town(None),
        plat: laid.plat,
    }
}

fn lay(tree: &TreeNode) -> Laid {
    lay_with(tree, TownPlat::default(), &layout_options(), tree, None)
}

fn plazas(town: &Town) -> usize {
    town.blocks.iter().filter(|b| b.kind == BlockKind::Plaza).count()
}

const SIZES: [usize; 6] = [150, 60, 200, 90, 120, 180];
const NAMES: [&str; 6] = ["a", "b", "c", "d", "e", "f"];

fn varied() -> Vec<FileEntry> {
    NAMES
        .iter()
        .zip(SIZES)
        .zip(0..)
        .flat_map(|((d, n), i)| sources(d, n, i * 300))
        .collect()
}

fn seeds(n: usize) -> Vec<LotSeed> {
    sources("", n, 0)
        .into_iter()
        .map(|f| LotSeed {
            key: f.identity.clone(),
            path: f.path.clone(),
            land_use: LandUse::Source,
            first_seen: f.first_seen,
        })
        .collect()
}

fn docs(folder: &str, n: i64, born: i64) -> Vec<FileEntry> {
    (0..n)
        .map(|k| FileEntry::new(&format!("{folder}/doc-{k}.md"), &format!("{folder}-{k}"), born + k))
        .collect()
}

fn boxed(x: i64, y: i64, w: i64, h: i64) -> Poly {
    Poly::uniform(
        &[
            Pt::new(x, y),
            Pt::new(x + w, y),
            Pt::new(x + w, y + h),
            Pt::new(x, y + h),
        ],
        0,
    )
}

fn codes(events: &[PlatEvent]) -> Vec<&'static str> {
    events.iter().map(|e| e.code).collect()
}

/// A neighbourhood laid on fresh context over a plat; returns the context's outcome.
struct Hood {
    plat: TownPlat,
    events: Vec<PlatEvent>,
    lots: usize,
    roads: usize,
    overflow: i64,
}

fn hood(plat: TownPlat, land: &Poly, lots: &[LotSeed], park_demand: i64, key: &str, form: Form) -> Hood {
    let (options, root) = (layout_options(), tree_of(&[]));
    let mut ctx = Ctx::new(&options, plat, &root, 0);
    neighbourhood(&mut ctx, land, lots, park_demand, key, "d", form);
    Hood {
        events: ctx.events,
        lots: ctx.lots.len(),
        roads: ctx.roads.len(),
        overflow: ctx.overflow,
        plat: ctx.plat,
    }
}

#[test]
fn leaves_land_too_small_for_pavement_empty() {
    let (options, root) = (layout_options(), tree_of(&[]));
    let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
    park(&mut ctx, &rect(10, 10), "d");
    reserve(&mut ctx, &rect(10, 10), "d");
    assert_eq!(ctx.blocks.len(), 0);
}

#[test]
fn trims_either_way_round_and_keeps_or_drops_a_square_segment_whole() {
    let seg = [Pt::new(0, 0), Pt::new(100, 0)];
    let east = [DIRECTION, 0];
    assert_eq!(
        trim(Some(seg), east, Some(20 * DIRECTION), None),
        Some(vec![Pt::new(20, 0), Pt::new(100, 0)])
    );
    assert_eq!(
        trim(Some([seg[1], seg[0]]), east, None, Some(30 * DIRECTION)),
        Some(vec![Pt::new(30, 0), Pt::new(0, 0)])
    );
    assert_eq!(trim(Some(seg), east, Some(200 * DIRECTION), None), None);
    let north = [0, DIRECTION];
    assert_eq!(trim(Some(seg), north, Some(-1), Some(1)), Some(seg.to_vec()));
    assert_eq!(trim(Some(seg), north, Some(5), None), None);
    assert_eq!(trim(Some(seg), north, None, Some(-5)), None);
}

#[test]
fn jogs_nested_cuts_when_every_cut_may_and_keeps_a_straight_crossroads_when_cross_cuts_line_up() {
    let all = LayoutOptions {
        jog: Jog::All,
        ..layout_options()
    };
    let tree = tree_of(&varied());
    assert!(plazas(&lay_with(&tree, TownPlat::default(), &all, &tree, None).town) >= plazas(&lay(&tree).town));
    let even: Vec<FileEntry> = NAMES
        .iter()
        .zip(0..)
        .flat_map(|(d, i)| sources(d, 150, i * 300))
        .collect();
    assert_eq!(plazas(&lay(&tree_of(&even)).town), 0);
}

#[test]
fn does_not_jog_cuts_remembered_without_jogs_and_stops_jogging_when_a_quarter_empties() {
    let tree = tree_of(&varied());
    let off = LayoutOptions {
        jog: Jog::Off,
        ..layout_options()
    };
    let first = lay_with(&tree, TownPlat::default(), &off, &tree, None);
    assert_eq!(
        plazas(&lay_with(&tree, first.plat, &layout_options(), &tree, None).town),
        0
    );
    let first = lay(&tree);
    let quarter = first.plat.cuts[">L"].left[0].clone();
    let rest: Vec<FileEntry> = varied()
        .into_iter()
        .filter(|f| !f.path.starts_with(&format!("{quarter}/")))
        .collect();
    assert_eq!(
        plazas(&lay_with(&tree_of(&rest), first.plat, &layout_options(), &tree, None).town),
        0
    );
}

#[test]
fn does_not_jog_a_short_cut_deep_inside_a_big_town() {
    let shares = [60, 30, 80, 40, 70, 35, 65, 50];
    let mut all = docs("park", 10_000, 0);
    for (i, q) in ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].iter().enumerate() {
        let born = 20_000 + i64::try_from(i).expect("small") * 100;
        all.extend(sources(&format!("small/{q}"), 2, born));
        all.extend(docs(&format!("small/{q}"), shares[i], born + 10));
    }
    let tree = tree_of(&all);
    let laid = lay_with(
        &tree,
        TownPlat::default(),
        &LayoutOptions {
            jog: Jog::All,
            ..layout_options()
        },
        &tree,
        None,
    );
    assert!(laid.plat.cuts.keys().any(|k| k.starts_with("small")));
    assert_eq!(laid.town.stats.lots, 16);
}

#[test]
fn jogs_streets_between_small_folders_and_leaves_no_plaza_where_a_boulevard_is_wider_than_the_jog() {
    let park_sizes = [120, 50, 160, 80, 100, 140];
    let parks: Vec<FileEntry> = NAMES
        .iter()
        .zip(0..)
        .flat_map(|(d, i)| {
            let mut list = sources(d, 4, i * 300);
            list.extend(
                (0..park_sizes[usize::try_from(i).expect("small")])
                    .map(|k| FileEntry::new(&format!("{d}/doc-{k}.md"), &format!("{d}-doc-{k}"), i * 300 + 10 + k)),
            );
            list
        })
        .collect();
    let town = lay(&tree_of(&parks)).town;
    assert!(
        !town
            .roads
            .iter()
            .any(|r| matches!(r.cls, RoadClass::Collector | RoadClass::Avenue))
    );
    assert!(plazas(&town) > 0);
    let mid_sizes = [56, 21, 70, 31, 42, 60];
    let mid: Vec<FileEntry> = NAMES
        .iter()
        .zip(mid_sizes)
        .zip(0..)
        .flat_map(|((d, n), i)| sources(d, n, i * 300))
        .collect();
    let town = lay(&tree_of(&mid)).town;
    assert!(town.roads.iter().any(|r| r.cls == RoadClass::Collector) && plazas(&town) > 0);
    let city_sizes = [560, 320, 640, 400, 480, 600];
    let city: Vec<FileEntry> = NAMES
        .iter()
        .zip(city_sizes)
        .zip(0..)
        .flat_map(|((d, n), i)| sources(d, n, i * 1000))
        .collect();
    let town = lay(&tree_of(&city)).town;
    assert!(town.roads.iter().any(|r| r.cls == RoadClass::Boulevard));
    assert_eq!(plazas(&town), 0);
}

fn radial_repo() -> Vec<FileEntry> {
    let mut all = sources("core", 400, 0);
    for (d, i) in ["n", "e", "s", "w", "u"].iter().zip(0..) {
        all.extend(sources(d, 40, 500 + i * 100));
    }
    all
}

#[test]
fn re_centres_on_a_new_core_when_another_child_outgrows_it() {
    let first = lay(&tree_of(&radial_repo()));
    let mut grown: Vec<FileEntry> = radial_repo()
        .into_iter()
        .filter(|f| !f.path.starts_with("core/"))
        .collect();
    grown.extend(sources("core", 40, 0));
    grown.extend(crate::testing::files("n", 600, 3000, "ts", "g"));
    let second = lay_with(
        &tree_of(&grown),
        first.plat,
        &layout_options(),
        &tree_of(&radial_repo()),
        None,
    );
    assert_ne!(
        second
            .plat
            .radial
            .get("")
            .map_or_else(|| second.town.form.to_string(), |r| r.core.clone()),
        "core"
    );
}

#[test]
fn declines_a_ring_item_that_needs_more_than_171_degrees_or_whose_docs_need_more_than_half_the_land() {
    let mut all = sources("core", 600, 0);
    all.extend(sources("a", 200, 1000));
    all.extend(sources("b", 20, 2000));
    all.extend(sources("c", 20, 3000));
    let laid = lay(&tree_of(&all));
    assert_eq!(laid.town.form, Form::Radial);
    assert!(!laid.plat.radial.contains_key(""));
    let mut heavy = sources("core", 400, 0);
    heavy.extend(sources("a", 10, 900));
    heavy.extend((0..3000).map(|k| FileEntry::new(&format!("a/doc-{k}.md"), &format!("doc-{k}"), 1000 + k)));
    for (d, i) in ["b", "c", "d"].iter().zip(0..) {
        heavy.extend(sources(d, 10, 5000 + i * 1000));
    }
    let laid = lay(&tree_of(&heavy));
    assert_eq!(laid.town.form, Form::Radial);
    assert!(!laid.plat.radial.contains_key(""));
}

#[test]
fn falls_back_to_cuts_when_the_region_forces_a_form_the_folder_cannot_take() {
    let mut flat = sources("", 200, 0);
    flat.extend(sources("only", 300, 500));
    let tree = tree_of(&flat);
    assert_eq!(
        lay_with(&tree, TownPlat::default(), &layout_options(), &tree, Some(Form::Twin))
            .town
            .form,
        Form::Twin
    );
    let no_folders = tree_of(&sources("", 300, 0));
    let forced = lay_with(
        &no_folders,
        TownPlat::default(),
        &layout_options(),
        &no_folders,
        Some(Form::Radial),
    );
    assert_eq!((forced.town.form, forced.town.stats.lots), (Form::Radial, 300));
}

#[test]
fn bridges_short_rivers_and_balances_a_twin_s_extra_folders_keeping_an_emptied_bank_as_reserve() {
    let mut small = sources("lib", 30, 0);
    small.extend(sources("kit", 25, 100));
    small.extend(sources("x", 5, 200));
    let tree = tree_of(&small);
    let town = lay_with(&tree, TownPlat::default(), &layout_options(), &tree, Some(Form::Twin)).town;
    assert_eq!(town.form, Form::Twin);
    assert!(
        town.roads
            .iter()
            .any(|r| r.cls == RoadClass::Street && r.pts.len() == 2)
    );
    let mut tiny = sources("lib", 6, 0);
    tiny.extend(sources("kit", 5, 100));
    tiny.extend(sources("x", 1, 200));
    let tree = tree_of(&tiny);
    assert_eq!(
        lay_with(&tree, TownPlat::default(), &layout_options(), &tree, Some(Form::Twin))
            .town
            .water
            .len(),
        1
    );
    let mut repo = sources("lib", 300, 0);
    repo.extend(sources("kit", 250, 400));
    repo.extend(sources("x", 60, 800));
    repo.extend(sources("y", 10, 900));
    let whole = tree_of(&repo);
    let first = lay(&whole);
    assert!(first.plat.cuts[""].left.iter().any(|k| k == "y"));
    let rest: Vec<FileEntry> = repo
        .into_iter()
        .filter(|f| !f.path.starts_with("kit/") && !f.path.starts_with("x/"))
        .collect();
    let second = lay_with(&tree_of(&rest), first.plat, &layout_options(), &whole, Some(Form::Twin));
    assert!(second.town.blocks.iter().any(|b| b.kind == BlockKind::Reserve));
}

#[test]
fn gives_a_zero_width_sector_the_land_between_its_spokes_only() {
    let land = rect(1000, 1000);
    assert_eq!(area2(&sector(&land, Pt::new(500, 500), 0, 0, 500, 0, 0).p), 0);
    assert!(area2(&sector(&land, Pt::new(500, 500), 0, TURN / 4, 500, 0, 0).p) > 0);
}

#[test]
fn keeps_a_remembered_park_line_and_warp_scale() {
    let mut all = sources("", 40, 0);
    all.extend((0..30).map(|i| FileEntry::new(&format!("guide-{i}.md"), &format!("g{i}"), i)));
    let tree = tree_of(&all);
    let warped = LayoutOptions {
        warp: true,
        ..layout_options()
    };
    let first = lay_with(&tree, TownPlat::default(), &warped, &tree, None);
    let second = lay_with(&tree, first.plat.clone(), &warped, &tree, None);
    assert_eq!(second.plat.grids[""].park, first.plat.grids[""].park);
    assert_eq!(second.plat.diameter, first.plat.diameter);
}

#[test]
fn lays_single_rows_on_narrow_land_and_narrows_the_class_on_clipped_blocks() {
    let narrow = hood(TownPlat::default(), &rect(1700, 200), &seeds(30), 0, "k", Form::Hamlet);
    assert_eq!(narrow.plat.grids["k"].green, None);
    assert_eq!(narrow.lots, 30);
    let trapezoid = Poly::uniform(
        &[Pt::new(0, 0), Pt::new(500, 0), Pt::new(300, 700), Pt::new(100, 700)],
        0,
    );
    assert_eq!(
        hood(TownPlat::default(), &trapezoid, &seeds(8), 0, "k", Form::Neighbourhood).lots,
        8
    );
}

#[test]
fn narrows_its_lot_class_and_re_lays_when_its_lots_outgrow_their_slots() {
    let first = hood(
        TownPlat::default(),
        &rect(1800, 900),
        &seeds(10),
        0,
        "k",
        Form::Neighbourhood,
    );
    let wide = first.plat.grids["k"].span;
    assert!(wide > 1);
    let later = hood(first.plat, &rect(1800, 900), &seeds(60), 0, "k", Form::Neighbourhood);
    assert!(later.plat.grids["k"].span < wide);
    assert_eq!(later.overflow, 0);
    assert!(codes(&later.events).contains(&"plat/narrow"));
}

#[test]
fn lays_a_park_line_afresh_when_it_no_longer_crosses_its_land() {
    let first = hood(
        TownPlat::default(),
        &rect(1800, 900),
        &seeds(20),
        400 * 3000,
        "k",
        Form::Neighbourhood,
    );
    let elsewhere = boxed(5000, 5000, 1800, 900);
    let moved = hood(first.plat, &elsewhere, &seeds(20), 400 * 3000, "k", Form::Neighbourhood);
    assert_eq!((moved.overflow, moved.lots), (0, 20));
}

#[test]
fn lays_its_park_line_afresh_when_its_land_grew_on_the_park_s_side_and_the_lots_no_longer_fit() {
    let first = hood(
        TownPlat::default(),
        &boxed(0, 0, 1200, 900),
        &seeds(10),
        3000,
        "k",
        Form::Neighbourhood,
    );
    let n = first.plat.grids["k"].park.expect("a park line").n;
    let grown = if n[0].abs() > n[1].abs() {
        boxed(if n[0] > 0 { 0 } else { -6000 }, 0, 7200, 900)
    } else {
        boxed(0, if n[1] > 0 { 0 } else { -6000 }, 1200, 6900)
    };
    let moved = hood(first.plat, &grown, &seeds(200), 3000, "k", Form::Neighbourhood);
    assert!(codes(&moved.events).contains(&"plat/repark"));
    assert_eq!((moved.overflow, moved.lots), (0, 200));
}

#[test]
fn keeps_its_park_line_when_a_fresh_one_would_seat_no_more_lots_or_leave_no_land() {
    let first = hood(
        TownPlat::default(),
        &boxed(0, 0, 1200, 900),
        &seeds(10),
        3000,
        "k",
        Form::Neighbourhood,
    );
    let crowded = hood(
        first.plat,
        &boxed(0, 0, 1200, 900),
        &seeds(400),
        3000,
        "k",
        Form::Neighbourhood,
    );
    assert!(!codes(&crowded.events).contains(&"plat/repark"));
    let thin = hood(
        TownPlat::default(),
        &boxed(0, 0, 2000, 90),
        &seeds(1),
        10,
        "t",
        Form::Neighbourhood,
    );
    let grown = hood(
        thin.plat,
        &boxed(0, 0, 2000, 90),
        &seeds(500),
        1_000_000_000,
        "t",
        Form::Neighbourhood,
    );
    assert!(!codes(&grown.events).contains(&"plat/repark"));
}

#[test]
fn lays_its_park_line_afresh_when_the_remembered_one_leaves_the_lots_no_land_at_all() {
    let first = hood(
        TownPlat::default(),
        &boxed(0, 0, 1200, 900),
        &seeds(10),
        3000,
        "k",
        Form::Neighbourhood,
    );
    let line = first.plat.grids["k"].park.expect("a park line");
    assert_eq!(line.n, [0, 4096]);
    let edge = line.c.div_euclid(4096);
    let moved = hood(
        first.plat.clone(),
        &boxed(0, edge - 6, 1200, 2000),
        &seeds(10),
        3000,
        "k",
        Form::Neighbourhood,
    );
    assert!(codes(&moved.events).contains(&"plat/repark"));
    assert_eq!((moved.overflow, moved.lots), (0, 10));
    let sliver = hood(
        first.plat,
        &boxed(0, edge - 6, 1200, 12),
        &seeds(10),
        3000,
        "k",
        Form::Neighbourhood,
    );
    assert_eq!(codes(&sliver.events), ["town/overflow"]);
}

#[test]
fn keeps_a_remembered_park_line_while_the_lots_fit() {
    let first = hood(
        TownPlat::default(),
        &boxed(0, 0, 1200, 900),
        &seeds(10),
        3000,
        "k",
        Form::Neighbourhood,
    );
    let line = first.plat.grids["k"].park;
    let again = hood(
        first.plat,
        &boxed(0, 0, 1200, 900),
        &seeds(11),
        3000,
        "k",
        Form::Neighbourhood,
    );
    assert!(!codes(&again.events).contains(&"plat/repark"));
    assert_eq!(again.plat.grids["k"].park, line);
}

#[test]
fn lays_its_grid_afresh_when_its_land_moved_off_the_grid_and_keeps_it_when_a_fresh_one_seats_no_more() {
    let first = hood(
        TownPlat::default(),
        &boxed(0, 0, 600, 400),
        &seeds(6),
        0,
        "k",
        Form::Neighbourhood,
    );
    let roads = first.roads;
    let moved = hood(
        first.plat,
        &boxed(350, 250, 500, 400),
        &seeds(6),
        0,
        "k",
        Form::Neighbourhood,
    );
    assert_eq!((moved.overflow, moved.lots), (0, 6));
    assert!(codes(&moved.events).contains(&"plat/regrid"));
    assert!(moved.roads <= roads + 2);
    let first = hood(
        TownPlat::default(),
        &rect(600, 400),
        &seeds(6),
        0,
        "k",
        Form::Neighbourhood,
    );
    let squeezed = hood(first.plat, &rect(600, 400), &seeds(200), 0, "k", Form::Neighbourhood);
    assert!(!codes(&squeezed.events).contains(&"plat/regrid"));
    assert!(squeezed.overflow > 0);
}

#[test]
fn has_no_slots_on_land_smaller_than_a_block() {
    assert_eq!(
        hood(
            TownPlat::default(),
            &rect(40, 40),
            &seeds(3),
            0,
            "k",
            Form::Neighbourhood
        )
        .overflow,
        3
    );
}
