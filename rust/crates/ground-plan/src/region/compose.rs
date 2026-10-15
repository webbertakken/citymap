//! A city composed from one commit's tree: its towns, their outlines and places, old towns and highways.
use std::borrow::Cow;
use std::cell::OnceCell;
use std::collections::{HashMap, HashSet};
use std::ops::Range;

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
use crate::town::layout::{TownDraft, layout_town};
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
    /// Each part's last whole tree (old towns' files included), which judges its form.
    wholes: HashMap<String, KeptTree>,
    /// Land use per path, remembered for a million paths: every commit asks again about the same paths.
    uses: FxHashMap<Arc<str>, LandUse>,
}

/// A part's last tree, the files it was built from, and where they lay in the snapshot it was last checked against.
struct KeptTree {
    source: Arc<Vec<FileEntry>>,
    range: Range<usize>,
    olds: usize,
    files: Vec<FileEntry>,
    options: TreeOptions,
    built: Built,
}

/// True when two file lists hold the same entries; the reader shares unchanged entries, so most compare by pointer.
fn same_files(a: &[FileEntry], b: &[FileEntry]) -> bool {
    let same = |x: &Arc<str>, y: &Arc<str>| Arc::ptr_eq(x, y) || x == y;
    a.len() == b.len()
        && a.iter()
            .zip(b)
            .all(|(x, y)| x.first_seen == y.first_seen && same(&x.path, &y.path) && same(&x.identity, &y.identity))
}

/// The files under a root: a contiguous range of the sorted list, as every path under `root/` sorts between `root/`
/// and `root0` (`0` follows `/`).
fn under(files: &[FileEntry], root: &str) -> Range<usize> {
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
    pub last: HashMap<String, LastTown>,
    pub cache: Option<FoldCache>,
    current: Option<Current>,
}

impl FoldState {
    /// A fold's state from a plat; with locality caches when `cache`.
    #[must_use]
    pub fn new(plat: Plat, cache: bool) -> Self {
        Self {
            plat,
            last: HashMap::new(),
            cache: cache.then(FoldCache::default),
            current: None,
        }
    }
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

/// A part's files: the range under its root, less the files its old towns hold, each with its index in the snapshot.
struct PartFiles<'a> {
    files: Cow<'a, [FileEntry]>,
    indices: Option<Vec<usize>>,
    start: usize,
}

impl PartFiles<'_> {
    /// The index in the snapshot of the part's i-th file.
    fn index(&self, i: usize) -> usize {
        self.indices.as_ref().map_or(self.start + i, |indices| indices[i])
    }
}

fn part_files<'a>(snapshot: &'a Snapshot, range: Range<usize>, old: Option<&Vec<OldTown>>) -> PartFiles<'a> {
    let Some(old) = old else {
        return PartFiles {
            files: Cow::Borrowed(&snapshot.files[range.clone()]),
            indices: None,
            start: range.start,
        };
    };
    let held: HashSet<&str> = old
        .iter()
        .flat_map(|o| o.members.values().flatten().map(String::as_str))
        .collect();
    let (mut files, mut indices) = (Vec::new(), Vec::new());
    for i in range {
        let f = &snapshot.files[i];
        if !held.contains(&*f.identity) {
            files.push(f.clone());
            indices.push(i);
        }
    }
    PartFiles {
        files: Cow::Owned(files),
        indices: Some(indices),
        start: 0,
    }
}

/// What a part's tree is built from.
struct TreeInput<'a> {
    range: Range<usize>,
    old: Option<&'a Vec<OldTown>>,
    options: TreeOptions,
    shares: Arc<Shares>,
    /// Whether the shares are the ones the tree made (a part's own tree), or none (its whole tree).
    reshared: bool,
}

/// A part's tree: kept from the last commit when its files and the shares it made are the same, as building again
/// from them gives the same tree and the same shares (sharing places every member it already holds; a part's folders
/// and their first commits follow from its files).
fn kept_tree(
    snapshot: &Snapshot,
    input: TreeInput,
    uses: &[LandUse],
    kept: Option<(&mut HashMap<String, KeptTree>, &str)>,
) -> Built {
    let olds = input.old.map_or(0, Vec::len);
    let build = |part: &PartFiles| {
        let use_of = |i: usize, _: &FileEntry| uses[part.index(i)];
        build_tree(snapshot, &part.files, &input.options, &input.shares, &use_of)
    };
    let Some((trees, key)) = kept else {
        return build(&part_files(snapshot, input.range, input.old));
    };
    let settled = |kept: &KeptTree| {
        kept.olds == olds
            && kept.options == input.options
            && (!input.reshared || Arc::ptr_eq(&kept.built.shares, &input.shares))
    };
    if let Some(kept) = trees.get(key)
        && settled(kept)
        && Arc::ptr_eq(&kept.source, &snapshot.files)
        && kept.range == input.range
    {
        return kept.built.clone();
    }
    let part = part_files(snapshot, input.range.clone(), input.old);
    if let Some(kept) = trees.get_mut(key)
        && settled(kept)
        && same_files(&kept.files, &part.files)
    {
        kept.source = snapshot.files.clone();
        kept.range = input.range;
        return kept.built.clone();
    }
    let built = build(&part);
    let files = part.files.into_owned();
    let entry = KeptTree {
        source: snapshot.files.clone(),
        range: input.range,
        olds,
        files,
        options: input.options,
        built: built.clone(),
    };
    trees.insert(key.to_owned(), entry);
    built
}

struct LaidPart {
    part: Part,
    root_form: Form,
    built: Built,
}

/// A town as last laid: its draft, where it stands, its land counts; drawn when first asked for.
pub struct LastTown {
    draft: TownDraft,
    centre: Pt,
    off_land: i64,
    docs: i64,
    drawn: OnceCell<Arc<Town>>,
}

impl LastTown {
    /// The town drawn and set down where it stands.
    fn town(&self, cache: Option<&mut TownCache>) -> Arc<Town> {
        self.drawn
            .get_or_init(|| {
                let mut town = self.draft.town(cache);
                translate_town(&mut town, self.centre);
                town.stats.off_land = self.off_land;
                town.stats.docs = self.docs;
                Arc::new(town)
            })
            .clone()
    }
}

/// The city of the last lay, before it is drawn: its towns by part key, and the files that light its old towns.
struct Current {
    repository: String,
    commit: String,
    towns: Vec<String>,
    files: Arc<Vec<FileEntry>>,
}

/// Old towns stay where they stood; their lots stay lit while any of their files lives. With their successors.
fn old_towns(plat: &Plat, files: &[FileEntry]) -> Vec<(String, Town)> {
    let live: HashSet<&str> = if plat.old.is_empty() {
        HashSet::new()
    } else {
        files.iter().map(|f| &*f.identity).collect()
    };
    let mut old = Vec::new();
    for (successor, list) in &plat.old {
        for o in list {
            let mut town = o.town.clone();
            for lot in &mut town.lots {
                lot.vacant = !o
                    .members
                    .get(&lot.key)
                    .is_some_and(|m| m.iter().any(|m| live.contains(m.as_str())));
            }
            old.push((successor.clone(), town));
        }
    }
    old
}

/// The cache of one town, when the fold keeps caches.
fn town_cache<'c>(cache: &'c mut Option<FoldCache>, key: &str) -> Option<&'c mut TownCache> {
    cache.as_mut().map(|c| c.towns.entry(key.to_owned()).or_default())
}

/// Lays out one commit's city as the TypeScript `layCity` does, and draws it.
pub fn lay_city(snapshot: &Snapshot, state: &mut FoldState, options: &Options) -> Result<(City, Vec<PlatEvent>)> {
    let events = lay(snapshot, state, options)?;
    Ok((current_city(state, options)?, events))
}

/// Draws the city of the last lay: its towns, its old towns and the highways between them.
pub fn current_city(state: &mut FoldState, options: &Options) -> Result<City> {
    let Some(current) = state.current.as_ref() else {
        return Err(CitymapError::new(ErrorCode::EngineInvariant, "no city has been laid"));
    };
    let mut all: Vec<Arc<Town>> = Vec::new();
    for key in &current.towns {
        all.push(state.last[key].town(town_cache(&mut state.cache, key)));
    }
    let main_count = all.len();
    let old = old_towns(&state.plat, &current.files);
    all.extend(old.iter().map(|(_, t)| Arc::new(t.clone())));
    // Highways join each group town to the main town, and each old town to the town that replaced it.
    let mut pairs: Vec<(usize, usize)> = (1..main_count).map(|t| (0, t)).collect();
    for (o, (successor, _)) in old.iter().enumerate() {
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
    let bend = Warp::new(fnv1a(&current.repository) ^ 0x0051_ed27, vec![(240, 5600)]);
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
    Ok(City {
        repository: current.repository.clone(),
        commit: current.commit.clone(),
        towns: all,
        highways,
    })
}

/// Lays out one commit's city into the fold state: every plan decision is made and the plat updated; drawing the city
/// waits for `current_city`. A town's outline is checked against the coordinate limit at every lay.
pub fn lay(snapshot: &Snapshot, state: &mut FoldState, options: &Options) -> Result<Vec<PlatEvent>> {
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
    let FoldState {
        plat,
        last,
        cache,
        current,
    } = state;
    let derived = match cache.as_mut() {
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
    // A part's tree without the files its old towns hold; or, `whole`, with them and no shares (to judge its form).
    let tree_for = |plat: &Plat, cache: &mut Option<FoldCache>, part: &Part, whole: bool| -> Built {
        let old = if whole { None } else { plat.old.get(&part.key) };
        let shares = match plat.towns.get(&part.key) {
            Some(town) if !whole => town.shares.clone(),
            _ => Arc::new(Shares::new()),
        };
        let memory = cache
            .as_mut()
            .map(|c| (if whole { &mut c.wholes } else { &mut c.trees }, part.key.as_str()));
        let input = TreeInput {
            range: under(&snapshot.files, &part.root),
            old,
            options: tree_options(part),
            shares,
            reshared: !whole,
        };
        kept_tree(snapshot, input, &derived.uses, memory)
    };

    // Each part's tree, without the files its old towns hold; a root switch first freezes the town as it stood.
    let mut laid_parts: Vec<LaidPart> = Vec::new();
    for part in parts {
        let mut built = tree_for(plat, cache, &part, false);
        // The root's form is judged over the whole part, old towns' files included.
        let whole = plat
            .old
            .contains_key(&part.key)
            .then(|| tree_for(plat, cache, &part, true).tree);
        let previous = plat.root_forms.get(&part.key).copied();
        let root_form = classify_node(whole.as_deref().unwrap_or(&built.tree), previous);
        plat.root_forms.insert(part.key.clone(), root_form);
        let switched = previous.is_some_and(|p| root_form != p && !(p.is_flat() && root_form.is_flat()));
        if switched && let Some(before) = last.get(&part.key) {
            let before = before.town(town_cache(cache, &part.key));
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
                    ..(*before).clone()
                },
                members,
            });
            plat.towns.insert(part.key.clone(), TownPlat::default());
            built = tree_for(plat, cache, &part, false);
        }
        if built.tree.demand > 0 {
            laid_parts.push(LaidPart { part, root_form, built });
        }
    }

    // Old towns stand where they stood: no town is placed on them.
    let blockers: Vec<(Pt, i64)> = plat.old.values().flatten().map(|o| footprint(&o.town)).collect();
    let mut placed: Vec<(Pt, i64)> = Vec::new();
    let mut towns: Vec<String> = Vec::new();
    let mut outlines: Vec<Vec<Pt>> = plat.old.values().flatten().map(|o| o.town.outline.clone()).collect();
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
        let town_cache = town_cache(cache, &part.key);
        let hits_before = town_cache.as_ref().map_or(0, |c| c.hits);
        let laid = layout_town(
            &part.name,
            &part.key,
            &built.tree,
            &outline,
            town_plat,
            &layout,
            Some(root_form),
            town_cache,
        );
        if let Some(fold) = cache.as_mut() {
            let hits = fold.towns.get(&part.key).map_or(0, |c| c.hits);
            fold.hits += hits - hits_before;
        }
        events.extend(laid.events);
        plat.towns.insert(part.key.clone(), laid.plat);
        let mut drawn = laid
            .draft
            .outline(cache.as_mut().map(|c| c.towns.entry(part.key.clone()).or_default()));
        for p in &mut drawn {
            p.x += centre.x;
            p.y += centre.y;
        }
        outlines.push(drawn);
        let last_town = LastTown {
            draft: laid.draft,
            centre,
            off_land: built.off_land,
            docs: built.docs,
            drawn: OnceCell::new(),
        };
        last.insert(part.key.clone(), last_town);
        towns.push(part.key);
    }
    check_outlines(&outlines)?;
    if let Some(cache) = cache.as_mut() {
        cache.derived = Some(derived);
    }
    *current = Some(Current {
        repository: repository.clone(),
        commit: snapshot.commit.clone(),
        towns,
        files: snapshot.files.clone(),
    });
    Ok(events)
}

/// Rejects a lay whose towns reach the coordinate limit.
fn check_outlines(outlines: &[Vec<Pt>]) -> Result<()> {
    for p in outlines.iter().flatten() {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::RoadClass;
    use crate::fold::initial_state;
    use crate::json::canonical_json;
    use crate::land_use::default_land_uses;
    use crate::testing::{files, snapshot_with, sources};

    fn options() -> Options {
        Options {
            density_pct: 50,
            land_uses: default_land_uses(),
            order: Order::CentreOut,
            jog: Jog::TopLevel,
            warp: false,
            loops: true,
            split: vec!["apps".into()],
        }
    }

    fn at(index: i64, entries: &[FileEntry]) -> Snapshot {
        Snapshot {
            index,
            ..snapshot_with(entries, &[], "demo")
        }
    }

    fn manifest(folder: &str, born: i64) -> FileEntry {
        let path = format!("{folder}/package.json");
        FileEntry::new(&path, &format!("{path}@{born}"), born)
    }

    fn monorepo(extra: &[FileEntry]) -> Vec<FileEntry> {
        let mut all = sources("src", 120, 0);
        all.push(manifest("packages/a", 0));
        all.extend(sources("packages/a", 80, 200));
        all.push(manifest("packages/b", 0));
        all.extend(sources("packages/b", 60, 400));
        all.push(manifest("apps/web", 600));
        all.extend(sources("apps/web", 50, 600));
        all.push(manifest("apps/api", 700));
        all.extend(sources("apps/api", 40, 700));
        all.extend_from_slice(extra);
        all
    }

    fn keys(city: &City) -> Vec<&str> {
        city.towns.iter().map(|t| t.key.as_str()).collect()
    }

    fn codes(events: &[PlatEvent]) -> Vec<&'static str> {
        events.iter().map(|e| e.code).collect()
    }

    #[test]
    fn lays_the_main_town_at_the_origin_and_the_others_round_it_joined_by_highways() {
        let mut state = initial_state(&options(), None, true);
        let (city, events) = lay_city(&at(0, &monorepo(&[])), &mut state, &options()).expect("a city");
        assert_eq!(keys(&city), ["demo", "demo/apps/api", "demo/apps/web", "demo/packages"]);
        assert_eq!(
            city.towns.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
            ["demo", "apps/api", "apps/web", "packages"]
        );
        assert_eq!(city.highways.len(), 3);
        assert!(!codes(&events).contains(&"plat/grow"));
        let main = centroid(&city.towns[0].outline);
        assert!(main.x.pow(2) < 1000i64.pow(2));
        assert!(city.towns[1..].iter().all(|t| centroid(&t.outline) != main));
    }

    #[test]
    fn counts_land_per_town_files_without_land_and_docs() {
        let mut list = sources("src", 30, 0);
        list.push(FileEntry::new("src/README.md", "r", 0));
        list.push(FileEntry::new("src/a.test.ts", "t", 0));
        let (city, _) =
            lay_city(&at(0, &list), &mut initial_state(&options(), None, true), &options()).expect("a city");
        assert_eq!((city.towns[0].stats.off_land, city.towns[0].stats.docs), (1, 1));
    }

    #[test]
    fn is_deterministic_warp_included() {
        let warped = Options {
            warp: true,
            ..options()
        };
        let a = lay_city(&at(0, &monorepo(&[])), &mut initial_state(&warped, None, true), &warped)
            .expect("a city")
            .0;
        let b = lay_city(
            &at(0, &monorepo(&[])),
            &mut initial_state(&warped, None, false),
            &warped,
        )
        .expect("a city")
        .0;
        assert_eq!(canonical_json(&a).expect("json"), canonical_json(&b).expect("json"));
        assert!(a.highways[0].pts.len() > 2);
    }

    #[test]
    fn grows_a_town_outward_about_its_centre_without_moving_its_lots() {
        let mut state = initial_state(&options(), None, true);
        let (first, _) = lay_city(&at(0, &sources("", 26, 0)), &mut state, &options()).expect("a city");
        let slots = state.plat.towns["demo"].grids[""].slots.clone();
        let (grown, events) = lay_city(&at(1, &sources("", 39, 0)), &mut state, &options()).expect("a city");
        assert_eq!(
            (first.towns[0].form, grown.towns[0].form),
            (Form::Neighbourhood, Form::Neighbourhood)
        );
        assert_eq!(codes(&events), ["plat/grow"]);
        for (lot, slot) in &slots {
            assert_eq!(state.plat.towns["demo"].grids[""].slots.get(lot), Some(slot));
        }
    }

    #[test]
    fn freezes_the_town_as_an_old_town_when_its_root_switches_form_lit_while_its_files_live() {
        let six: Vec<FileEntry> = ["a", "b", "c", "d", "e", "f"]
            .iter()
            .zip(0..)
            .flat_map(|(d, i)| sources(d, 100, i * 200))
            .collect();
        let mut state = initial_state(&options(), None, true);
        let (first, _) = lay_city(&at(0, &six), &mut state, &options()).expect("a city");
        assert_eq!(first.towns[0].form, Form::Polycentric);
        let mut heavy: Vec<FileEntry> = six.iter().filter(|f| !f.path.starts_with("f/")).cloned().collect();
        heavy.extend(sources("core", 2000, 5000));
        let (second, events) = lay_city(&at(1, &heavy), &mut state, &options()).expect("a city");
        assert!(codes(&events).contains(&"plat/old-town"));
        let old = second.towns.iter().find(|t| t.old).expect("an old town");
        assert_eq!(old.name, "demo old town");
        assert!(old.lots.iter().any(|l| l.vacant) && old.lots.iter().any(|l| !l.vacant));
        assert_ne!(second.highways.len(), 0);
        // The new town holds only files the old town does not: the newcomers.
        assert_eq!(second.towns.iter().find(|t| !t.old).expect("a town").stats.lots, 2000);
        let mut more = heavy.clone();
        for (d, i) in ["p", "q", "r", "s", "t", "u", "v", "w"].iter().zip(0..) {
            more.extend(sources(d, 700, 9000 + i * 1000));
        }
        let (third, _) = lay_city(&at(2, &more), &mut state, &options()).expect("a city");
        let olds: Vec<&str> = third.towns.iter().filter(|t| t.old).map(|t| t.name.as_str()).collect();
        assert_eq!(olds, ["demo old town", "demo old town 2"]);
        assert_eq!(keys(&third), ["demo", "demo old town", "demo old town 2"]);
    }

    #[test]
    fn moves_between_neighbourhood_forms_in_place_without_an_old_town() {
        let mut state = initial_state(&options(), None, true);
        let (first, _) = lay_city(&at(0, &sources("", 10, 0)), &mut state, &options()).expect("a city");
        let (second, _) = lay_city(&at(1, &sources("", 60, 0)), &mut state, &options()).expect("a city");
        assert_eq!(first.towns[0].form, Form::Hamlet);
        assert_ne!(second.towns[0].form, Form::Hamlet);
        assert!(second.towns.iter().all(|t| !t.old));
    }

    #[test]
    fn gives_a_town_without_roads_an_approach_street_for_its_highway() {
        let mut list = sources("src", 3, 0);
        list.push(manifest("packages/a", 0));
        list.extend(sources("packages/a", 2, 0));
        list.push(manifest("packages/b", 0));
        list.extend(sources("packages/b", 2, 0));
        let (city, _) =
            lay_city(&at(0, &list), &mut initial_state(&options(), None, true), &options()).expect("a city");
        assert_eq!(city.highways.len(), 1);
        assert!(city.towns.iter().all(|t| !t.roads.is_empty()));
    }

    #[test]
    fn skips_a_repository_with_no_land_at_all() {
        let list = [FileEntry::new("a.test.ts", "a", 0)];
        let (city, _) =
            lay_city(&at(0, &list), &mut initial_state(&options(), None, true), &options()).expect("a city");
        assert_eq!((city.towns.len(), city.highways.len()), (0, 0));
    }

    #[test]
    fn keeps_group_towns_where_they_stood_and_lays_nothing_new_when_nothing_grew() {
        let mut state = initial_state(&options(), None, true);
        let (first, _) = lay_city(&at(0, &monorepo(&[])), &mut state, &options()).expect("a city");
        let (again, events) = lay_city(&at(1, &monorepo(&[])), &mut state, &options()).expect("a city");
        assert_eq!(codes(&events), Vec::<&str>::new());
        assert_eq!(
            canonical_json(&again.towns).expect("json"),
            canonical_json(&first.towns).expect("json")
        );
    }

    #[test]
    fn rejects_a_plat_laid_for_another_setting() {
        let mut tests = default_land_uses();
        tests.push(LandUse::Tests);
        let other = Options {
            land_uses: tests,
            ..options()
        };
        let error = lay_city(
            &at(0, &sources("", 3, 0)),
            &mut initial_state(&other, None, true),
            &options(),
        )
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::PlatSettingMismatch);
        let unsplit = Options {
            split: vec![],
            ..options()
        };
        let error = lay_city(
            &at(0, &sources("", 3, 0)),
            &mut initial_state(&unsplit, None, true),
            &options(),
        )
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::PlatSettingMismatch);
        assert_eq!(
            setting_key(&Options {
                split: vec!["packages".into(), "apps".into()],
                ..options()
            }),
            format!("{}|split:apps,packages", land_key(&default_land_uses()))
        );
    }

    #[test]
    fn splits_the_groups_it_is_asked_to_and_keeps_a_split_group_s_own_files_home() {
        let both = Options {
            split: vec!["apps".into(), "packages".into()],
            ..options()
        };
        let (city, _) = lay_city(&at(0, &monorepo(&[])), &mut initial_state(&both, None, true), &both).expect("a city");
        assert_eq!(
            keys(&city),
            [
                "demo",
                "demo/apps/api",
                "demo/apps/web",
                "demo/packages/a",
                "demo/packages/b"
            ]
        );
        let none = Options {
            split: vec![],
            ..options()
        };
        let (city, _) = lay_city(&at(0, &monorepo(&[])), &mut initial_state(&none, None, true), &none).expect("a city");
        assert_eq!(keys(&city), ["demo", "demo/apps", "demo/packages"]);
        let shared = monorepo(&sources("apps/shared", 20, 900));
        let (city, _) =
            lay_city(&at(0, &shared), &mut initial_state(&options(), None, true), &options()).expect("a city");
        assert_eq!(
            city.towns[0]
                .lots
                .iter()
                .filter(|l| l.path.starts_with("apps/shared/"))
                .count(),
            20
        );
    }

    #[test]
    fn takes_members_from_the_manifests_when_the_snapshot_carries_them() {
        let declared = Snapshot {
            workspaces: Some(Arc::new(vec![
                "apps/web".into(),
                "packages/a".into(),
                "packages/b".into(),
            ])),
            ..at(0, &monorepo(&[]))
        };
        let (city, _) = lay_city(&declared, &mut initial_state(&options(), None, true), &options()).expect("a city");
        assert_eq!(keys(&city), ["demo", "demo/packages"]);
    }

    #[test]
    fn rejects_a_city_reaching_past_the_coordinate_limit() {
        let town = |x: i64| {
            let (mut city, _) = lay_city(
                &at(0, &sources("", 3, 0)),
                &mut initial_state(&options(), None, false),
                &options(),
            )
            .expect("a city");
            let mut town = Arc::unwrap_or_clone(city.towns.remove(0));
            town.outline = vec![Pt::new(x, 0)];
            Arc::new(town)
        };
        assert!(check_extent(&[town(COORD_LIMIT - 1), town(-(COORD_LIMIT - 1))], &[]).is_ok());
        assert_eq!(
            check_extent(&[town(COORD_LIMIT)], &[]).unwrap_err().code,
            ErrorCode::CityTooLarge
        );
        let highway = Road {
            cls: RoadClass::Street,
            pts: vec![Pt::new(0, -COORD_LIMIT)],
            width: None,
        };
        assert_eq!(check_extent(&[], &[highway]).unwrap_err().code, ErrorCode::CityTooLarge);
    }

    #[test]
    fn joins_nearby_dead_ends_with_short_lanes_by_default_and_never_inverts_a_cut() {
        let paths = include_str!("../../../../../packages/ground-plan/src/testing/react-head-paths.txt");
        let list: Vec<FileEntry> = paths
            .lines()
            .filter(|l| !l.is_empty())
            .map(|p| FileEntry::new(p, p, 0))
            .collect();
        let snapshot = snapshot_with(&list, &[], "react");
        let lanes = |loops: bool| {
            let options = Options { loops, ..options() };
            let (city, _) = lay_city(&snapshot, &mut initial_state(&options, None, true), &options).expect("a city");
            city.towns
                .iter()
                .flat_map(|t| {
                    t.roads
                        .iter()
                        .filter(|r| r.cls == RoadClass::Lane)
                        .cloned()
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        };
        let off = lanes(false);
        let added: Vec<Road> = lanes(true).into_iter().filter(|l| !off.contains(l)).collect();
        assert_ne!(added.len(), 0);
        assert!(
            added
                .iter()
                .all(|l| (l.pts[0].x - l.pts[1].x).pow(2) + (l.pts[0].y - l.pts[1].y).pow(2)
                    <= crate::town::connectors::LOOP_REACH.pow(2))
        );
        let mut state = initial_state(&options(), None, true);
        lay_city(&snapshot, &mut state, &options()).expect("a city");
        for town in state.plat.towns.values() {
            for (key, cut) in &town.cuts {
                if let Some((parent, _)) = key.rsplit_once('>')
                    && let Some(parent) = town.cuts.get(parent)
                {
                    assert!(
                        cut.cls.rank() <= parent.cls.rank(),
                        "{key}: {:?} under {:?}",
                        cut.cls,
                        parent.cls
                    );
                }
            }
        }
    }

    #[test]
    fn finds_the_files_under_a_root_as_a_range() {
        let list = files("x", 2, 0, "ts", "f");
        assert_eq!(under(&list, "x"), 0..2);
        assert_eq!(under(&list, "y"), 2..2);
    }
}
