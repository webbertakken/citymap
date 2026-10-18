//! Workspace members and groups, from paths alone or from the members the root manifests declare.
use std::collections::{HashMap, HashSet};

use crate::fixed::compare_keys;
use crate::land_use::LandUse;
use crate::snapshot::folder_of;

const MANIFESTS: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "composer.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "mix.exs",
];
const MANIFEST_SUFFIXES: &[&str] = &[".csproj", ".gemspec"];

/// Whether a file name is a package manifest: a workspace member is a folder directly holding one.
#[must_use]
pub fn is_manifest_name(name: &str) -> bool {
    MANIFESTS.contains(&name) || MANIFEST_SUFFIXES.iter().any(|s| name.ends_with(s))
}

/// The folders with no other folder of the set above them, sorted.
fn outermost(folders: &HashSet<&str>) -> Vec<String> {
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
    let mut out: Vec<String> = folders.iter().filter(|f| !nested(f)).map(|f| (*f).to_owned()).collect();
    out.sort_by(|a, b| compare_keys(a, b));
    out
}

/// Folders other than the root that directly hold a package manifest (or the declared ones), outermost only, sorted.
#[must_use]
pub fn workspace_members<'a>(paths: impl Iterator<Item = &'a str>, declared: Option<&[String]>) -> Vec<String> {
    if let Some(declared) = declared {
        return outermost(&declared.iter().map(String::as_str).collect());
    }
    let mut folders = HashSet::new();
    for path in paths {
        let folder = folder_of(path);
        let name = path.rsplit_once('/').map_or(path, |(_, n)| n);
        if !folder.is_empty() && is_manifest_name(name) {
            folders.insert(folder);
        }
    }
    outermost(&folders)
}

/// Folders holding two or more members whose land (tests, fixtures and docs aside) is at least half source.
#[must_use]
pub fn workspace_groups(paths: &[&str], use_of: impl Fn(usize) -> LandUse, declared: Option<&[String]>) -> Vec<String> {
    let members = workspace_members(paths.iter().copied(), declared);
    let mut by_parent: HashMap<&str, usize> = HashMap::new();
    for member in &members {
        let parent = folder_of(member);
        if !parent.is_empty() {
            *by_parent.entry(parent).or_insert(0) += 1;
        }
    }
    // One pass over the paths: each credits its land to every candidate folder above it.
    let mut tally: HashMap<&str, (usize, usize)> = by_parent
        .into_iter()
        .filter(|&(_, n)| n >= 2)
        .map(|(parent, _)| (parent, (0, 0)))
        .collect();
    for (i, path) in paths.iter().enumerate() {
        let land_use = use_of(i);
        if matches!(land_use, LandUse::Tests | LandUse::Fixtures | LandUse::Docs) {
            continue;
        }
        let mut folder = folder_of(path);
        while !folder.is_empty() {
            if let Some((land, source)) = tally.get_mut(folder) {
                *land += 1;
                if land_use == LandUse::Source {
                    *source += 1;
                }
            }
            folder = folder_of(folder);
        }
    }
    let groups: HashSet<&str> = tally
        .into_iter()
        .filter(|&(_, (land, source))| land > 0 && 2 * source >= land)
        .map(|(g, _)| g)
        .collect();
    outermost(&groups)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::land_use::classify_land_use;

    fn groups(paths: &[&str]) -> Vec<String> {
        workspace_groups(paths, |i| classify_land_use(paths[i]), None)
    }

    #[test]
    fn finds_folders_holding_a_manifest_outermost_only() {
        let paths = [
            "package.json",
            "packages/a/package.json",
            "packages/a/fixtures/x/package.json",
            "crates/b/Cargo.toml",
            "app/App.csproj",
            "gems/c/c.gemspec",
            "src/index.ts",
        ];
        assert_eq!(
            workspace_members(paths.into_iter(), None),
            ["app", "crates/b", "gems/c", "packages/a"]
        );
        let declared = ["pkg/b".to_owned(), "apps/a".to_owned(), "apps/a/inner".to_owned()];
        assert_eq!(
            workspace_members(paths.into_iter(), Some(&declared)),
            ["apps/a", "pkg/b"]
        );
    }

    #[test]
    fn keeps_folders_with_two_or_more_members_whose_land_is_mostly_source() {
        let paths = [
            "packages/a/package.json",
            "packages/a/src/index.ts",
            "packages/b/package.json",
            "packages/b/src/index.ts",
            "packages/b/README.md",
            "fixtures/x/package.json",
            "fixtures/y/package.json",
            "lone/z/package.json",
            "toplevel/package.json",
        ];
        assert_eq!(groups(&paths), ["packages"]);
    }

    #[test]
    fn drops_a_group_whose_land_is_mostly_not_source() {
        let paths = [
            "tools/a/package.json",
            "tools/a/a.json",
            "tools/b/package.json",
            "tools/b/b.json",
            "tools/b/x.ts",
        ];
        assert_eq!(groups(&paths), Vec::<String>::new());
    }

    #[test]
    fn drops_groups_nested_inside_groups() {
        let paths = [
            "packages/a/package.json",
            "packages/a/index.ts",
            "packages/b/package.json",
            "packages/b/index.ts",
            "packages/group/c/package.json",
            "packages/group/c/index.ts",
            "packages/group/d/package.json",
            "packages/group/d/index.ts",
        ];
        assert_eq!(groups(&paths), ["packages"]);
    }
}
