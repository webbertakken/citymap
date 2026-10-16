//! A town laid out on its outline: partition decides everything the plat remembers; drawing the town (loop
//! connectors, the organic warp and the district labels) is pure, so it waits until the town is asked for.
use crate::archetype::Form;
use crate::city::{Block, District, Lot, Road, Town, TownStats};
use crate::fixed::{MemoWarp, Pt, Rounding, Warp, area2, densify, fnv1a, mul_div};
use crate::plat::TownPlat;
use crate::roads::{Tier, tier_rule, town_tier};
use crate::toggles::Toggle;
use crate::town::connectors::loop_connectors;
use crate::town::context::{Ctx, DraftBlock, DraftLot, LayoutOptions, PlatEvent, TownCache, to_poly};
use crate::town::cut::diameter_of;
use crate::town::partition::partition;
use crate::tree::TreeNode;

/// A laid town, its new plat, and the decisions made.
pub struct LaidTown {
    pub draft: TownDraft,
    pub plat: TownPlat,
    pub events: Vec<PlatEvent>,
}

/// A town as partition laid it, before it is drawn.
#[derive(Clone, Debug)]
pub struct TownDraft {
    name: String,
    key: String,
    outline: Vec<Pt>,
    form: Form,
    roads: Vec<Road>,
    blocks: Vec<DraftBlock>,
    lots: Vec<DraftLot>,
    districts: Vec<District>,
    water: Vec<Vec<Pt>>,
    canals: Vec<Vec<Pt>>,
    root_mass: i64,
    stats: TownStats,
    /// The warp's diameter, when the plan is warped.
    warp: Option<i64>,
    loops: bool,
}

/// A district is labelled when it holds at least this share (‰) of its town's mass.
const LABEL_MILLE: i64 = 15;
/// A memoised warp forgets its points beyond this many.
const WARP_POINTS: usize = 1 << 21;

fn warp_for(key: &str, diameter: i64) -> Warp {
    Warp::new(
        fnv1a(key),
        vec![
            (32, 1280),
            (
                mul_div(diameter, 15, 1000, Rounding::Floor),
                mul_div(diameter, 350, 1000, Rounding::Floor).max(1),
            ),
            (
                mul_div(diameter, 70, 1000, Rounding::Floor),
                mul_div(diameter, 1100, 1000, Rounding::Floor).max(1),
            ),
        ],
    )
}

/// The town's memoised warp: kept in its cache while the diameter stands.
fn with_warp<T>(key: &str, diameter: i64, cache: Option<&mut TownCache>, f: impl FnOnce(&mut MemoWarp) -> T) -> T {
    match cache {
        Some(cache) => {
            if cache.warp.as_ref().is_none_or(|(d, _)| *d != diameter) {
                cache.warp = Some((diameter, MemoWarp::new(warp_for(key, diameter), WARP_POINTS)));
            }
            let (_, warp) = cache.warp.as_mut().expect("set above");
            f(warp)
        }
        None => f(&mut MemoWarp::new(warp_for(key, diameter), WARP_POINTS)),
    }
}

fn bend(warp: &mut MemoWarp, pts: &[Pt], closed: bool, step: i64) -> Vec<Pt> {
    densify(pts, step, closed).into_iter().map(|q| warp.apply(q)).collect()
}

impl TownDraft {
    /// The outline as drawn: warped, when the plan is.
    #[must_use]
    pub fn outline(&self, cache: Option<&mut TownCache>) -> Vec<Pt> {
        match self.warp {
            Some(diameter) => with_warp(&self.key, diameter, cache, |warp| bend(warp, &self.outline, true, 80)),
            None => self.outline.clone(),
        }
    }

    /// The town drawn: loop connectors joining nearby dead ends, the organic warp, tints and labels. Pure.
    #[must_use]
    pub fn town(&self, cache: Option<&mut TownCache>) -> Town {
        let mut roads = self.roads.clone();
        // Dead ends near each other are joined by lanes through open ground only.
        if self.loops {
            let shapes: Vec<&[Pt]> = self
                .lots
                .iter()
                .map(|l| l.pts.as_slice())
                .chain(self.blocks.iter().map(|b| b.pts.as_slice()))
                .collect();
            roads.extend(loop_connectors(&roads, &shapes, &self.outline));
        }
        let blocks = self.blocks.iter().map(|b| Block {
            district: b.district,
            form: b.form,
            kind: b.kind,
            pts: b.pts.clone(),
        });
        let lots = self.lots.iter().map(|l| Lot {
            address: l.address.clone(),
            district: l.district,
            form: l.form,
            key: l.key.to_string(),
            path: l.path.to_string(),
            pts: l.pts.clone(),
            land_use: l.land_use,
            vacant: l.vacant,
        });
        let mut town = Town {
            key: self.key.clone(),
            name: self.name.clone(),
            form: self.form,
            old: false,
            outline: self.outline.clone(),
            water: self.water.clone(),
            canals: self.canals.clone(),
            roads,
            blocks: blocks.collect(),
            lots: lots.collect(),
            // A folder is labelled when it is top-level or holds at least 15 ‰ of the town's mass; wards always.
            districts: self
                .districts
                .iter()
                .filter(|d| d.ward || d.depth == 1 || d.mass_mille * 1000 >= LABEL_MILLE * self.root_mass)
                .cloned()
                .collect(),
            stats: self.stats,
        };
        if let Some(diameter) = self.warp {
            // The organic layer: one smooth warp per town, scaled by its remembered diameter; it never feeds back.
            with_warp(&self.key, diameter, cache, |warp| {
                town.outline = bend(warp, &town.outline, true, 80);
                for road in &mut town.roads {
                    road.pts = bend(warp, &road.pts, false, 48);
                }
                for block in &mut town.blocks {
                    block.pts = bend(warp, &block.pts, true, 64);
                }
                for lot in &mut town.lots {
                    for p in &mut lot.pts {
                        *p = warp.apply(*p);
                    }
                }
                for district in &mut town.districts {
                    district.pts = bend(warp, &district.pts, true, 80);
                }
                for water in &mut town.water {
                    *water = bend(warp, water, true, 64);
                }
                for canal in &mut town.canals {
                    *canal = bend(warp, canal, true, 64);
                }
            });
        }
        town
    }
}

/// Lays out one town on its outline. The plat given is the town's to change; the new plat is returned.
#[allow(clippy::too_many_arguments)]
#[must_use]
pub fn layout_town(
    name: &str,
    key: &str,
    root: &TreeNode,
    outline: &[Pt],
    plat: TownPlat,
    options: &LayoutOptions,
    root_form: Option<Form>,
    mut cache: Option<&mut TownCache>,
) -> LaidTown {
    // A town's cached folders hold only while its constants do: its options, its land, its root, its toggles and tier.
    let land_area2 = area2(outline);
    let previous_tier = plat.tier;
    let tier = options
        .toggles
        .contains(&Toggle::Tiers)
        .then(|| town_tier(root.mass_mille, previous_tier));
    let toggles: Vec<&str> = options.toggles.iter().map(|t| t.as_str()).collect();
    let constants = format!(
        "{}|{}|{}|{land_area2}|{}|toggles:{}|tier:{}",
        options.order.as_str(),
        options.jog.as_str(),
        options.density_pct,
        root.path,
        toggles.join(","),
        tier.map_or("", Tier::as_str)
    );
    if let Some(cache) = cache.as_deref_mut()
        && cache.constants != constants
    {
        cache.constants = constants;
        cache.entries.clear();
    }
    let mut ctx = Ctx::new(options, plat, root, land_area2);
    ctx.root_form = root_form;
    ctx.cache = cache;
    if let Some(tier) = tier {
        ctx.plat.tier = Some(tier);
        ctx.tier = Some(tier_rule(tier, root.mass_mille));
        if let Some(from) = previous_tier
            && from != tier
        {
            ctx.emit(
                "plat/tier",
                vec![
                    ("key", key.into()),
                    ("from", from.as_str().into()),
                    ("to", tier.as_str().into()),
                ],
            );
        }
    }
    partition(&mut ctx, root, &to_poly(outline, 0), "");
    let warp = options.warp.then(|| {
        if ctx.plat.diameter == 0 {
            ctx.plat.diameter = diameter_of(ctx.land_area2);
        }
        ctx.plat.diameter
    });
    let stats = TownStats {
        lots: i64::try_from(ctx.lots.iter().filter(|l| !l.vacant).count()).expect("small"),
        overflow: ctx.overflow,
        off_land: 0,
        docs: 0,
        lot_area2: ctx.lot_area2,
        land_area2: ctx.land_area2,
    };
    let draft = TownDraft {
        name: name.to_owned(),
        key: key.to_owned(),
        outline: outline.to_vec(),
        form: ctx.form,
        roads: std::mem::take(&mut ctx.roads),
        blocks: std::mem::take(&mut ctx.blocks),
        lots: std::mem::take(&mut ctx.lots),
        districts: std::mem::take(&mut ctx.districts),
        water: std::mem::take(&mut ctx.water),
        canals: std::mem::take(&mut ctx.canals),
        root_mass: root.mass_mille,
        stats,
        warp,
        loops: options.loops,
    };
    LaidTown {
        draft,
        plat: ctx.plat,
        events: ctx.events,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    use super::*;
    use crate::city::BlockKind;
    use crate::fixed::compare_keys;
    use crate::json::canonical_json;
    use crate::region::outline::outline_for;
    use crate::snapshot::FileEntry;
    use crate::testing::{files, layout_options, sources, tree_of};
    use crate::town::context::{Jog, Order, Value};
    use crate::town::partition::centre_out;

    struct Laid {
        town: Town,
        plat: TownPlat,
        events: Vec<PlatEvent>,
    }

    /// Lays a tree on an outline of its land times room/100, or of an earlier tree's land, as a town keeps it.
    fn lay_on(tree: &TreeNode, plat: TownPlat, options: &LayoutOptions, room: i64, land_of: &TreeNode) -> Laid {
        let outline = outline_for(land_of.demand * 2 * room / 100, Pt::new(0, 0), "demo");
        let laid = layout_town("demo", "demo", tree, &outline, plat, options, None, None);
        Laid {
            town: laid.draft.town(None),
            plat: laid.plat,
            events: laid.events,
        }
    }

    fn lay(tree: &TreeNode, plat: TownPlat) -> Laid {
        lay_on(tree, plat, &layout_options(), 100, tree)
    }

    fn codes(events: &[PlatEvent]) -> Vec<&'static str> {
        events.iter().map(|e| e.code).collect()
    }

    fn keys_of(events: &[PlatEvent], code: &str) -> Vec<String> {
        events
            .iter()
            .filter(|e| e.code == code)
            .filter_map(|e| e.detail.iter().find(|(k, _)| *k == "key").map(|(_, v)| v.to_string()))
            .collect()
    }

    fn positions(town: &Town) -> BTreeMap<String, String> {
        town.lots
            .iter()
            .filter(|l| !l.vacant)
            .map(|l| (l.key.clone(), canonical_json(&l.pts).expect("json")))
            .collect()
    }

    const RING: [&str; 5] = ["north", "east", "south", "west", "up"];

    fn radial_repo() -> Vec<FileEntry> {
        let mut all = sources("core", 400, 0);
        for (d, i) in RING.iter().zip(0..) {
            all.extend(sources(d, 40, 500 + i * 100));
        }
        all
    }

    fn twin_repo() -> Vec<FileEntry> {
        let mut all = sources("lib", 300, 0);
        all.extend(sources("test-kit", 250, 400));
        all.extend(sources("misc", 50, 800));
        all
    }

    fn six_repo() -> Vec<FileEntry> {
        let sizes = [150, 60, 200, 90, 120, 180];
        ["a", "b", "c", "d", "e", "f"]
            .iter()
            .zip(0..)
            .flat_map(|(d, i)| sources(d, sizes[i], i64::try_from(i).expect("small") * 300))
            .collect()
    }

    #[test]
    fn puts_the_oldest_in_the_middle_and_newcomers_at_the_edges() {
        assert_eq!(centre_out(&[1, 2, 3, 4, 5]), vec![4, 2, 1, 3, 5]);
    }

    #[test]
    fn is_deterministic_warp_included() {
        let tree = tree_of(&six_repo());
        let warped = LayoutOptions {
            warp: true,
            ..layout_options()
        };
        let a = lay_on(&tree, TownPlat::default(), &warped, 100, &tree);
        let b = lay_on(&tree, TownPlat::default(), &warped, 100, &tree);
        assert_eq!(
            canonical_json(&a.town).expect("json"),
            canonical_json(&b.town).expect("json")
        );
        assert_eq!(
            canonical_json(&a.plat).expect("json"),
            canonical_json(&b.plat).expect("json")
        );
    }

    #[test]
    fn gives_every_file_of_a_polycentric_town_a_lot_and_jogs_its_long_cut() {
        let laid = lay(&tree_of(&six_repo()), TownPlat::default());
        assert_eq!(laid.town.form, Form::Polycentric);
        assert_eq!((laid.town.stats.lots, laid.town.stats.overflow), (800, 0));
        assert_eq!(
            laid.town
                .lots
                .iter()
                .map(|l| l.address.as_str())
                .collect::<BTreeSet<_>>()
                .len(),
            800
        );
        assert!(laid.town.blocks.iter().any(|b| b.kind == BlockKind::Plaza));
        let flat = lay_on(
            &tree_of(&six_repo()),
            TownPlat::default(),
            &LayoutOptions {
                jog: Jog::Off,
                ..layout_options()
            },
            100,
            &tree_of(&six_repo()),
        );
        assert!(!flat.town.blocks.iter().any(|b| b.kind == BlockKind::Plaza));
        let aged = LayoutOptions {
            order: Order::FirstSeen,
            ..layout_options()
        };
        assert_eq!(
            lay_on(
                &tree_of(&six_repo()),
                TownPlat::default(),
                &aged,
                100,
                &tree_of(&six_repo())
            )
            .town
            .stats
            .lots,
            800
        );
    }

    #[test]
    fn lays_a_radial_town_with_a_ring_road_and_re_sectors_for_a_newcomer() {
        let first = lay(&tree_of(&radial_repo()), TownPlat::default());
        assert_eq!(first.town.form, Form::Radial);
        let mut ring: Vec<String> = RING.iter().map(|s| (*s).to_owned()).collect();
        ring.sort_by(|a, b| compare_keys(a, b));
        assert_eq!(first.plat.radial[""].order, ring);
        assert!(first.town.roads.iter().any(|r| r.pts.len() == RING.len() + 1));
        let mut more = radial_repo();
        more.extend(sources("down", 40, 2000));
        let grown = lay_on(
            &tree_of(&more),
            first.plat.clone(),
            &layout_options(),
            100,
            &tree_of(&radial_repo()),
        );
        assert!(codes(&grown.events).contains(&"plat/radial-resector"));
        let mut order = ring.clone();
        order.push("down".into());
        assert_eq!(grown.plat.radial[""].order, order);
        let forgotten = keys_of(&grown.events, "plat/forget");
        for key in std::iter::once("core").chain(RING) {
            assert!(forgotten.iter().any(|k| k == key), "{key} forgotten");
        }
        assert_eq!(grown.town.stats.overflow, 0);
    }

    #[test]
    fn falls_back_to_cuts_when_a_radial_ring_has_fewer_than_three_items() {
        let mut all = sources("core", 400, 0);
        all.extend(sources("one", 60, 500));
        all.extend(sources("two", 60, 600));
        let laid = lay(&tree_of(&all), TownPlat::default());
        assert_eq!(laid.town.form, Form::Radial);
        assert!(!laid.plat.radial.contains_key("") && laid.plat.cuts.contains_key(""));
    }

    #[test]
    fn lays_a_twin_town_across_a_river_with_a_bridge_warped_with_the_rest() {
        let laid = lay(&tree_of(&twin_repo()), TownPlat::default());
        assert_eq!(laid.town.form, Form::Twin);
        assert!(laid.plat.cuts[""].river);
        assert_eq!((laid.town.water.len(), laid.town.stats.lots), (1, 600));
        let warped = LayoutOptions {
            warp: true,
            ..layout_options()
        };
        let laid = lay_on(
            &tree_of(&twin_repo()),
            TownPlat::default(),
            &warped,
            100,
            &tree_of(&twin_repo()),
        );
        assert!(laid.town.water[0].len() > 4);
    }

    #[test]
    fn keeps_every_surviving_lot_in_place_when_files_are_deleted() {
        let all = six_repo();
        let first = lay(&tree_of(&all), TownPlat::default());
        let kept: Vec<FileEntry> = all
            .iter()
            .enumerate()
            .filter(|(i, _)| i % 10 != 0)
            .map(|(_, f)| f.clone())
            .collect();
        let second = lay_on(
            &tree_of(&kept),
            first.plat.clone(),
            &layout_options(),
            100,
            &tree_of(&all),
        );
        let before = positions(&first.town);
        for (key, pts) in positions(&second.town) {
            assert_eq!(Some(&pts), before.get(&key));
        }
        assert_eq!(second.town.lots.iter().filter(|l| l.vacant).count(), 80);
    }

    #[test]
    fn moves_only_the_folder_whose_land_a_newcomer_folder_shares() {
        let first = lay(&tree_of(&six_repo()), TownPlat::default());
        let mut more = six_repo();
        more.extend(sources("g", 10, 5000));
        let second = lay_on(
            &tree_of(&more),
            first.plat.clone(),
            &layout_options(),
            100,
            &tree_of(&six_repo()),
        );
        let before = positions(&first.town);
        let moved: BTreeSet<String> = positions(&second.town)
            .into_iter()
            .filter(|(key, pts)| before.get(key).is_some_and(|b| b != pts))
            .map(|(key, _)| key.split('/').next().expect("a folder").to_owned())
            .collect();
        assert!(moved.len() <= 1);
    }

    #[test]
    fn moves_a_remembered_cut_when_one_side_outgrows_its_band_and_forgets_on_a_switch() {
        let first = lay(&tree_of(&six_repo()), TownPlat::default());
        let mut more = six_repo();
        more.extend(sources("a/more", 600, 5000));
        assert!(codes(&lay(&tree_of(&more), first.plat.clone()).events).contains(&"plat/recut"));
        let solo = lay(&tree_of(&sources("solo", 30, 0)), TownPlat::default());
        assert!(codes(&lay(&tree_of(&six_repo()), solo.plat).events).contains(&"plat/switch"));
    }

    #[test]
    fn cuts_a_folder_s_own_lots_and_its_docs_park_beside_its_child_folders() {
        let mut all = sources("", 120, 0);
        all.extend((0..40).map(|i| FileEntry::new(&format!("guide-{i}.md"), &format!("g{i}"), i)));
        all.extend(sources("a", 150, 200));
        all.extend(sources("b", 150, 400));
        let laid = lay(&tree_of(&all), TownPlat::default());
        let sides = |item: &str| {
            laid.plat
                .cuts
                .values()
                .any(|c| c.left.iter().chain(&c.right).any(|k| k == item))
        };
        assert!(sides("#lots") && sides("#park"));
        assert!(laid.town.blocks.iter().any(|b| b.kind == BlockKind::Park));
    }

    #[test]
    fn keeps_a_vacated_radial_sector_as_reserve_until_the_ring_re_sectors() {
        let first = lay(&tree_of(&radial_repo()), TownPlat::default());
        let without: Vec<FileEntry> = radial_repo()
            .into_iter()
            .filter(|f| !f.path.starts_with("up/"))
            .collect();
        let second = lay_on(
            &tree_of(&without),
            first.plat.clone(),
            &layout_options(),
            100,
            &tree_of(&radial_repo()),
        );
        assert!(second.plat.radial[""].order.iter().any(|k| k == "up"));
        assert!(second.town.blocks.iter().any(|b| b.kind == BlockKind::Reserve));
    }

    #[test]
    fn counts_every_lot_as_overflow_when_the_land_is_too_small() {
        let tree = tree_of(&sources("", 5, 0));
        let tiny = outline_for(200, Pt::new(0, 0), "demo");
        let laid = layout_town(
            "demo",
            "demo",
            &tree,
            &tiny,
            TownPlat::default(),
            &layout_options(),
            None,
            None,
        );
        assert_eq!(laid.draft.town(None).stats.overflow, 5);
        assert!(codes(&laid.events).contains(&"town/overflow"));
        let docs_only = tree_of(&[FileEntry::new("a.md", "a", 0)]);
        let laid = layout_town(
            "demo",
            "demo",
            &docs_only,
            &tiny,
            TownPlat::default(),
            &layout_options(),
            None,
            None,
        );
        assert_eq!(codes(&laid.events), Vec::<&str>::new());
    }

    #[test]
    fn gathers_a_hamlet_round_a_green_and_runs_a_street_village_along_a_high_street() {
        let hamlet = lay_on(
            &tree_of(&sources("", 20, 0)),
            TownPlat::default(),
            &layout_options(),
            2000,
            &tree_of(&sources("", 20, 0)),
        );
        assert_eq!(hamlet.town.form, Form::Hamlet);
        assert!(hamlet.plat.grids[""].green.is_some());
        assert!(hamlet.town.blocks.iter().any(|b| b.kind == BlockKind::Green));
        let village = lay_on(
            &tree_of(&sources("", 60, 0)),
            TownPlat::default(),
            &layout_options(),
            400,
            &tree_of(&sources("", 60, 0)),
        );
        assert_eq!(village.town.form, Form::StreetVillage);
        assert!(village.plat.grids[""].high.is_some());
        assert!(
            village
                .town
                .roads
                .iter()
                .any(|r| r.cls == crate::constants::RoadClass::Collector)
        );
        let again = lay_on(
            &tree_of(&sources("", 60, 0)),
            village.plat.clone(),
            &layout_options(),
            400,
            &tree_of(&sources("", 60, 0)),
        );
        let addresses = |t: &Town| t.lots.iter().map(|l| l.address.clone()).collect::<Vec<_>>();
        assert_eq!(addresses(&again.town), addresses(&village.town));
    }

    #[test]
    fn renews_a_neighbourhood_whose_remembered_lots_are_mostly_vacant() {
        let mut all = sources("a", 30, 0);
        all.extend(sources("b", 30, 100));
        let first = lay(&tree_of(&all), TownPlat::default());
        assert_eq!(first.town.form, Form::Neighbourhood);
        let mut kept = sources("a", 15, 0);
        kept.extend(sources("b", 10, 100));
        let second = lay_on(
            &tree_of(&kept),
            first.plat.clone(),
            &layout_options(),
            100,
            &tree_of(&all),
        );
        assert_eq!(second.town.form, Form::Neighbourhood);
        assert!(codes(&second.events).contains(&"plat/renew"));
        assert!(second.town.lots.iter().all(|l| !l.vacant));
    }

    #[test]
    fn lays_docs_as_a_park_strip_and_counts_lots_without_room_as_overflow() {
        let mut all = sources("", 40, 0);
        all.extend((0..30).map(|i| FileEntry::new(&format!("guide-{i}.md"), &format!("g{i}"), i)));
        assert!(
            lay(&tree_of(&all), TownPlat::default())
                .town
                .blocks
                .iter()
                .any(|b| b.kind == BlockKind::Park)
        );
        let crowded = lay_on(
            &tree_of(&sources("", 200, 0)),
            TownPlat::default(),
            &layout_options(),
            20,
            &tree_of(&sources("", 200, 0)),
        );
        assert!(crowded.town.stats.overflow > 0);
        let overflow = crowded
            .events
            .iter()
            .find(|e| e.code == "town/overflow")
            .expect("an overflow");
        assert!(matches!(overflow.detail[1].1, Value::Number(n) if n > 0));
    }

    #[test]
    fn lays_no_lots_for_docs_alone() {
        let all = files("x", 3, 0, "md", "d");
        let laid = lay(&tree_of(&all), TownPlat::default());
        assert_eq!(laid.town.stats.lots, 0);
    }
}
