//! A town laid out on its outline: partition decides everything the plat remembers; drawing the town (loop
//! connectors, the organic warp and the district labels) is pure, so it waits until the town is asked for.
use crate::archetype::Form;
use crate::city::{Block, District, Lot, Road, Town, TownStats};
use crate::fixed::{MemoWarp, Pt, Rounding, Warp, area2, densify, fnv1a, mul_div};
use crate::plat::TownPlat;
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
    // A town's cached folders hold only while its constants do: its options, its land and its root.
    let land_area2 = area2(outline);
    let constants = format!(
        "{}|{}|{}|{land_area2}|{}",
        options.order.as_str(),
        options.jog.as_str(),
        options.density_pct,
        root.path
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
