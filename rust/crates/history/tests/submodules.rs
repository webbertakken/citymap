//! Submodules on real, temporary repositories: the reader, the fold and the single state.
mod common;

use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::Arc;

use citymap_ground_plan::snapshot::Snapshot;
use citymap_history::submodules::{Expanded, Pins, SUBMODULE_DEPTH, SubmoduleReader, Unread, UnreadReason};
use citymap_history::{HistoryEvent, HistoryItem, ReadOptions, Strides, read_history, read_tree};
use common::{Repo, git};

/// A parent repository with `lib` added as a submodule at `path`; the parent, the lib, and the lib's pin.
fn with_submodule(path: &str) -> (Repo, Repo, String) {
    let lib = Repo::with(&[("src/a.ts", "a"), ("src/b.ts", "b")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), path]);
    parent.commit("add lib");
    let pin = lib.git(&["rev-parse", "HEAD"]);
    (parent, lib, pin)
}

/// The gitlinks of a repository's HEAD: path → pinned commit.
fn gitlinks(dir: &Path) -> HashMap<String, String> {
    git(dir, &["ls-tree", "-r", "HEAD"])
        .lines()
        .filter(|l| l.starts_with("160000"))
        .map(|l| {
            let (meta, path) = l.split_once('\t').expect("a tab");
            (path.to_owned(), meta.split(' ').nth(2).expect("a pin").to_owned())
        })
        .collect()
}

fn gitmodules(dir: &Path) -> String {
    git(dir, &["show", "HEAD:.gitmodules"])
}

fn expand_one(
    reader: &mut SubmoduleReader,
    links: &HashMap<String, String>,
    names: Option<&str>,
    path: &str,
) -> Arc<Expanded> {
    let expanded = reader.expand_all(links, names).expect("an expansion");
    expanded.into_iter().find(|(p, _)| p == path).expect("the gitlink").1
}

fn one(path: &str, pin: &str) -> HashMap<String, String> {
    HashMap::from([(path.to_owned(), pin.to_owned())])
}

fn keys(found: &Expanded) -> Vec<&str> {
    found.files.keys().map(String::as_str).collect()
}

fn unread(path: &str, reason: UnreadReason) -> Unread {
    Unread {
        path: path.to_owned(),
        reason,
    }
}

#[test]
fn reads_an_initialised_submodule_s_pinned_tree_from_git_modules_under_its_folder() {
    let (parent, _lib, pin) = with_submodule("vendor/lib");
    let names = gitmodules(parent.path());
    let lib = expand_one(
        &mut SubmoduleReader::new(parent.path()),
        &gitlinks(parent.path()),
        Some(&names),
        "vendor/lib",
    );
    assert_eq!(lib.commit, pin);
    assert_eq!(keys(&lib), ["vendor/lib/src/a.ts", "vendor/lib/src/b.ts"]);
    assert_eq!(lib.submodules, ["vendor/lib"]);
    assert_eq!(lib.unread, []);
}

#[test]
fn reads_a_submodule_whose_working_folder_is_gone_from_its_git_data() {
    let (parent, _lib, pin) = with_submodule("vendor/lib");
    // The git data names the folder as its working tree; the reader does not need it.
    std::fs::remove_dir_all(parent.path().join("vendor/lib")).expect("removed");
    let names = gitmodules(parent.path());
    let lib = expand_one(
        &mut SubmoduleReader::new(parent.path()),
        &gitlinks(parent.path()),
        Some(&names),
        "vendor/lib",
    );
    assert_eq!(lib.commit, pin);
    assert_eq!(keys(&lib), ["vendor/lib/src/a.ts", "vendor/lib/src/b.ts"]);
    assert_eq!(lib.unread, []);
}

#[test]
fn lays_a_submodule_without_git_data_as_one_gitlink_file_its_blob_the_pin() {
    let (parent, _lib, pin) = with_submodule("vendor/lib");
    let clone = Repo::new();
    clone.git(&["pull", "-q", &parent.url(), "main"]);
    let names = gitmodules(clone.path());
    let lib = expand_one(
        &mut SubmoduleReader::new(clone.path()),
        &gitlinks(clone.path()),
        Some(&names),
        "vendor/lib",
    );
    assert_eq!(
        lib.files.iter().collect::<Vec<_>>(),
        [(&"vendor/lib/.gitlink".to_owned(), &pin)]
    );
    assert_eq!(lib.unread, [unread("vendor/lib", UnreadReason::NoGitData)]);
}

#[test]
fn says_when_the_pinned_commit_is_not_in_the_submodule_s_git_data() {
    let (parent, _lib, _) = with_submodule("vendor/lib");
    let missing = "1".repeat(40);
    let names = gitmodules(parent.path());
    let lib = expand_one(
        &mut SubmoduleReader::new(parent.path()),
        &one("vendor/lib", &missing),
        Some(&names),
        "vendor/lib",
    );
    assert_eq!(lib.unread, [unread("vendor/lib", UnreadReason::MissingCommit)]);
    assert_eq!(
        lib.files.iter().collect::<Vec<_>>(),
        [(&"vendor/lib/.gitlink".to_owned(), &missing)]
    );
}

#[test]
fn reads_nested_submodules_from_their_parent_s_git_data() {
    let deep = Repo::with(&[("d.ts", "d")]);
    let lib = Repo::with(&[("l.ts", "l")]);
    lib.git(&["submodule", "add", "-q", &deep.url(), "inner/deep"]);
    lib.commit("add deep");
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.git(&["submodule", "update", "-q", "--init", "--recursive"]);
    parent.commit("add lib");
    let names = gitmodules(parent.path());
    let found = expand_one(
        &mut SubmoduleReader::new(parent.path()),
        &gitlinks(parent.path()),
        Some(&names),
        "vendor/lib",
    );
    let mut files = keys(&found);
    files.sort_unstable();
    assert_eq!(
        files,
        [
            "vendor/lib/.gitmodules",
            "vendor/lib/inner/deep/d.ts",
            "vendor/lib/l.ts"
        ]
    );
    assert_eq!(found.submodules, ["vendor/lib", "vendor/lib/inner/deep"]);
}

#[test]
fn reads_a_submodule_whose_git_data_is_its_own_git_folder_in_the_working_tree() {
    let lib = Repo::with(&[("x.ts", "x")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["clone", "-q", &lib.url(), "vendor/lib"]);
    parent.write(
        ".gitmodules",
        "[submodule \"lib\"]\n\tpath = vendor/lib\n\turl = ../lib\n",
    );
    parent.git(&["add", ".gitmodules", "vendor/lib"]);
    parent.commit("embed");
    let names = gitmodules(parent.path());
    let found = expand_one(
        &mut SubmoduleReader::new(parent.path()),
        &gitlinks(parent.path()),
        Some(&names),
        "vendor/lib",
    );
    assert_eq!(keys(&found), ["vendor/lib/x.ts"]);
}

#[test]
fn follows_a_git_file_only_to_git_data_inside_the_repository() {
    let (parent, _lib, _) = with_submodule("vendor/lib");
    let other = Repo::with(&[("y.ts", "y")]);
    // A gitlink named by no section takes its path as its name; here no modules/<name> exists, so its .git file decides.
    let far = parent.path().join("vendor/far");
    std::fs::create_dir_all(&far).expect("a folder");
    let dot_git = far.join(".git");
    std::fs::write(&dot_git, format!("gitdir: {}\n", other.path().join(".git").display())).expect("a file");
    let pin = other.git(&["rev-parse", "HEAD"]);
    let read = |pin: &str| {
        expand_one(
            &mut SubmoduleReader::new(parent.path()),
            &one("vendor/far", pin),
            None,
            "vendor/far",
        )
    };
    assert_eq!(read(&pin).unread, [unread("vendor/far", UnreadReason::NoGitData)]);
    std::fs::write(&dot_git, "not a gitdir line\n").expect("a file");
    assert_eq!(read(&pin).unread, [unread("vendor/far", UnreadReason::NoGitData)]);
    // Inside the repository, a .git file leads to the submodule's git data.
    let lib_pin = gitlinks(parent.path())["vendor/lib"].clone();
    std::fs::write(&dot_git, "gitdir: ../../.git/modules/vendor/lib\n").expect("a file");
    assert_eq!(keys(&read(&lib_pin)), ["vendor/far/src/a.ts", "vendor/far/src/b.ts"]);
    // A gitdir that names no git data is none.
    std::fs::write(&dot_git, "gitdir: ../lib\n").expect("a file");
    assert_eq!(read(&lib_pin).unread[0].reason, UnreadReason::NoGitData);
}

#[test]
fn refuses_names_and_paths_that_climb_out_and_nesting_past_the_limit() {
    let (parent, _lib, pin) = with_submodule("vendor/lib");
    let mut reader = SubmoduleReader::new(parent.path());
    let evil = expand_one(
        &mut reader,
        &one("vendor/lib", &pin),
        Some("[submodule \"../x\"]\n path = vendor/lib\n"),
        "vendor/lib",
    );
    assert_eq!(evil.unread, [unread("vendor/lib", UnreadReason::BadName)]);
    let deep = reader
        .expand(None, "vendor/lib", None, &pin, SUBMODULE_DEPTH)
        .expect("an expansion");
    assert_eq!(deep.unread, [unread("vendor/lib", UnreadReason::Depth)]);
}

#[test]
fn reads_a_pin_once_however_often_it_is_asked_for() {
    let (parent, _lib, pin) = with_submodule("vendor/lib");
    let mut reader = SubmoduleReader::new(parent.path());
    let first = reader.expand(None, "vendor/lib", None, &pin, 0).expect("an expansion");
    let again = reader.expand(None, "vendor/lib", None, &pin, 0).expect("an expansion");
    assert!(Arc::ptr_eq(&first, &again));
}

#[test]
fn reads_a_nested_submodule_without_git_data_as_its_gitlink_named_by_its_path() {
    let deep = Repo::with(&[("d.ts", "d")]);
    let lib = Repo::with(&[("l.ts", "l")]);
    lib.git(&["submodule", "add", "-q", &deep.url(), "inner"]);
    lib.commit("add deep");
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.commit("add lib");
    // Not initialised recursively: the nested one has no git data.
    let names = gitmodules(parent.path());
    let found = expand_one(
        &mut SubmoduleReader::new(parent.path()),
        &gitlinks(parent.path()),
        Some(&names),
        "vendor/lib",
    );
    assert_eq!(found.unread, [unread("vendor/lib/inner", UnreadReason::NoGitData)]);
    assert!(found.files.contains_key("vendor/lib/inner/.gitlink"));
}

#[test]
fn reads_several_gitlinks_and_a_nested_gitmodules_it_cannot_read_as_naming_none() {
    let one_repo = Repo::with(&[("o.ts", "o")]);
    let two = Repo::with(&[("t.ts", "t")]);
    let lib = Repo::with(&[("l.ts", "l")]);
    lib.git(&["submodule", "add", "-q", &one_repo.url(), "b-one"]);
    lib.git(&["submodule", "add", "-q", &two.url(), "a-two"]);
    lib.commit("add two");
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.git(&["submodule", "add", "-q", &one_repo.url(), "vendor/one"]);
    parent.commit("add both");
    // The lib's .gitmodules blob is gone from its git data (as in a blob-less clone).
    let blob = lib.git(&["rev-parse", "HEAD:.gitmodules"]);
    let loose = parent
        .path()
        .join(".git/modules/vendor/lib/objects")
        .join(&blob[..2])
        .join(&blob[2..]);
    assert!(loose.exists());
    std::fs::remove_file(loose).expect("removed");
    let names = gitmodules(parent.path());
    let expanded = SubmoduleReader::new(parent.path())
        .expand_all(&gitlinks(parent.path()), Some(&names))
        .expect("an expansion");
    assert_eq!(
        expanded.iter().map(|(p, _)| p.as_str()).collect::<Vec<_>>(),
        ["vendor/lib", "vendor/one"]
    );
    assert_eq!(
        expanded[0].1.unread,
        [
            unread("vendor/lib/a-two", UnreadReason::NoGitData),
            unread("vendor/lib/b-one", UnreadReason::NoGitData)
        ]
    );
}

#[test]
fn names_a_nested_gitlink_by_its_path_when_its_submodule_has_no_gitmodules() {
    let emb = Repo::with(&[("e.ts", "e")]);
    let lib = Repo::with(&[("l.ts", "l")]);
    lib.git(&["clone", "-q", &emb.url(), "emb"]);
    lib.git(&["add", "emb"]);
    lib.commit("embed without gitmodules");
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.commit("add lib");
    let names = gitmodules(parent.path());
    let found = expand_one(
        &mut SubmoduleReader::new(parent.path()),
        &gitlinks(parent.path()),
        Some(&names),
        "vendor/lib",
    );
    assert_eq!(found.unread, [unread("vendor/lib/emb", UnreadReason::NoGitData)]);
}

/// Small strides: windows of 4 below commit 4 of a 10-commit history, of 2 up to 8, then every commit.
const SMALL: Strides = Strides {
    tail: 2,
    window: 2,
    coarse_after: 4,
    coarse_window: 4,
    grain: 4,
};

fn read(dir: &Path, from: Option<i64>, strides: Option<Strides>) -> (Vec<Snapshot>, Vec<HistoryEvent>) {
    let mut options = ReadOptions {
        from,
        ..ReadOptions::default()
    };
    if let Some(strides) = strides {
        options.strides = strides;
    }
    let (mut snaps, mut events) = (Vec::new(), Vec::new());
    for item in read_history(dir, options).expect("a history") {
        match item.expect("an item") {
            HistoryItem::Snapshot(s) => snaps.push(s),
            HistoryItem::Event(e) => events.push(e),
            HistoryItem::Files(_) => unreachable!("the files' history is not asked for"),
        }
    }
    (snaps, events)
}

fn identities(snap: &Snapshot) -> BTreeMap<String, String> {
    snap.files
        .iter()
        .map(|f| (f.path.to_string(), f.identity.to_string()))
        .collect()
}

fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs.iter().map(|(a, b)| ((*a).to_owned(), (*b).to_owned())).collect()
}

/// Moves a parent's submodule at `path` to a commit of its lib, fetching it into the submodule first.
fn pin(parent: &Repo, path: &str, sha: &str, message: &str) {
    git(&parent.path().join(path), &["fetch", "-q", "origin"]);
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{sha},{path}")]);
    parent.commit_index(message);
}

fn submodule_events(events: &[HistoryEvent]) -> Vec<&HistoryEvent> {
    events
        .iter()
        .filter(|e| e.code().starts_with("history/submodule"))
        .collect()
}

#[test]
fn folds_a_blob_less_clone_without_its_gitmodules_and_reads_every_pin_whatever_it_says_to_ignore() {
    let lib = Repo::with(&[("a.ts", "a")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    // A .gitmodules that would have git leave the submodule's changes out of every diff.
    parent.git(&["config", "-f", ".gitmodules", "submodule.vendor/lib.ignore", "all"]);
    parent.git(&["add", ".gitmodules"]);
    parent.commit("add lib");
    lib.write("b.ts", "b");
    let more = lib.commit("more");
    pin(&parent, "vendor/lib", &more, "bump");
    let (whole, _) = read(parent.path(), None, None);
    let last = whole.last().expect("a snapshot");
    assert!(last.files.iter().any(|f| &*f.path == "vendor/lib/b.ts"));
    // A blob-less clone without a checkout holds no .gitmodules blob, and never fetches one.
    parent.git(&["config", "uploadpack.allowFilter", "true"]);
    let clone = Repo::new();
    std::fs::remove_dir_all(clone.path()).expect("an empty place");
    let url = format!("file://{}", parent.url());
    git(
        &std::env::temp_dir(),
        &["clone", "-q", "--no-checkout", "--filter=blob:none", &url, &clone.url()],
    );
    let (partial, _) = read(clone.path(), None, None);
    let commits = |snaps: &[Snapshot]| snaps.iter().map(|s| s.commit.clone()).collect::<Vec<_>>();
    assert_eq!(commits(&partial), commits(&whole));
    let paths: Vec<&str> = partial
        .last()
        .expect("a snapshot")
        .files
        .iter()
        .map(|f| &*f.path)
        .collect();
    assert_eq!(paths, [".gitmodules", "main.ts", "vendor/lib/.gitlink"]);
}

#[test]
fn lays_a_submodule_s_files_at_each_pin_renames_followed_births_at_the_commit_that_laid_them() {
    let lib = Repo::with(&[("a.ts", "a"), ("b.ts", "b")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.commit("add lib");
    // The lib renames b.ts to c.ts unchanged, adds d.ts and deletes a.ts.
    lib.git(&["mv", "b.ts", "c.ts"]);
    lib.git(&["rm", "-q", "a.ts"]);
    lib.write("d.ts", "d");
    let second = lib.commit("move");
    pin(&parent, "vendor/lib", &second, "bump");
    let (snaps, events) = read(parent.path(), None, None);
    assert_eq!(snaps.iter().map(|s| s.index).collect::<Vec<_>>(), [0, 1, 2]);
    assert_eq!(
        identities(&snaps[1]),
        map(&[
            (".gitmodules", ".gitmodules@1"),
            ("main.ts", "main.ts@0"),
            ("vendor/lib/a.ts", "vendor/lib/a.ts@1"),
            ("vendor/lib/b.ts", "vendor/lib/b.ts@1")
        ])
    );
    assert_eq!(
        identities(&snaps[2]),
        map(&[
            (".gitmodules", ".gitmodules@1"),
            ("main.ts", "main.ts@0"),
            ("vendor/lib/c.ts", "vendor/lib/b.ts@1"),
            ("vendor/lib/d.ts", "vendor/lib/d.ts@2")
        ])
    );
    assert_eq!(snaps[0].submodules, None);
    assert_eq!(
        snaps[2].submodules.as_deref().map(Vec::as_slice),
        Some(&["vendor/lib".to_owned()][..])
    );
    // The same list while the submodules stay the same.
    assert!(Arc::ptr_eq(
        snaps[2].submodules.as_ref().expect("a list"),
        snaps[1].submodules.as_ref().expect("a list")
    ));
    assert_eq!(snaps[2].folder_first_seen("vendor/lib"), 1);
    assert_eq!(
        submodule_events(&events),
        [
            &HistoryEvent::Submodule {
                path: "vendor/lib".into(),
                index: 1,
                files: 2
            },
            &HistoryEvent::Submodule {
                path: "vendor/lib".into(),
                index: 2,
                files: 2
            }
        ]
    );
    assert_eq!(
        events
            .iter()
            .find(|e| e.code() == "history/submodule")
            .expect("an event")
            .line(),
        "history/submodule path=vendor/lib index=1 files=2"
    );
}

#[test]
fn lays_an_unread_submodule_as_its_gitlink_file_its_identity_kept_as_the_pin_moves() {
    let parent = Repo::with(&[("a.ts", "a")]);
    let one = parent.git(&["rev-parse", "HEAD"]);
    parent.git(&[
        "update-index",
        "--add",
        "--cacheinfo",
        &format!("160000,{one},vendor/lib"),
    ]);
    parent.commit_index("pin");
    parent.write("b.ts", "b");
    parent.git(&["add", "b.ts"]);
    let two = parent.commit_index("two");
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{two},vendor/lib")]);
    parent.commit_index("repin");
    let (snaps, events) = read(parent.path(), None, None);
    assert_eq!(identities(&snaps[3])["vendor/lib/.gitlink"], "vendor/lib/.gitlink@1");
    assert_eq!(
        snaps[3].submodules.as_deref().map(Vec::as_slice),
        Some(&["vendor/lib".to_owned()][..])
    );
    let unavailable = HistoryEvent::SubmoduleUnavailable {
        path: "vendor/lib".into(),
        index: 3,
        reason: UnreadReason::NoGitData,
    };
    assert!(events.contains(&unavailable));
    assert_eq!(
        unavailable.line(),
        "history/submodule-unavailable path=vendor/lib index=3 reason=no-git-data"
    );
    assert!(!events.iter().any(|e| e.code() == "history/submodule"));
}

#[test]
fn clears_a_removed_submodule_s_files_and_lays_a_file_that_replaces_a_gitlink() {
    let lib = Repo::with(&[("x.ts", "x")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.commit("add");
    parent.git(&["rm", "-q", "--cached", "vendor/lib", ".gitmodules"]);
    parent.commit_index("drop");
    // A file where a gitlink stood, and a gitlink where a file stood.
    let blob = parent.git(&["hash-object", "-w", "main.ts"]);
    parent.git(&[
        "update-index",
        "--add",
        "--cacheinfo",
        &format!("100644,{blob},vendor/lib"),
    ]);
    let head = lib.git(&["rev-parse", "HEAD"]);
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{head},main.ts")]);
    parent.commit_index("swap");
    let (snaps, _) = read(parent.path(), None, None);
    assert_eq!(identities(&snaps[2]).into_keys().collect::<Vec<_>>(), ["main.ts"]);
    assert_eq!(snaps[2].submodules, None);
    assert_eq!(
        identities(&snaps[3]).into_keys().collect::<Vec<_>>(),
        ["main.ts/.gitlink", "vendor/lib"]
    );
    // With no .gitmodules, the gitlink at main.ts is named by its path; no git data lies there.
    assert_eq!(
        snaps[3].submodules.as_deref().map(Vec::as_slice),
        Some(&["main.ts".to_owned()][..])
    );
}

#[test]
fn reads_a_pin_moved_several_times_inside_a_window_once_at_the_window_s_end_and_resumes_the_same() {
    let lib = Repo::with(&[("v0.ts", "0")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.commit("add");
    for i in 1..=8 {
        lib.write(&format!("v{i}.ts"), &i.to_string());
        let sha = lib.commit(&format!("v{i}"));
        pin(&parent, "vendor/lib", &sha, &format!("bump {i}"));
    }
    // Ten commits: laid at 3, 5, 7, 8 and 9.
    let (whole, events) = read(parent.path(), None, Some(SMALL));
    assert_eq!(whole.iter().map(|s| s.index).collect::<Vec<_>>(), [3, 5, 7, 8, 9]);
    let read_at: Vec<i64> = events
        .iter()
        .filter_map(|e| match e {
            HistoryEvent::Submodule { index, .. } => Some(*index),
            _ => None,
        })
        .collect();
    assert_eq!(read_at, [3, 5, 7, 8, 9]);
    // v1 and v2 were born inside the first window, laid at its end.
    assert_eq!(identities(&whole[0])["vendor/lib/v1.ts"], "vendor/lib/v1.ts@3");
    assert_eq!(identities(&whole[0])["vendor/lib/v2.ts"], "vendor/lib/v2.ts@3");
    let (resumed, _) = read(parent.path(), Some(7), Some(SMALL));
    assert_eq!(resumed.iter().map(|s| s.index).collect::<Vec<_>>(), [7, 8, 9]);
    assert_eq!(
        resumed.last().expect("a snapshot").files,
        whole.last().expect("a snapshot").files
    );
}

#[test]
fn names_submodules_by_their_paths_when_gitmodules_cannot_be_read_as_in_a_blob_less_clone() {
    let lib = Repo::with(&[("x.ts", "x")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    parent.commit("add");
    let blob = parent.git(&["rev-parse", "HEAD:.gitmodules"]);
    std::fs::remove_file(parent.path().join(".git/objects").join(&blob[..2]).join(&blob[2..])).expect("removed");
    let (snaps, _) = read(parent.path(), None, None);
    assert!(identities(&snaps[1]).contains_key("vendor/lib/x.ts"));
}

#[test]
fn moves_several_pins_in_one_commit_in_path_order() {
    let one = Repo::with(&[("o.ts", "o")]);
    let two = Repo::with(&[("t.ts", "t")]);
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", &one.url(), "vendor/one"]);
    parent.git(&["submodule", "add", "-q", &two.url(), "vendor/two"]);
    parent.commit("add both");
    let (snaps, events) = read(parent.path(), None, None);
    assert_eq!(
        identities(&snaps[1]).into_keys().collect::<Vec<_>>(),
        [".gitmodules", "main.ts", "vendor/one/o.ts", "vendor/two/t.ts"]
    );
    let paths: Vec<&str> = events
        .iter()
        .filter_map(|e| match e {
            HistoryEvent::Submodule { path, .. } => Some(path.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(paths, ["vendor/one", "vendor/two"]);
}

#[test]
fn lays_an_initialised_submodule_s_files_at_its_pin_in_a_single_state_and_says_so() {
    let lib = Repo::with(&[("src/l.ts", "l")]);
    let dir = Repo::with(&[("a.ts", "a")]);
    dir.git(&["submodule", "add", "-q", &lib.url(), "vendor/lib"]);
    let sha = dir.commit("add lib");
    let mut events = Vec::new();
    let snapshot = read_tree(dir.path(), &sha, None, &mut |e| events.push(e)).expect("a tree");
    assert_eq!(
        snapshot.files.iter().map(|f| &*f.path).collect::<Vec<_>>(),
        [".gitmodules", "a.ts", "vendor/lib/src/l.ts"]
    );
    assert_eq!(
        snapshot.submodules.as_deref().map(Vec::as_slice),
        Some(&["vendor/lib".to_owned()][..])
    );
    assert_eq!(
        events,
        [HistoryEvent::Submodule {
            path: "vendor/lib".into(),
            index: 0,
            files: 1
        }]
    );
}

fn submodule_lines(events: &[HistoryEvent]) -> Vec<String> {
    submodule_events(events).iter().map(|e| e.line()).collect()
}

#[test]
fn names_each_reading_by_the_gitmodules_in_force_at_its_own_commit() {
    // vendor/lib (git data in .git/modules/one, no working tree) at A, then B, then back to A while .gitmodules
    // renames it two, a name with no git data.
    let lib = Repo::with(&[("a.ts", "a")]);
    let a = lib.git(&["rev-parse", "HEAD"]);
    lib.write("b.ts", "b");
    let b = lib.commit("b");
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", "--name", "one", &lib.url(), "vendor/lib"]);
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{a},vendor/lib")]);
    parent.commit_index("add at a");
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{b},vendor/lib")]);
    parent.commit_index("to b");
    parent.write(
        ".gitmodules",
        &format!("[submodule \"two\"]\n\tpath = vendor/lib\n\turl = {}\n", lib.url()),
    );
    parent.git(&["add", ".gitmodules"]);
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{a},vendor/lib")]);
    parent.commit_index("rename, back to a");
    std::fs::remove_dir_all(parent.path().join("vendor/lib")).expect("removed");
    let (_, events) = read(parent.path(), None, None);
    assert_eq!(
        submodule_lines(&events),
        [
            "history/submodule path=vendor/lib index=1 files=1",
            "history/submodule path=vendor/lib index=2 files=2",
            "history/submodule-unavailable path=vendor/lib index=3 reason=no-git-data"
        ]
    );
}

#[test]
fn names_nothing_by_a_gitmodules_that_is_a_gitlink() {
    let lib = Repo::with(&[("a.ts", "a")]);
    let a = lib.git(&["rev-parse", "HEAD"]);
    lib.write("b.ts", "b");
    let b = lib.commit("b");
    let parent = Repo::with(&[("main.ts", "m")]);
    parent.git(&["submodule", "add", "-q", "--name", "custom", &lib.url(), "vendor/lib"]);
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{a},vendor/lib")]);
    parent.commit_index("add at a");
    parent.git(&["rm", "-q", "--cached", ".gitmodules"]);
    parent.git(&[
        "update-index",
        "--add",
        "--cacheinfo",
        &format!("160000,{a},.gitmodules"),
    ]);
    parent.git(&["update-index", "--cacheinfo", &format!("160000,{b},vendor/lib")]);
    parent.commit_index("gitmodules as a gitlink");
    std::fs::remove_dir_all(parent.path().join("vendor/lib")).expect("removed");
    let (snaps, events) = read(parent.path(), None, None);
    // Named custom by the file at 1; named by its path, with no git data there, once .gitmodules is a gitlink.
    assert_eq!(
        submodule_lines(&events),
        [
            "history/submodule path=vendor/lib index=1 files=1",
            "history/submodule-unavailable path=.gitmodules index=2 reason=no-git-data",
            "history/submodule-unavailable path=vendor/lib index=2 reason=no-git-data"
        ]
    );
    assert_eq!(
        identities(&snaps[2]).into_keys().collect::<Vec<_>>(),
        [".gitmodules/.gitlink", "main.ts", "vendor/lib/.gitlink"]
    );
}

#[test]
fn holds_no_reading_past_the_move_that_took_it_across_50_moves_of_one_pin() {
    let repo = Repo::with(&[("a.ts", "a")]);
    let mut pins = Pins::new(SubmoduleReader::new(repo.path()));
    for i in 0..50 {
        let pin = (i % 7).to_string().repeat(40);
        pins.gitlinks.insert("vendor/lib".into(), pin);
        let moved = pins.move_pins(i, &mut || Ok(None), &mut |_| {}).expect("a move");
        assert!(moved.is_some());
        assert_eq!(pins.held(), (1, 0));
    }
}
