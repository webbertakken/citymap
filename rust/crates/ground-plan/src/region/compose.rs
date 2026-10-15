//! A city composed from one commit's tree: its towns, their outlines and places, old towns and highways.
use std::collections::{HashMap, HashSet};

use rustc_hash::FxHashMap;
use std::sync::Arc;

use crate::archetype::{Form, classify_node};
use crate::city::{City, Road, Town};
use crate::constants::GROWTH_PCT;
use crate::error::{CitymapError, ErrorCode, Result};
use crate::fixed::{
    DIRECTION, Dir, Pt, Rounding, TURN, Warp, centroid, compare_keys, densify, dir, floor_div, fnv1a, isqrt, mul_div,
    normalise,
};
use crate::land_use::{LandUse, classify_land_use, land_key};
use crate::plat::{OldTown, Plat, TownPlat};
use crate::region::highway::{highway_between, with_approach};
use crate::region::outline::outline_for;
use crate::snapshot::{FileEntry, MAX_FILES, Snapshot};
use crate::town::context::{Jog, LayoutOptions, Order, PlatEvent, TownCache, Value};
use crate::town::layout::layout_town;
use crate::tree::{Built, Shares, TreeOptions, build_tree};
use crate::workspace::{workspace_groups, workspace_members};

/// How a city is laid.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Options {
    pub density_pct: i64,
    pub land_uses: Vec<LandUse>,
    pub order: Order,
    pub jog: Jog,
    pub warp: bool,
    /// Lanes joining nearby dead ends. They never touch the plat.
    pub loops: bool,
    /// Workspace groups whose members each become a town, by folder path or name.
    pub split: Vec<String>,
}

/// Each app of an `apps/` group is its own town by default; other groups stay one town each.
pub const DEFAULT_SPLIT: &[&str] = &["apps"];

/// The setting a plat is laid for: its land uses and its split groups. Each setting has its own plat.
#[must_use]
pub fn setting_key(options: &Options) -> String {
    let mut split: Vec<&str> = options.split.iter().map(String::as_str).collect();
    split.sort_by(|a, b| compare_keys(a, b));
    format!("{}|split:{}", land_key(&options.land_uses), split.join(","))
}

/// What a file list says on its own, kept while a fold hands over the same list.
struct Derived {
    files: Arc<Vec<FileEntry>>,
    workspaces: Option<Arc<Vec<String>>>,
    uses: Vec<LandUse>,
    groups: Vec<String>,
    member_folders: Vec<String>,
}

/// The locality caches of a fold, per town, how often they spared a folder its layout, and what the last file list
/// said.
#[derive(Default)]
pub struct FoldCache {
    pub towns: HashMap<String, TownCache>,
    pub hits: u64,
    derived: Option<Derived>,
    /// Each part's last built tree: building it again from the same files, folders and the shares it made gives the
    /// same tree and shares, so it is kept.
    trees: HashMap<String, KeptTree>,
    /// Land use per path, remembered for a million paths: every commit asks again about the same paths.
    uses: FxHashMap<Arc<str>, LandUse>,
}

/// A part's last tree, and the files it was built from: the range of the sorted file list under its root.
struct KeptTree {
    files: Arc<Vec<FileEntry>>,
    range: std::ops::Range<usize>,
    options: TreeOptions,
    built: Built,
}

/// The files under a root: a contiguous range of the sorted list, as every path under `root/` sorts between `root/`
/// and `root0` (`0` follows `/`).
fn under(files: &[FileEntry], root: &str) -> std::ops::Range<usize> {
    if root.is_empty() {
        return 0..files.len();
    }
    let (from, to) = (format!("{root}/"), format!("{root}0"));
    files.partition_point(|f| *f.path < *from)..files.partition_point(|f| *f.path < *to)
}

/// How many paths the land-use memory holds before it starts afresh.
const USE_MEMORY: usize = 1 << 20;

/// The plat and the runtime state a fold carries between commits: each town as last laid (to freeze on a switch), and
/// the locality cache. Only the plat is persisted.
pub struct FoldState {
    pub plat: Plat,
    pub last: HashMap<String, Arc<Town>>,
    pub cache: Option<FoldCache>,
}

/// Open country between towns.
const GAP: i64 = 720;

/// The largest absolute coordinate a laid city may reach, in fixed units.
pub const COORD_LIMIT: i64 = 1 << 21;

struct Part {
    name: String,
    key: String,
    root: String,
    exclude: Vec<String>,
    first_seen: i64,
}

/// The radius of a circle of the given doubled area, widened by 8 %.
fn radius_of(area2: i64) -> i64 {
    floor_div(isqrt(floor_div(area2 * 113, 2 * 355)) * 108, 100)
}

fn distance2(a: Pt, b: Pt) -> i64 {
    (a.x - b.x).pow(2) + (a.y - b.y).pow(2)
}

fn along(d: Dir, length: i64) -> Pt {
    Pt::new(
        mul_div(d[0], length, DIRECTION, Rounding::Round),
        mul_div(d[1], length, DIRECTION, Rounding::Round),
    )
}

/// The steps (0.01 rad each) of a hash, as angle steps.
fn hash_angle(key: &str, modulo: u32) -> i64 {
    floor_div(i64::from(fnv1a(key) % modulo) * TURN * 100, 628 * 100)
}

/// A town moved by an offset: every point of its outline, water, roads, blocks, lots and districts.
pub fn translate_town(town: &mut Town, by: Pt) {
    let shift = |pts: &mut Vec<Pt>| {
        for p in pts {
            p.x += by.x;
            p.y += by.y;
        }
    };
    shift(&mut town.outline);
    town.water.iter_mut().for_each(shift);
    town.roads.iter_mut().for_each(|r| shift(&mut r.pts));
    town.blocks.iter_mut().for_each(|b| shift(&mut b.pts));
    town.lots.iter_mut().for_each(|l| shift(&mut l.pts));
    town.districts.iter_mut().for_each(|d| shift(&mut d.pts));
}

/// The circle a town stands in: its heart and its reach.
fn footprint(t: &Town) -> (Pt, i64) {
    let c = centroid(&t.outline);
    let far = t.outline.iter().map(|&p| distance2(p, c)).max().unwrap_or(i64::MIN);
    (c, isqrt(far))
}

fn old_town_name(name: &str, count: usize) -> String {
    if count > 1 {
        format!("{name} old town {count}")
    } else {
        format!("{name} old town")
    }
}

/// Rejects a city whose towns or highways reach the coordinate limit; lots and roads lie within their towns.
pub fn check_extent(towns: &[Arc<Town>], highways: &[Road]) -> Result<()> {
    let points = towns
        .iter()
        .flat_map(|t| t.outline.iter())
        .chain(highways.iter().flat_map(|h| h.pts.iter()));
    for p in points {
        if p.x.abs() >= COORD_LIMIT || p.y.abs() >= COORD_LIMIT {
            return Err(CitymapError::new(
                ErrorCode::CityTooLarge,
                format!("the city reaches {}, {}, past {COORD_LIMIT}", p.x, p.y),
            )
            .with("x", &p.x)
            .with("y", &p.y));
        }
    }
    Ok(())
}

fn derive(snapshot: &Snapshot, memory: Option<&mut FxHashMap<Arc<str>, LandUse>>) -> Derived {
    let uses: Vec<LandUse> = match memory {
        Some(memory) => snapshot
            .files
            .iter()
            .map(|f| {
                if let Some(&known) = memory.get(&f.path) {
                    return known;
                }
                if memory.len() >= USE_MEMORY {
                    memory.clear();
                }
                let land_use = classify_land_use(&f.path);
                memory.insert(f.path.clone(), land_use);
                land_use
            })
            .collect(),
        None => snapshot.files.iter().map(|f| classify_land_use(&f.path)).collect(),
    };
    let paths: Vec<&str> = snapshot.files.iter().map(|f| &*f.path).collect();
    let declared = snapshot.workspaces.as_deref().map(Vec::as_slice);
    Derived {
        files: snapshot.files.clone(),
        workspaces: snapshot.workspaces.clone(),
        groups: workspace_groups(&paths, |i| uses[i], declared),
        member_folders: workspace_members(paths.iter().copied(), declared),
        uses,
    }
}

fn same_workspaces(a: Option<&Arc<Vec<String>>>, b: Option<&Arc<Vec<String>>>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        _ => false,
    }
}

/// The files no old town holds.
fn files_outside(files: &[FileEntry], old: Option<&Vec<OldTown>>) -> Option<Vec<FileEntry>> {
    let old = old?;
    let held: HashSet<&str> = old
        .iter()
        .flat_map(|o| o.members.values().flatten().map(String::as_str))
        .collect();
    Some(files.iter().filter(|f| !held.contains(&*f.identity)).cloned().collect())
}

struct LaidPart {
    part: Part,
    root_form: Form,
    built: Built,
}

/// Lays out one commit's city from the fold state and updates the state.
pub fn lay_city(snapshot: &Snapshot, state: &mut FoldState, options: &Options) -> Result<(City, Vec<PlatEvent>)> {
    if snapshot.files.len() > MAX_FILES {
        return Err(CitymapError::new(
            ErrorCode::SnapshotTooLarge,
            format!("a snapshot holds at most {MAX_FILES} files"),
        )
        .with("files", &snapshot.files.len()));
    }
    let key = setting_key(options);
    if state.plat.setting != key {
        return Err(CitymapError::new(
            ErrorCode::PlatSettingMismatch,
            format!("the plat is for {}, not {key}", state.plat.setting),
        )
        .with("plat", &state.plat.setting)
        .with("options", &key));
    }
    let derived = match state.cache.as_mut() {
        Some(cache) => {
            let kept = cache.derived.take().filter(|d| {
                Arc::ptr_eq(&d.files, &snapshot.files)
                    && same_workspaces(d.workspaces.as_ref(), snapshot.workspaces.as_ref())
            });
            kept.unwrap_or_else(|| derive(snapshot, Some(&mut cache.uses)))
        }
        None => derive(snapshot, None),
    };
    let layout = LayoutOptions {
        order: options.order,
        jog: options.jog,
        warp: options.warp,
        density_pct: options.density_pct,
        loops: options.loops,
    };
    let plat = &mut state.plat;
    let mut events: Vec<PlatEvent> = Vec::new();
    let is_split = |group: &str| {
        let name = group.rsplit_once('/').map_or(group, |(_, n)| n);
        options.split.iter().any(|s| s == group || s == name)
    };
    // A split group lends each member a town of its own; its other files stay in the main town.
    let town_roots: Vec<String> = derived
        .groups
        .iter()
        .flat_map(|g| {
            if is_split(g) {
                let prefix = format!("{g}/");
                derived
                    .member_folders
                    .iter()
                    .filter(|m| m.starts_with(&prefix))
                    .cloned()
                    .collect()
            } else {
                vec![g.clone()]
            }
        })
        .collect();
    let repository = &snapshot.repository;
    let mut groups: Vec<Part> = town_roots
        .iter()
        .map(|t| Part {
            name: t.clone(),
            key: format!("{repository}/{t}"),
            root: t.clone(),
            exclude: vec![],
            first_seen: snapshot.folder_first_seen(t),
        })
        .collect();
    groups.sort_by(|a, b| {
        a.first_seen
            .cmp(&b.first_seen)
            .then_with(|| compare_keys(&a.name, &b.name))
    });
    let main = Part {
        name: repository.clone(),
        key: repository.clone(),
        root: String::new(),
        exclude: town_roots.clone(),
        first_seen: 0,
    };
    let parts = std::iter::once(main).chain(groups);
    let tree_options = |part: &Part| TreeOptions {
        root: part.root.clone(),
        exclude: part.exclude.clone(),
        land_uses: options.land_uses.clone(),
        density_pct: options.density_pct,
    };
    let full_use = |i: usize, _: &FileEntry| derived.uses[i];
    let direct_use = |_: usize, f: &FileEntry| classify_land_use(&f.path);
    let mut trees = state.cache.as_mut().map(|c| &mut c.trees);
    let mut tree_for = |plat: &Plat, part: &Part| -> Built {
        let shares = plat
            .towns
            .get(&part.key)
            .map_or_else(|| Arc::new(Shares::new()), |t| t.shares.clone());
        let options = tree_options(part);
        if let Some(files) = files_outside(&snapshot.files, plat.old.get(&part.key)) {
            return build_tree(snapshot, &files, &options, &shares, &direct_use);
        }
        let range = under(&snapshot.files, &part.root);
        let start = range.start;
        let files = &snapshot.files[range.clone()];
        let ranged_use = |i: usize, _: &FileEntry| derived.uses[start + i];
        let Some(trees) = trees.as_deref_mut() else {
            return build_tree(snapshot, files, &options, &shares, &ranged_use);
        };
        // Built again from the same files and the shares it made, a tree comes out the same, shares and all: sharing
        // places every member it already holds. A part's folders and their first commits follow from its files.
        if let Some(kept) = trees.get(&part.key)
            && Arc::ptr_eq(&kept.built.shares, &shares)
            && kept.options == options
            && ((Arc::ptr_eq(&kept.files, &snapshot.files) && kept.range == range)
                || kept.files[kept.range.clone()] == *files)
        {
            return kept.built.clone();
        }
        let built = build_tree(snapshot, files, &options, &shares, &ranged_use);
        let kept = KeptTree {
            files: snapshot.files.clone(),
            range,
            options,
            built: built.clone(),
        };
        trees.insert(part.key.clone(), kept);
        built
    };

    // Each part's tree, without the files its old towns hold; a root switch first freezes the town as it stood.
    let mut laid_parts: Vec<LaidPart> = Vec::new();
    for part in parts {
        let mut built = tree_for(plat, &part);
        // The root's form is judged over the whole part, old towns' files included.
        let whole = plat.old.contains_key(&part.key).then(|| {
            build_tree(
                snapshot,
                &snapshot.files,
                &tree_options(&part),
                &Shares::new(),
                &full_use,
            )
            .tree
        });
        let previous = plat.root_forms.get(&part.key).copied();
        let root_form = classify_node(whole.as_deref().unwrap_or(&built.tree), previous);
        plat.root_forms.insert(part.key.clone(), root_form);
        let switched = previous.is_some_and(|p| root_form != p && !(p.is_flat() && root_form.is_flat()));
        if switched && let Some(before) = state.last.get(&part.key) {
            // A town laid before has its plat.
            let town_plat = plat.towns.get(&part.key).expect("a town laid before has its plat");
            let mut members: crate::json::Record<Vec<String>> = crate::json::Record::new();
            for lots in town_plat.shares.values() {
                for lot in lots {
                    members.insert(
                        lot.key.to_string(),
                        lot.members.iter().map(ToString::to_string).collect(),
                    );
                }
            }
            for lot in before.lots.iter().filter(|l| !l.vacant) {
                members.entry(lot.key.clone()).or_insert_with(|| vec![lot.key.clone()]);
            }
            let list = plat.old.entry(part.key.clone()).or_default();
            let name = old_town_name(&part.name, list.len() + 1);
            let old_key = old_town_name(&part.key, list.len() + 1);
            events.push(PlatEvent::new(
                "plat/old-town",
                vec![
                    ("key", Value::from(part.key.as_str())),
                    ("from", previous.expect("switched").as_str().into()),
                    ("to", root_form.as_str().into()),
                    ("lots", i64::try_from(before.lots.len()).expect("small").into()),
                ],
            ));
            list.push(OldTown {
                town: Town {
                    key: old_key,
                    name,
                    old: true,
                    ..(**before).clone()
                },
                members,
            });
            plat.towns.insert(part.key.clone(), TownPlat::default());
            built = tree_for(plat, &part);
        }
        if built.tree.demand > 0 {
            laid_parts.push(LaidPart { part, root_form, built });
        }
    }

    // Old towns stay where they stood; their lots stay lit while any of their files lives.
    let live: HashSet<&str> = if plat.old.is_empty() {
        HashSet::new()
    } else {
        snapshot.files.iter().map(|f| &*f.identity).collect()
    };
    let mut old_towns: Vec<(String, Town)> = Vec::new();
    for (successor, list) in &plat.old {
        for o in list {
            let mut town = o.town.clone();
            for lot in &mut town.lots {
                lot.vacant = !o
                    .members
                    .get(&lot.key)
                    .is_some_and(|m| m.iter().any(|m| live.contains(m.as_str())));
            }
            old_towns.push((successor.clone(), town));
        }
    }
    let blockers: Vec<(Pt, i64)> = old_towns.iter().map(|(_, t)| footprint(t)).collect();
    let mut placed: Vec<(Pt, i64)> = Vec::new();
    let mut towns: Vec<Arc<Town>> = Vec::new();
    let count = laid_parts.len();
    let origin = Pt::new(0, 0);
    for (i, LaidPart { part, root_form, built }) in laid_parts.into_iter().enumerate() {
        let mut town_plat = plat.towns.remove(&part.key).unwrap_or_default();
        town_plat.shares = built.shares.clone();
        let demand2 = built.tree.demand * 2;
        if town_plat.area2 == 0 || demand2 > town_plat.cap2 {
            if town_plat.area2 > 0 {
                events.push(PlatEvent::new(
                    "plat/grow",
                    vec![
                        ("key", part.key.as_str().into()),
                        ("from", town_plat.area2.into()),
                        ("to", demand2.into()),
                    ],
                ));
            }
            town_plat.area2 = town_plat.area2.max(demand2);
            town_plat.cap2 = floor_div(demand2 * GROWTH_PCT, 100);
        }
        let radius = radius_of(town_plat.area2);
        let clear = |c: Pt| {
            placed
                .iter()
                .chain(&blockers)
                .all(|&(centre, r)| distance2(centre, c) >= (r + radius + floor_div(GAP * 6, 10)).pow(2))
        };
        let outward = |from: Pt, d: Dir| {
            let mut length = isqrt(distance2(from, origin));
            let mut c = from;
            while !clear(c) {
                length += GAP / 2;
                c = along(d, length);
            }
            c
        };
        let centre = if let Some(c) = town_plat.centre {
            // A remembered town stays put unless a neighbour grew into it; then it moves straight outward.
            let d = if c == origin {
                dir(hash_angle(&part.key, 628))
            } else {
                normalise(c.x, c.y)
            };
            outward(c, d)
        } else if i == 0 {
            outward(origin, dir(hash_angle(&format!("{}#new", part.key), 628)))
        } else {
            let spread = floor_div(
                i64::try_from(i - 1).expect("small") * TURN,
                i64::try_from(count - 1).expect("small"),
            );
            let angle = -TURN / 4 + spread + floor_div(i64::from(fnv1a(&part.key) % 100) * 163, 100);
            let d = dir(angle);
            // The main town is placed first, so a group town starts beyond it.
            outward(along(d, placed[0].1 + radius + GAP), d)
        };
        town_plat.centre = Some(centre);
        placed.push((centre, radius));
        // A town is laid in its own coordinates, about its centre, then set down where it stands.
        let outline = outline_for(town_plat.area2, origin, &part.key);
        let cache = state
            .cache
            .as_mut()
            .map(|c| c.towns.entry(part.key.clone()).or_default());
        let hits_before = cache.as_ref().map_or(0, |c| c.hits);
        let laid = layout_town(
            &part.name,
            &part.key,
            &built.tree,
            &outline,
            town_plat,
            &layout,
            Some(root_form),
            cache,
        );
        if let Some(fold) = state.cache.as_mut() {
            let hits = fold.towns.get(&part.key).map_or(0, |c| c.hits);
            fold.hits += hits - hits_before;
        }
        events.extend(laid.events);
        plat.towns.insert(part.key.clone(), laid.plat);
        let mut town = laid.town;
        translate_town(&mut town, centre);
        town.stats.off_land = built.off_land;
        town.stats.docs = built.docs;
        let town = Arc::new(town);
        state.last.insert(part.key.clone(), town.clone());
        towns.push(town);
    }

    // Highways join each group town to the main town, and each old town to the town that replaced it.
    let main_count = towns.len();
    let mut all: Vec<Arc<Town>> = towns;
    let successors: Vec<String> = old_towns.iter().map(|(s, _)| s.clone()).collect();
    all.extend(old_towns.into_iter().map(|(_, t)| Arc::new(t)));
    let mut pairs: Vec<(usize, usize)> = (1..main_count).map(|t| (0, t)).collect();
    for (o, successor) in successors.iter().enumerate() {
        let found = all[..main_count].iter().position(|t| t.key == *successor);
        if let Some(s) = found.or((main_count > 0).then_some(0)) {
            pairs.push((s, main_count + o));
        }
    }
    let mut highways: Vec<Road> = Vec::new();
    for (from, to) in pairs {
        let toward_to = centroid(&all[to].outline);
        let toward_from = centroid(&all[from].outline);
        with_approach(&mut all[from], toward_to);
        with_approach(&mut all[to], toward_from);
        highways.push(highway_between(&all[from], &all[to]));
    }
    let bend = Warp::new(fnv1a(repository) ^ 0x0051_ed27, vec![(240, 5600)]);
    // The bend fades to nothing at both ends, so a highway meets its roads exactly.
    let fade = |pts: Vec<Pt>| -> Vec<Pt> {
        let n = i64::try_from(pts.len()).expect("small") - 1;
        pts.iter()
            .zip(0..)
            .map(|(&p, i)| {
                let weight = floor_div(4000 * i * (n - i), n * n);
                let q = bend.apply(p);
                Pt::new(
                    p.x + mul_div(q.x - p.x, weight, 1000, Rounding::Round),
                    p.y + mul_div(q.y - p.y, weight, 1000, Rounding::Round),
                )
            })
            .collect()
    };
    let highways: Vec<Road> = if options.warp {
        highways
            .into_iter()
            .map(|h| Road {
                pts: fade(densify(&h.pts, 80, false)),
                ..h
            })
            .collect()
    } else {
        highways
    };
    check_extent(&all, &highways)?;
    if let Some(cache) = state.cache.as_mut() {
        cache.derived = Some(derived);
    }
    Ok((
        City {
            repository: repository.clone(),
            commit: snapshot.commit.clone(),
            towns: all,
            highways,
        },
        events,
    ))
}
