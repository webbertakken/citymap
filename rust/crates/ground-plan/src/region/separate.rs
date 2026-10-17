//! Separate towns: the kinds of folder whose members a setting lays as towns of their own.
use std::collections::{HashMap, HashSet};
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::fixed::compare_keys;
use crate::snapshot::{Snapshot, folder_of};

/// A separation: a kind of folder whose members each become a town.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Separation {
    Workspaces,
    Submodules,
    Apps,
    Packages,
    Libs,
    Crates,
    Services,
    Modules,
    Extensions,
    Plugins,
}

/// The separations, in the spec's order: declared workspaces, submodules, then folders named by their kind.
pub const SEPARATIONS: [Separation; 10] = [
    Separation::Workspaces,
    Separation::Submodules,
    Separation::Apps,
    Separation::Packages,
    Separation::Libs,
    Separation::Crates,
    Separation::Services,
    Separation::Modules,
    Separation::Extensions,
    Separation::Plugins,
];

/// Declared workspaces, submodules and apps stand apart unless a setting says otherwise.
pub const DEFAULT_SEPARATIONS: [Separation; 3] = [Separation::Workspaces, Separation::Submodules, Separation::Apps];

/// Separations named by a folder of their own name at the root: its child folders are the members.
pub const ROOT_KINDS: [Separation; 7] = [
    Separation::Apps,
    Separation::Packages,
    Separation::Libs,
    Separation::Crates,
    Separation::Services,
    Separation::Modules,
    Separation::Extensions,
];

/// The separations declared workspaces decide while the workspaces separation is on.
pub const OVERRIDDEN: [Separation; 2] = [Separation::Apps, Separation::Packages];

/// The one file an unread submodule is laid as, in its folder.
pub const GITLINK_FILE: &str = ".gitlink";

impl Separation {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Workspaces => "workspaces",
            Self::Submodules => "submodules",
            Self::Apps => "apps",
            Self::Packages => "packages",
            Self::Libs => "libs",
            Self::Crates => "crates",
            Self::Services => "services",
            Self::Modules => "modules",
            Self::Extensions => "extensions",
            Self::Plugins => "plugins",
        }
    }

    /// The separation a name names, if any.
    #[must_use]
    pub fn parse(name: &str) -> Option<Self> {
        SEPARATIONS.into_iter().find(|s| s.as_str() == name)
    }
}

impl fmt::Display for Separation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The separations named, in `SEPARATIONS` order and once each.
#[must_use]
pub fn separation_list(separate: &[Separation]) -> Vec<Separation> {
    SEPARATIONS.into_iter().filter(|s| separate.contains(s)).collect()
}

/// A folder laid as a town of its own, and the separation that names it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeparateMember {
    pub folder: String,
    pub by: Separation,
}

/// True when the root manifests declare at least one workspace member.
#[must_use]
pub fn declares_workspaces(snapshot: &Snapshot) -> bool {
    snapshot.workspaces.as_ref().is_some_and(|w| !w.is_empty())
}

fn is_plugins_folder(folder: &str) -> bool {
    folder == "plugins" || folder.ends_with("/plugins")
}

/// The folders that hold a file now: every ancestor of every file but the root.
fn folders_of(snapshot: &Snapshot) -> HashSet<&str> {
    let mut folders = HashSet::new();
    for file in snapshot.files.iter() {
        let mut f = folder_of(&file.path);
        while !f.is_empty() && folders.insert(f) {
            f = folder_of(f);
        }
    }
    folders
}

/// The folders of a set with no other folder of the set above them.
fn outermost<'a>(folders: &HashSet<&'a str>) -> Vec<&'a str> {
    let nested = |folder: &str| {
        let mut up = folder_of(folder);
        while !up.is_empty() {
            if folders.contains(up) {
                return true;
            }
            up = folder_of(up);
        }
        false
    };
    folders.iter().copied().filter(|f| !nested(f)).collect()
}

/// One separation's candidate folders that hold a file now.
fn candidates<'a>(
    snapshot: &'a Snapshot,
    held: &HashSet<&'a str>,
    s: Separation,
    overridden: bool,
) -> HashSet<&'a str> {
    let listed = |list: Option<&'a Vec<String>>| -> HashSet<&'a str> {
        list.into_iter()
            .flatten()
            .map(String::as_str)
            .filter(|f| held.contains(f))
            .collect()
    };
    match s {
        Separation::Workspaces => listed(snapshot.workspaces.as_deref()),
        Separation::Submodules => listed(snapshot.submodules.as_deref()),
        _ if overridden && OVERRIDDEN.contains(&s) => HashSet::new(),
        Separation::Plugins => held
            .iter()
            .copied()
            .filter(|f| is_plugins_folder(folder_of(f)))
            .collect(),
        _ => held.iter().copied().filter(|f| folder_of(f) == s.as_str()).collect(),
    }
}

/// The members of the separations on, over the folders that hold files.
fn members_in(snapshot: &Snapshot, held: &HashSet<&str>, separate: &[Separation]) -> Vec<SeparateMember> {
    let list = separation_list(separate);
    let overridden = list.contains(&Separation::Workspaces) && declares_workspaces(snapshot);
    let mut by_folder: HashMap<&str, Separation> = HashMap::new();
    for s in list {
        for folder in outermost(&candidates(snapshot, held, s, overridden)) {
            by_folder.entry(folder).or_insert(s);
        }
    }
    let mut members: Vec<SeparateMember> = by_folder
        .into_iter()
        .map(|(folder, by)| SeparateMember {
            folder: folder.to_owned(),
            by,
        })
        .collect();
    members.sort_by(|a, b| compare_keys(&a.folder, &b.folder));
    members
}

/// The folders the separations on lay apart, each once, sorted.
#[must_use]
pub fn separate_members(snapshot: &Snapshot, separate: &[Separation]) -> Vec<SeparateMember> {
    members_in(snapshot, &folders_of(snapshot), separate)
}

/// The separations that, each alone, lay something apart: the ones a viewer offers for this city.
#[must_use]
pub fn separable(snapshot: &Snapshot) -> Vec<Separation> {
    let held = folders_of(snapshot);
    SEPARATIONS
        .into_iter()
        .filter(|&s| !members_in(snapshot, &held, &[s]).is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::snapshot::FileEntry;
    use crate::testing::{snapshot_of, sources};

    use Separation::{Apps, Crates, Extensions, Libs, Modules, Packages, Plugins, Services, Submodules, Workspaces};

    fn repo(folders: &[&str]) -> Snapshot {
        let entries: Vec<FileEntry> = folders.iter().flat_map(|f| sources(f, 2, 0)).collect();
        snapshot_of(&entries)
    }

    fn list(folders: &[&str]) -> Arc<Vec<String>> {
        Arc::new(folders.iter().map(|f| (*f).to_owned()).collect())
    }

    fn members(snapshot: &Snapshot, separate: &[Separation]) -> Vec<String> {
        separate_members(snapshot, separate)
            .into_iter()
            .map(|m| format!("{}:{}", m.by, m.folder))
            .collect()
    }

    #[test]
    fn are_ten_in_the_spec_s_order_with_workspaces_submodules_and_apps_on_by_default() {
        assert_eq!(
            SEPARATIONS.map(Separation::as_str),
            [
                "workspaces",
                "submodules",
                "apps",
                "packages",
                "libs",
                "crates",
                "services",
                "modules",
                "extensions",
                "plugins"
            ]
        );
        assert_eq!(DEFAULT_SEPARATIONS, [Workspaces, Submodules, Apps]);
        assert_eq!(Separation::parse("plugins"), Some(Plugins));
        assert_eq!(Separation::parse("split"), None);
    }

    #[test]
    fn lists_the_separations_named_once_each_in_canonical_order() {
        assert_eq!(separation_list(&[Plugins, Apps, Plugins]), [Apps, Plugins]);
        assert_eq!(separation_list(&DEFAULT_SEPARATIONS), DEFAULT_SEPARATIONS);
        assert_eq!(separation_list(&[]), []);
    }

    #[test]
    fn lays_each_child_folder_of_a_root_folder_kind_apart_and_nothing_of_the_same_name_deeper_down() {
        let snapshot = repo(&[
            "apps/web",
            "apps/api",
            "packages/a",
            "libs/x",
            "crates/c",
            "services/s",
            "modules/m",
        ]);
        assert_eq!(
            members(
                &snapshot,
                &[Apps, Packages, Libs, Crates, Services, Modules, Extensions]
            ),
            [
                "apps:apps/api",
                "apps:apps/web",
                "crates:crates/c",
                "libs:libs/x",
                "modules:modules/m",
                "packages:packages/a",
                "services:services/s"
            ]
        );
        assert_eq!(
            members(&repo(&["src/apps/web", "tools/extensions/e"]), &[Apps, Extensions]),
            Vec::<String>::new()
        );
    }

    #[test]
    fn lays_each_folder_in_any_plugins_folder_apart_at_any_depth() {
        let snapshot = repo(&["plugins/git", "lib/plugins/zsh", "deep/a/plugins/b/c", "pluginsx/y"]);
        assert_eq!(
            members(&snapshot, &[Plugins]),
            [
                "plugins:deep/a/plugins/b",
                "plugins:lib/plugins/zsh",
                "plugins:plugins/git"
            ]
        );
    }

    #[test]
    fn keeps_the_folder_kind_s_own_files_where_they_lie() {
        let entries: Vec<FileEntry> = sources("apps", 3, 0)
            .into_iter()
            .chain(sources("apps/web", 2, 0))
            .collect();
        assert_eq!(members(&snapshot_of(&entries), &[Apps]), ["apps:apps/web"]);
    }

    #[test]
    fn lays_every_declared_workspace_member_apart_and_none_without_a_declaration() {
        let snapshot = Snapshot {
            workspaces: Some(list(&["packages/a", "website"])),
            ..repo(&["website", "packages/a", "packages/a/inner"])
        };
        assert_eq!(
            members(&snapshot, &[Workspaces]),
            ["workspaces:packages/a", "workspaces:website"]
        );
        assert_eq!(members(&repo(&["packages/a"]), &[Workspaces]), Vec::<String>::new());
        let empty = Snapshot {
            workspaces: Some(list(&[])),
            ..repo(&["packages/a"])
        };
        assert_eq!(members(&empty, &[Workspaces]), Vec::<String>::new());
    }

    #[test]
    fn lets_declared_workspaces_decide_apps_and_packages_while_the_workspaces_separation_is_on() {
        let snapshot = Snapshot {
            workspaces: Some(list(&["apps/web"])),
            ..repo(&["apps/web", "apps/admin", "packages/a", "libs/x"])
        };
        assert_eq!(
            members(&snapshot, &[Workspaces, Apps, Packages, Libs]),
            ["workspaces:apps/web", "libs:libs/x"]
        );
        assert_eq!(
            members(&snapshot, &[Apps, Packages]),
            ["apps:apps/admin", "apps:apps/web", "packages:packages/a"]
        );
        // Nothing declared: apps and packages act as set.
        assert_eq!(members(&repo(&["apps/web"]), &[Workspaces, Apps]), ["apps:apps/web"]);
    }

    #[test]
    fn lays_every_submodule_apart_read_or_not() {
        let mut entries = sources("vendor/lib", 2, 0);
        entries.push(FileEntry::new("ext/x/.gitlink", "ext/x/.gitlink@0", 0));
        let snapshot = Snapshot {
            submodules: Some(list(&["ext/x", "vendor/lib"])),
            ..snapshot_of(&entries)
        };
        assert_eq!(
            members(&snapshot, &[Submodules]),
            ["submodules:ext/x", "submodules:vendor/lib"]
        );
    }

    #[test]
    fn keeps_the_outermost_member_within_a_separation_nests_members_of_different_ones_and_names_a_folder_once() {
        let snapshot = Snapshot {
            workspaces: Some(list(&["apps/web"])),
            submodules: Some(list(&["apps/web/plugins/p", "plugins/a/plugins/b"])),
            ..repo(&["plugins/a", "plugins/a/plugins/b", "apps/web", "apps/web/plugins/p"])
        };
        assert_eq!(
            members(&snapshot, &[Workspaces, Submodules, Plugins]),
            [
                "workspaces:apps/web",
                "submodules:apps/web/plugins/p",
                "plugins:plugins/a",
                "submodules:plugins/a/plugins/b"
            ]
        );
    }

    #[test]
    fn names_no_folder_that_holds_no_file_now() {
        let snapshot = Snapshot {
            workspaces: Some(list(&["gone"])),
            submodules: Some(list(&["empty"])),
            folder_first_seen: Arc::new(HashMap::from([("apps/old".to_owned(), 0)])),
            ..repo(&["apps/web"])
        };
        assert_eq!(members(&snapshot, &[Workspaces, Submodules]), Vec::<String>::new());
        assert_eq!(members(&snapshot, &[Apps]), ["apps:apps/web"]);
    }

    #[test]
    fn lays_the_defaults_when_the_defaults_are_named() {
        assert_eq!(
            members(&repo(&["apps/web", "packages/a"]), &DEFAULT_SEPARATIONS),
            ["apps:apps/web"]
        );
    }

    #[test]
    fn records_the_separations_that_each_alone_lay_something_apart() {
        let snapshot = Snapshot {
            workspaces: Some(list(&["packages/a"])),
            ..repo(&["apps/web", "packages/a", "lib/plugins/p"])
        };
        assert_eq!(separable(&snapshot), [Workspaces, Apps, Packages, Plugins]);
        assert_eq!(separable(&repo(&["src"])), []);
    }

    #[test]
    fn says_whether_the_snapshot_declares_workspaces() {
        let with = |w: Option<Arc<Vec<String>>>| Snapshot {
            workspaces: w,
            ..repo(&["a"])
        };
        assert!(declares_workspaces(&with(Some(list(&["a"])))));
        assert!(!declares_workspaces(&with(Some(list(&[])))));
        assert!(!declares_workspaces(&with(None)));
    }
}
