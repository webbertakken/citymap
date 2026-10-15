//! A town laid out on its outline: partition, loop connectors, the organic warp, and the town's district labels.
use crate::archetype::Form;
use crate::city::{Block, District, Lot, Road, Town, TownStats};
use crate::fixed::{MemoWarp, Pt, Rounding, Warp, area2, densify, fnv1a, mul_div};
use crate::plat::TownPlat;
use crate::town::connectors::loop_connectors;
use crate::town::context::{Ctx, LayoutOptions, PlatEvent, TownCache, to_poly};
use crate::town::cut::diameter_of;
use crate::town::partition::partition;
use crate::tree::TreeNode;

/// A laid town, its new plat, and the decisions made.
pub struct LaidTown {
    pub town: Town,
    pub plat: TownPlat,
    pub events: Vec<PlatEvent>,
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

/// What a town is drawn from, before or after the warp.
struct Shapes {
    outline: Vec<Pt>,
    roads: Vec<Road>,
    blocks: Vec<Block>,
    lots: Vec<Lot>,
    districts: Vec<District>,
    water: Vec<Vec<Pt>>,
}

/// The organic layer: one smooth warp per town, scaled by its remembered diameter; it never feeds back.
fn warp_town(shapes: Shapes, warp: &mut MemoWarp) -> Shapes {
    let mut bend = |pts: &[Pt], closed: bool, step: i64| -> Vec<Pt> {
        densify(pts, step, closed).into_iter().map(|q| warp.apply(q)).collect()
    };
    let outline = bend(&shapes.outline, true, 80);
    let roads = shapes
        .roads
        .into_iter()
        .map(|r| Road {
            pts: bend(&r.pts, false, 48),
            ..r
        })
        .collect();
    let blocks = shapes
        .blocks
        .into_iter()
        .map(|b| Block {
            pts: bend(&b.pts, true, 64),
            ..b
        })
        .collect();
    let lots: Vec<Lot> = shapes.lots;
    let districts = shapes
        .districts
        .into_iter()
        .map(|d| District {
            pts: bend(&d.pts, true, 80),
            ..d
        })
        .collect();
    let water = shapes.water.iter().map(|w| bend(w, true, 64)).collect();
    let lots = lots
        .into_iter()
        .map(|l| Lot {
            pts: l.pts.iter().map(|&q| warp.apply(q)).collect(),
            ..l
        })
        .collect();
    Shapes {
        outline,
        roads,
        blocks,
        lots,
        districts,
        water,
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
    // Dead ends near each other are joined by lanes through open ground only.
    if options.loops {
        let shapes: Vec<&[Pt]> = ctx
            .lots
            .iter()
            .map(|l| l.pts.as_slice())
            .chain(ctx.blocks.iter().map(|b| b.pts.as_slice()))
            .collect();
        let lanes = loop_connectors(&ctx.roads, &shapes, outline);
        ctx.roads.extend(lanes);
    }
    let lots_live = ctx.lots.iter().filter(|l| !l.vacant).count();
    let shapes = Shapes {
        outline: outline.to_vec(),
        roads: std::mem::take(&mut ctx.roads),
        blocks: std::mem::take(&mut ctx.blocks)
            .into_iter()
            .map(|b| Block {
                district: b.district,
                form: b.form,
                kind: b.kind,
                pts: b.pts,
            })
            .collect(),
        lots: std::mem::take(&mut ctx.lots)
            .into_iter()
            .map(|l| Lot {
                address: l.address,
                district: l.district,
                form: l.form,
                key: l.key.to_string(),
                path: l.path.to_string(),
                pts: l.pts,
                land_use: l.land_use,
                vacant: l.vacant,
            })
            .collect(),
        districts: std::mem::take(&mut ctx.districts),
        water: std::mem::take(&mut ctx.water),
    };
    let laid = if options.warp {
        if ctx.plat.diameter == 0 {
            ctx.plat.diameter = diameter_of(ctx.land_area2);
        }
        let diameter = ctx.plat.diameter;
        match ctx.cache.as_deref_mut() {
            Some(cache) => {
                if cache.warp.as_ref().is_none_or(|(d, _)| *d != diameter) {
                    cache.warp = Some((diameter, MemoWarp::new(warp_for(key, diameter), WARP_POINTS)));
                }
                let (_, warp) = cache.warp.as_mut().expect("set above");
                warp_town(shapes, warp)
            }
            None => warp_town(shapes, &mut MemoWarp::new(warp_for(key, diameter), WARP_POINTS)),
        }
    } else {
        shapes
    };
    let root_mass = root.mass_mille;
    let town = Town {
        key: key.to_owned(),
        name: name.to_owned(),
        form: ctx.form,
        old: false,
        outline: laid.outline,
        water: laid.water,
        roads: laid.roads,
        blocks: laid.blocks,
        lots: laid.lots,
        // A folder is labelled when it is top-level or holds at least 15 ‰ of the town's mass; wards always.
        districts: laid
            .districts
            .into_iter()
            .filter(|d| d.ward || d.depth == 1 || d.mass_mille * 1000 >= LABEL_MILLE * root_mass)
            .collect(),
        stats: TownStats {
            lots: i64::try_from(lots_live).expect("small"),
            overflow: ctx.overflow,
            off_land: 0,
            docs: 0,
            lot_area2: ctx.lot_area2,
            land_area2: ctx.land_area2,
        },
    };
    LaidTown {
        town,
        plat: ctx.plat,
        events: ctx.events,
    }
}
