//! The mutable state of laying out one town, the items land is cut between, and the plat's memory of each folder.
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

use crate::archetype::Form;
use crate::city::{BlockKind, District, Road};
use crate::constants::RoadClass;
use crate::fixed::{MemoWarp, Poly, Pt, fnv1a};
use crate::land_use::LandUse;
use crate::plat::TownPlat;
use crate::tree::{LotSeed, TreeNode};

/// A detail value of an event: printed as it is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Value {
    Text(String),
    Number(i64),
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Text(text) => f.write_str(text),
            Self::Number(n) => write!(f, "{n}"),
        }
    }
}

impl From<&str> for Value {
    fn from(text: &str) -> Self {
        Self::Text(text.to_owned())
    }
}

impl From<String> for Value {
    fn from(text: String) -> Self {
        Self::Text(text)
    }
}

impl From<i64> for Value {
    fn from(n: i64) -> Self {
        Self::Number(n)
    }
}

/// A decision the layout made, for logs: a stable code and its detail, in order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlatEvent {
    pub code: &'static str,
    pub detail: Vec<(&'static str, Value)>,
}

impl PlatEvent {
    #[must_use]
    pub fn new(code: &'static str, detail: Vec<(&'static str, Value)>) -> Self {
        Self { code, detail }
    }

    /// `code key=value …`, as the CLI logs it.
    #[must_use]
    pub fn line(&self) -> String {
        let mut line = self.code.to_owned();
        line.push(' ');
        let fields: Vec<String> = self.detail.iter().map(|(k, v)| format!("{k}={v}")).collect();
        line.push_str(&fields.join(" "));
        line
    }
}

/// Which order a folder's items take: centre-out (the default) or first appearance.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Order {
    CentreOut,
    FirstSeen,
}

impl Order {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CentreOut => "centre-out",
            Self::FirstSeen => "first-seen",
        }
    }
}

/// Which long cuts jog into pinwheels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Jog {
    Off,
    TopLevel,
    All,
}

impl Jog {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::TopLevel => "top-level",
            Self::All => "all",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LayoutOptions {
    pub order: Order,
    pub jog: Jog,
    pub warp: bool,
    pub density_pct: i64,
    /// Lanes joining nearby dead ends.
    pub loops: bool,
}

/// What a folder's land is cut between: a child folder, the folder's own lots, or its own park.
#[derive(Clone, Debug)]
pub enum ItemKind<'t> {
    Folder(&'t TreeNode),
    Lots { lots: &'t [LotSeed], district: Arc<str> },
    Park { district: Arc<str> },
}

#[derive(Clone, Debug)]
pub struct Item<'t> {
    pub key: Arc<str>,
    pub demand: i64,
    pub mass_mille: i64,
    pub first_seen: i64,
    pub kind: ItemKind<'t>,
}

/// A lot as laid, its district already a tint seed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DraftLot {
    pub pts: Vec<Pt>,
    pub key: Arc<str>,
    pub address: String,
    pub vacant: bool,
    pub path: Arc<str>,
    pub land_use: LandUse,
    pub district: u32,
    pub form: Option<Form>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DraftBlock {
    pub pts: Vec<Pt>,
    pub district: u32,
    pub kind: BlockKind,
    pub form: Option<Form>,
}

/// What a folder's layout depended on: replaying it is exact while all of it holds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CacheKey {
    pub digest: u64,
    pub name: String,
    pub depth: i64,
    pub district: Arc<str>,
    pub pts: Vec<Pt>,
    pub widths: Vec<i64>,
}

/// What laying out one folder appended, to replay when nothing about it changed.
#[derive(Clone, Debug)]
pub struct CacheEntry {
    pub key: CacheKey,
    pub roads: Vec<Road>,
    pub blocks: Vec<DraftBlock>,
    pub lots: Vec<DraftLot>,
    pub districts: Vec<District>,
    pub water: Vec<Vec<Pt>>,
    pub overflow: i64,
    pub lot_area2: i64,
    pub overflow_events: Vec<PlatEvent>,
}

/// One town's locality cache: per folder path, its last layout, valid while the town's constants hold; and the
/// town's memoised warp.
#[derive(Debug, Default)]
pub struct TownCache {
    pub constants: String,
    pub entries: HashMap<Arc<str>, CacheEntry>,
    pub hits: u64,
    pub warp: Option<(i64, MemoWarp)>,
    /// Each neighbourhood's last grid, by its key.
    pub grids: HashMap<String, crate::town::neighbourhood::KeptGrid>,
}

/// The mutable state of laying out one town.
pub struct Ctx<'t, 'c> {
    pub options: &'t LayoutOptions,
    pub plat: TownPlat,
    pub root: &'t TreeNode,
    pub root_form: Option<Form>,
    pub events: Vec<PlatEvent>,
    pub roads: Vec<Road>,
    pub blocks: Vec<DraftBlock>,
    pub lots: Vec<DraftLot>,
    pub districts: Vec<District>,
    pub water: Vec<Vec<Pt>>,
    pub land_area2: i64,
    pub cache: Option<&'c mut TownCache>,
    pub form: Form,
    pub overflow: i64,
    pub lot_area2: i64,
}

impl<'t> Ctx<'t, '_> {
    #[must_use]
    pub fn new(options: &'t LayoutOptions, plat: TownPlat, root: &'t TreeNode, land_area2: i64) -> Self {
        Self {
            options,
            plat,
            root,
            root_form: None,
            events: Vec::new(),
            roads: Vec::new(),
            blocks: Vec::new(),
            lots: Vec::new(),
            districts: Vec::new(),
            water: Vec::new(),
            land_area2,
            cache: None,
            form: Form::Neighbourhood,
            overflow: 0,
            lot_area2: 0,
        }
    }

    pub fn emit(&mut self, code: &'static str, detail: Vec<(&'static str, Value)>) {
        self.events.push(PlatEvent::new(code, detail));
    }

    /// Adds a road, when there is one.
    pub fn road(&mut self, pts: Option<Vec<Pt>>, cls: RoadClass, width: Option<i64>) {
        if let Some(pts) = pts {
            self.roads.push(Road { cls, pts, width });
        }
    }

    pub fn block(&mut self, pts: Vec<Pt>, district: &str, kind: BlockKind) {
        self.blocks.push(DraftBlock {
            pts,
            district: tint(district),
            kind,
            form: None,
        });
    }

    /// Drops every remembered cut, grid and radial layout of the folder at path.
    pub fn forget(&mut self, path: &str) {
        let before = self.plat.cuts.len() + self.plat.grids.len() + self.plat.radial.len();
        self.plat.cuts.retain(|key, _| !owned(key, path));
        self.plat.grids.retain(|key, _| !owned(key, path));
        self.plat.radial.retain(|key, _| !owned(key, path));
        let count = before - (self.plat.cuts.len() + self.plat.grids.len() + self.plat.radial.len());
        if count > 0 {
            let count = i64::try_from(count).expect("small");
            self.emit("plat/forget", vec![("key", path.into()), ("count", count.into())]);
        }
    }
}

#[must_use]
pub fn mass_of(items: &[Item]) -> i64 {
    items.iter().map(|i| i.mass_mille).sum()
}

#[must_use]
pub fn demand_of(items: &[Item]) -> i64 {
    items.iter().map(|i| i.demand).sum()
}

/// A district's tint seed: its key without pinwheel separators.
#[must_use]
pub fn seed_key(key: &str) -> String {
    key.replace('>', "")
}

/// True when key belongs to the folder at path (the folder itself, its descendants, or its sub-keys).
#[must_use]
pub fn owned(key: &str, path: &str) -> bool {
    if path.is_empty() || key == path {
        return true;
    }
    key.len() > path.len() && key.starts_with(path) && matches!(key.as_bytes()[path.len()], b'/' | b'>' | b'#')
}

/// A district's tint: the hash of its key.
#[must_use]
pub fn tint(district: &str) -> u32 {
    fnv1a(district)
}

/// A polygon whose every edge has the given road width.
#[must_use]
pub fn to_poly(pts: &[Pt], width: i64) -> Poly {
    Poly::uniform(pts, width)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::RoadClass;
    use crate::plat::RadialRecord;
    use crate::testing::{layout_options, tree_of};

    fn radial() -> RadialRecord {
        RadialRecord {
            bounds: vec![],
            caps: crate::json::Record::new(),
            core: "a".into(),
            order: vec![],
            scale_mille: 0,
            start: 0,
        }
    }

    #[test]
    fn adds_a_road_only_when_there_is_one() {
        let (options, root) = (layout_options(), tree_of(&[]));
        let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
        ctx.road(None, RoadClass::Street, None);
        ctx.road(Some(vec![Pt::new(0, 0)]), RoadClass::Lane, None);
        assert_eq!(
            ctx.roads,
            vec![crate::city::Road {
                pts: vec![Pt::new(0, 0)],
                cls: RoadClass::Lane,
                width: None
            }]
        );
    }

    #[test]
    fn forgets_a_folder_s_records_and_says_so_only_when_there_were_any() {
        let (options, root) = (layout_options(), tree_of(&[]));
        let mut ctx = Ctx::new(&options, TownPlat::default(), &root, 0);
        ctx.forget("src");
        assert_eq!(ctx.events, vec![]);
        ctx.plat.forms.insert("src".into(), Form::Hamlet);
        ctx.plat.radial.insert("src>L".into(), radial());
        ctx.plat.radial.insert("srcx".into(), radial());
        ctx.forget("src");
        assert_eq!(ctx.plat.radial.keys().collect::<Vec<_>>(), ["srcx"]);
        assert_eq!(
            ctx.events,
            vec![PlatEvent::new(
                "plat/forget",
                vec![("key", "src".into()), ("count", 1.into())]
            )]
        );
        assert_eq!(ctx.events[0].line(), "plat/forget key=src count=1");
    }

    #[test]
    fn owns_a_folder_s_own_keys_descendants_and_sub_keys_and_the_root_owns_everything() {
        assert!(["src", "src/a", "src>L", "src#lots"].iter().all(|k| owned(k, "src")));
        assert!(!owned("srcx", "src"));
        assert!(owned("anything", ""));
    }
}
