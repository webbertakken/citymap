//! The town's folder tree: lots shared, chains collapsed, mass and demand summed.
use rustc_hash::{FxHashMap, FxHashSet};
use std::cmp::Ordering;
use std::fmt::Write as _;
use std::sync::Arc;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::constants::{LOT_AREA, MARGIN};
use crate::fixed::{compare_keys, floor_div, isqrt};
use crate::land_use::LandUse;
use crate::roads::road_excess;
use crate::snapshot::{FileEntry, Snapshot, folder_of};

/// The file a lot stands for: its oldest live member, keyed by the lot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LotSeed {
    pub key: Arc<str>,
    pub path: Arc<str>,
    pub land_use: LandUse,
    pub first_seen: i64,
}

/// A folder of the town's tree, with its land demand in fixed units².
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeNode {
    pub path: Arc<str>,
    /// Last segment, or the chain `a/b` after collapse, or the repository name at the root.
    pub name: String,
    pub depth: i64,
    pub first_seen: i64,
    /// Own lots after sharing, by (first seen, path).
    pub lots: Vec<LotSeed>,
    pub docs: i64,
    /// By `compare_keys(path)`.
    pub children: Vec<TreeNode>,
    pub mass_mille: i64,
    pub demand: i64,
    /// Two FNV-1a hashes of the folder's content: its lots, docs, first appearance and its children's digests.
    pub digest: u64,
}

/// A shared lot: its key (its founding identity) and its member identities.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShareRecord {
    pub key: Arc<str>,
    pub members: Vec<Arc<str>>,
}

/// Shared lots per `{folder}|{use}`, in the order the tree made them.
pub type Shares = IndexMap<String, Vec<ShareRecord>>;

/// What a tree is built from besides the snapshot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeOptions {
    pub root: String,
    pub exclude: Vec<String>,
    pub land_uses: Vec<LandUse>,
    pub density_pct: i64,
}

/// A built tree and what building it measured.
#[derive(Clone, Debug)]
pub struct Built {
    pub tree: Arc<TreeNode>,
    pub shares: Arc<Shares>,
    pub off_land: i64,
    pub docs: i64,
}

/// Land a neighbourhood needs for the given lot area: lots over density, plus a road margin round a square.
#[must_use]
pub fn land_for(lot_area: i64, density_pct: i64) -> i64 {
    if lot_area <= 0 {
        return 0;
    }
    let side = isqrt(floor_div(lot_area * 100, density_pct)) + 2 * MARGIN;
    side * side
}

fn parent_of(path: &str) -> &str {
    folder_of(path)
}

/// Oldest first, then by path.
fn by_age(a: (i64, &str), b: (i64, &str)) -> Ordering {
    a.0.cmp(&b.0).then_with(|| compare_keys(a.1, b.1))
}

#[derive(Default)]
struct Raw<'a> {
    files: Vec<(&'a FileEntry, LandUse)>,
    docs: i64,
    kids: FxHashSet<&'a str>,
}

/// Shares a folder's files into lots, remembering members; returns the lot seeds and records the new share records.
fn share_lots(folder: &str, files: &[(&FileEntry, LandUse)], shares: &Shares, out: &mut Shares) -> Vec<LotSeed> {
    let mut seeds = Vec::new();
    let mut buckets: [Vec<&FileEntry>; LandUse::ALL.len()] = Default::default();
    for &(file, land_use) in files {
        buckets[land_use as usize].push(file);
    }
    for (land_use, list) in LandUse::ALL.into_iter().zip(buckets) {
        if list.is_empty() {
            continue;
        }
        let capacity = land_use.lot_capacity();
        let live: FxHashMap<&str, &FileEntry> = list.iter().map(|f| (&*f.identity, *f)).collect();
        let key = format!("{folder}|{land_use}");
        let mut lots: Vec<ShareRecord> = shares
            .get(&key)
            .into_iter()
            .flatten()
            .map(|lot| ShareRecord {
                key: lot.key.clone(),
                members: lot
                    .members
                    .iter()
                    .filter(|m| live.contains_key(&***m))
                    .cloned()
                    .collect(),
            })
            .filter(|lot| !lot.members.is_empty())
            .collect();
        let placed: FxHashSet<Arc<str>> = lots.iter().flat_map(|lot| lot.members.iter().cloned()).collect();
        // Lots only gain members here, so the first lot with room never moves back: the search resumes where it was.
        let mut open = 0;
        for entry in &list {
            if placed.contains(&*entry.identity) {
                continue;
            }
            while open < lots.len() && lots[open].members.len() >= capacity {
                open += 1;
            }
            if open < lots.len() {
                lots[open].members.push(entry.identity.clone());
            } else {
                lots.push(ShareRecord {
                    key: entry.identity.clone(),
                    members: vec![entry.identity.clone()],
                });
            }
        }
        for lot in &lots {
            let oldest = lot
                .members
                .iter()
                .map(|m| live[&**m])
                .min_by(|a, b| by_age((a.first_seen, &a.path), (b.first_seen, &b.path)))
                .expect("a lot has a member");
            seeds.push(LotSeed {
                key: lot.key.clone(),
                path: oldest.path.clone(),
                land_use,
                first_seen: oldest.first_seen,
            });
        }
        out.insert(key, lots);
    }
    seeds.sort_by(|a, b| by_age((a.first_seen, &a.path), (b.first_seen, &b.path)));
    seeds
}

/// Two independent 32-bit FNV-1a hashes of a text, fed piece by piece: the text, and a NUL followed by the text.
struct Digest {
    a: u32,
    b: u32,
}

impl Digest {
    const OFFSET: u32 = 0x811c_9dc5;
    const PRIME: u32 = 0x0100_0193;

    fn new() -> Self {
        Self {
            a: Self::OFFSET,
            b: Self::OFFSET.wrapping_mul(Self::PRIME),
        }
    }

    fn feed(&mut self, text: &str) {
        for byte in text.bytes() {
            self.a = (self.a ^ u32::from(byte)).wrapping_mul(Self::PRIME);
            self.b = (self.b ^ u32::from(byte)).wrapping_mul(Self::PRIME);
        }
    }

    fn finish(&self) -> u64 {
        (u64::from(self.a) << 32) | u64::from(self.b)
    }
}

/// A chain of folders without land of their own, each with one child, merged into its last folder.
fn collapse_chain(mut n: TreeNode) -> TreeNode {
    while n.lots.is_empty() && n.docs == 0 && n.children.len() == 1 {
        let child = n.children.pop().expect("one child");
        n = TreeNode {
            name: format!("{}/{}", n.name, child.name),
            depth: n.depth,
            first_seen: n.first_seen.min(child.first_seen),
            ..child
        };
    }
    n
}

/// Below the root, a folder with no land of its own and a single child merges into that child.
fn collapse(node: TreeNode, is_root: bool) -> TreeNode {
    let mut n = if is_root { node } else { collapse_chain(node) };
    let depth = n.depth + 1;
    n.children = std::mem::take(&mut n.children)
        .into_iter()
        .map(|c| collapse(TreeNode { depth, ..c }, false))
        .collect();
    n
}

struct Builder<'a, 's> {
    snapshot: &'a Snapshot,
    root: &'a str,
    density_pct: i64,
    raw: FxHashMap<&'a str, Raw<'a>>,
    shares: &'s Shares,
    next: Shares,
}

impl<'a> Builder<'a, '_> {
    fn make(&mut self, path: &'a str, depth: i64) -> TreeNode {
        let entry = self.raw.remove(path).expect("every folder visited has a record");
        let lots = share_lots(path, &entry.files, self.shares, &mut self.next);
        let mut kids: Vec<&str> = entry.kids.into_iter().collect();
        kids.sort_by(|a, b| compare_keys(a, b));
        let children: Vec<TreeNode> = kids.into_iter().map(|kid| self.make(kid, depth + 1)).collect();
        let own_mass: i64 = entry.files.iter().map(|(_, u)| u.weight_mille()).sum();
        let mass_mille = own_mass + children.iter().map(|c| c.mass_mille).sum::<i64>();
        let items = land_for(i64::try_from(lots.len()).expect("small") * LOT_AREA, self.density_pct)
            + land_for(entry.docs * LOT_AREA / 2, self.density_pct)
            + children.iter().map(|c| c.demand).sum::<i64>();
        // The folder's own roads, where wider than a street, take land of their own.
        let count = children.len() + usize::from(!lots.is_empty()) + usize::from(entry.docs > 0);
        let excess = road_excess(mass_mille, count);
        let demand = if excess == 0 {
            items
        } else {
            let side = isqrt(items) + excess;
            side * side
        };
        let first_seen = self.snapshot.folder_first_seen(path);
        // Everything layout reads of a folder: a file joining a shared lot changes its mass but not its lots.
        let mut digest = Digest::new();
        let mut text = String::new();
        write!(text, "{path}|{first_seen}|{}|{mass_mille}|{demand}", entry.docs).expect("a string takes text");
        digest.feed(&text);
        for lot in &lots {
            text.clear();
            write!(text, "|{}>{}>{}>{}", lot.key, lot.path, lot.land_use, lot.first_seen).expect("text");
            digest.feed(&text);
        }
        for child in &children {
            text.clear();
            write!(text, "|{:016x}", child.digest).expect("text");
            digest.feed(&text);
        }
        let name = if path == self.root {
            if self.root.is_empty() {
                self.snapshot.repository.clone()
            } else {
                self.root.to_owned()
            }
        } else {
            path.rsplit_once('/').map_or(path, |(_, n)| n).to_owned()
        };
        TreeNode {
            digest: digest.finish(),
            path: path.into(),
            name,
            depth,
            first_seen,
            lots,
            docs: entry.docs,
            children,
            mass_mille,
            demand,
        }
    }
}

/// The town's folder tree: lots shared, chains collapsed, mass and demand summed. Pure: shares are copied.
#[must_use]
pub fn build_tree(
    snapshot: &Snapshot,
    files: &[FileEntry],
    options: &TreeOptions,
    shares: &Shares,
    use_of: &dyn Fn(usize, &FileEntry) -> LandUse,
) -> Built {
    let root = options.root.as_str();
    let prefix = if root.is_empty() {
        String::new()
    } else {
        format!("{root}/")
    };
    let mut raw: FxHashMap<&str, Raw> = FxHashMap::default();
    raw.entry(root).or_default();
    let (mut off_land, mut docs) = (0, 0);
    for (i, entry) in files.iter().enumerate() {
        let path: &str = &entry.path;
        if !path.starts_with(&prefix)
            || options
                .exclude
                .iter()
                .any(|e| path.len() > e.len() && path.starts_with(e.as_str()) && path.as_bytes()[e.len()] == b'/')
        {
            continue;
        }
        let land_use = use_of(i, entry);
        if !options.land_uses.contains(&land_use) {
            off_land += 1;
            continue;
        }
        let folder = folder_of(path);
        if land_use == LandUse::Docs {
            raw.entry(folder).or_default().docs += 1;
            docs += 1;
        } else {
            raw.entry(folder).or_default().files.push((entry, land_use));
        }
        let mut f = folder;
        // Each folder links into its parent once; a link already made means every folder above is linked too.
        while f != root {
            let parent = parent_of(f);
            if !raw.entry(parent).or_default().kids.insert(f) {
                break;
            }
            f = parent;
        }
    }
    let mut builder = Builder {
        snapshot,
        root,
        density_pct: options.density_pct,
        raw,
        shares,
        next: Shares::new(),
    };
    let tree = collapse(builder.make(root, 0), true);
    Built {
        tree: Arc::new(tree),
        shares: Arc::new(builder.next),
        off_land,
        docs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::land_use::{classify_land_use, default_land_uses};
    use crate::testing::{files, snapshot_of, tree_of};

    #[test]
    fn sizes_land_by_lots_over_density_plus_margin() {
        assert_eq!(land_for(0, 50), 0);
        assert_eq!(land_for(LOT_AREA, 50), (isqrt(LOT_AREA * 2) + 2 * MARGIN).pow(2));
    }

    #[test]
    fn collapses_chains_of_single_folders() {
        let tree = tree_of(&files("a/b/c", 3, 0, "ts", "f"));
        assert_eq!(tree.children.len(), 1);
        assert_eq!(tree.children[0].name, "a/b/c");
        assert_eq!(tree.children[0].depth, 1);
        assert_eq!(&*tree.children[0].path, "a/b/c");
    }

    #[test]
    fn shares_lots_of_light_files_and_remembers_members() {
        let mut list = files("cfg", 5, 0, "json", "c");
        list.extend(files("cfg", 1, 9, "ts", "s"));
        let snapshot = snapshot_of(&list);
        let options = TreeOptions {
            root: String::new(),
            exclude: vec![],
            land_uses: default_land_uses(),
            density_pct: 50,
        };
        let use_of = |_: usize, f: &FileEntry| classify_land_use(&f.path);
        let built = build_tree(&snapshot, &snapshot.files, &options, &Shares::new(), &use_of);
        let cfg = &built.tree.children[0];
        assert_eq!(cfg.lots.len(), 4);
        assert_eq!(built.shares["cfg|config"].len(), 3);
        assert_eq!(built.shares["cfg|config"][0].members.len(), 2);
        // Deleting a member keeps its lot; a newcomer joins the lot with room.
        let mut fewer: Vec<FileEntry> = list.iter().filter(|f| &*f.path != "cfg/c0001.json").cloned().collect();
        fewer.push(FileEntry::new("cfg/c0009.json", "cfg/c0009.json@20", 20));
        let again = snapshot_of(&fewer);
        let rebuilt = build_tree(&again, &again.files, &options, &built.shares, &use_of);
        assert_eq!(rebuilt.shares["cfg|config"][0].members.len(), 2);
        assert_eq!(&*rebuilt.shares["cfg|config"][0].members[1], "cfg/c0009.json@20");
    }

    #[test]
    fn counts_off_land_files_and_docs() {
        let mut list = files("src", 2, 0, "ts", "f");
        list.extend(files("src", 2, 0, "test.ts", "t"));
        list.extend(files("docs", 3, 0, "md", "d"));
        let snapshot = snapshot_of(&list);
        let options = TreeOptions {
            root: String::new(),
            exclude: vec![],
            land_uses: default_land_uses(),
            density_pct: 50,
        };
        let built = build_tree(&snapshot, &snapshot.files, &options, &Shares::new(), &|_, f| {
            classify_land_use(&f.path)
        });
        assert_eq!(built.off_land, 2);
        assert_eq!(built.docs, 3);
        assert_eq!(built.tree.mass_mille, 2000);
    }
}

#[cfg(test)]
mod ported {
    use super::*;
    use crate::constants::RoadClass;
    use crate::land_use::{classify_land_use, default_land_uses};
    use crate::testing::snapshot_with;

    fn at(path: &str, first_seen: i64) -> FileEntry {
        FileEntry::new(path, &format!("{path}@{first_seen}"), first_seen)
    }

    fn options() -> TreeOptions {
        TreeOptions {
            root: String::new(),
            exclude: vec![],
            land_uses: default_land_uses(),
            density_pct: 50,
        }
    }

    fn build(files: &[FileEntry], folders: &[(&str, i64)], options: &TreeOptions, shares: &Shares) -> Built {
        let snapshot = snapshot_with(files, folders, "demo");
        build_tree(&snapshot, &snapshot.files, options, shares, &|_, f| {
            classify_land_use(&f.path)
        })
    }

    fn find<'t>(node: &'t TreeNode, path: &str) -> Option<&'t TreeNode> {
        if &*node.path == path {
            Some(node)
        } else {
            node.children.iter().find_map(|c| find(c, path))
        }
    }

    fn paths(nodes: &[TreeNode]) -> Vec<&str> {
        nodes.iter().map(|c| &*c.path).collect()
    }

    #[test]
    fn is_the_square_of_the_lots_land_over_density_plus_a_road_margin() {
        assert_eq!(land_for(LOT_AREA, 50), (110 + 88) * (110 + 88));
    }

    #[test]
    fn names_the_root_after_the_repository_and_sorts_children_by_path() {
        let built = build(
            &[at("b/x.ts", 0), at("a/y.ts", 0), at("a/z.ts", 0)],
            &[],
            &options(),
            &Shares::new(),
        );
        assert_eq!(built.tree.name, "demo");
        assert_eq!(paths(&built.tree.children), ["a", "b"]);
    }

    #[test]
    fn keeps_tests_off_the_land_and_docs_as_parks_outside_the_mass_unless_tests_take_land() {
        let files = [
            at("src/a.ts", 0),
            at("src/a.test.ts", 0),
            at("src/README.md", 0),
            at("src/__fixtures__/f.json", 0),
        ];
        let built = build(&files, &[], &options(), &Shares::new());
        assert_eq!((built.off_land, built.docs, built.tree.mass_mille), (2, 1, 1000));
        let src = find(&built.tree, "src").expect("src");
        assert_eq!(
            (src.lots.iter().map(|l| &*l.path).collect::<Vec<_>>(), src.docs),
            (vec!["src/a.ts"], 1)
        );
        let mut uses = default_land_uses();
        uses.push(LandUse::Tests);
        let tested = TreeOptions {
            land_uses: uses,
            ..options()
        };
        let built = build(&[at("a.test.ts", 0), at("b.test.ts", 0)], &[], &tested, &Shares::new());
        assert_eq!(
            (built.off_land, built.tree.lots.len(), built.tree.mass_mille),
            (0, 1, 600)
        );
    }

    #[test]
    fn shares_lots_among_files_of_one_use_and_keeps_a_lot_while_a_member_lives() {
        let first = build(
            &[at("a.json", 0), at("b.json", 1), at("c.json", 2)],
            &[],
            &options(),
            &Shares::new(),
        );
        assert_eq!(
            first.tree.lots.iter().map(|l| &*l.key).collect::<Vec<_>>(),
            ["a.json@0", "c.json@2"]
        );
        let members = |s: &Shares| -> Vec<(String, Vec<String>)> {
            s["|config"]
                .iter()
                .map(|l| (l.key.to_string(), l.members.iter().map(ToString::to_string).collect()))
                .collect()
        };
        assert_eq!(
            members(&first.shares),
            [
                ("a.json@0".into(), vec!["a.json@0".into(), "b.json@1".into()]),
                ("c.json@2".into(), vec!["c.json@2".into()])
            ]
        );
        let pair = build(&[at("a.json", 0), at("b.json", 1)], &[], &options(), &Shares::new());
        let later = build(&[at("b.json", 1), at("c.json", 5)], &[], &options(), &pair.shares);
        assert_eq!(
            later.tree.lots.iter().map(|l| (&*l.key, &*l.path)).collect::<Vec<_>>(),
            [("a.json@0", "b.json")]
        );
        assert_eq!(
            members(&later.shares),
            [("a.json@0".into(), vec!["b.json@1".into(), "c.json@5".into()])]
        );
    }

    #[test]
    fn collapses_chains_and_builds_a_sub_town_from_its_root_leaving_excluded_folders_out() {
        let built = build(
            &[at("src/main/kotlin/app/A.kt", 3)],
            &[("src", 1), ("src/main", 2)],
            &options(),
            &Shares::new(),
        );
        let child = &built.tree.children[0];
        assert_eq!(
            (&*child.path, child.name.as_str(), child.depth, child.first_seen),
            ("src/main/kotlin/app", "src/main/kotlin/app", 1, 0)
        );
        let files = [at("packages/a/x.ts", 0), at("packages/b/y.ts", 0), at("src/z.ts", 0)];
        let group = build(
            &files,
            &[],
            &TreeOptions {
                root: "packages".into(),
                ..options()
            },
            &Shares::new(),
        );
        assert_eq!(group.tree.name, "packages");
        assert_eq!(paths(&group.tree.children), ["packages/a", "packages/b"]);
        let main = build(
            &files,
            &[],
            &TreeOptions {
                exclude: vec!["packages".into()],
                ..options()
            },
            &Shares::new(),
        );
        assert_eq!(paths(&main.tree.children), ["src"]);
    }

    #[test]
    fn sums_mass_and_demand_up_the_tree() {
        let built = build(
            &[
                at("a/x.ts", 0),
                at("a/y.json", 0),
                at("b/z.ts", 0),
                at("b/README.md", 0),
            ],
            &[],
            &options(),
            &Shares::new(),
        );
        assert_eq!(built.tree.mass_mille, 2500);
        let (a, b) = (find(&built.tree, "a").expect("a"), find(&built.tree, "b").expect("b"));
        assert_eq!(a.demand, land_for(2 * LOT_AREA, 50));
        assert_eq!(b.demand, land_for(LOT_AREA, 50) + land_for(LOT_AREA / 2, 50));
        assert_eq!(built.tree.demand, a.demand + b.demand);
    }

    #[test]
    fn budgets_the_land_for_a_folder_s_own_roads_above_a_street() {
        let big: Vec<FileEntry> = (0..24)
            .flat_map(|f| (0..1000).map(move |i| at(&format!("f{f}/x{i}.ts"), 0)))
            .collect();
        let built = build(&big, &[], &options(), &Shares::new());
        let sum: i64 = built.tree.children.iter().map(|c| c.demand).sum();
        let side = isqrt(sum) + RoadClass::Boulevard.width() - RoadClass::Street.width();
        assert_eq!(built.tree.demand, side * side);
        assert_eq!(built.tree.children[0].demand, land_for(1000 * LOT_AREA, 50));
    }

    #[test]
    fn orders_own_lots_by_first_appearance_then_path() {
        let built = build(
            &[at("b.ts", 0), at("a.ts", 2), at("c.ts", 0)],
            &[],
            &options(),
            &Shares::new(),
        );
        assert_eq!(
            built.tree.lots.iter().map(|l| &*l.path).collect::<Vec<_>>(),
            ["b.ts", "c.ts", "a.ts"]
        );
    }
}
