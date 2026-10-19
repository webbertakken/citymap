//! A partial clone's root manifests on real, temporary repositories: exactly the laid commits' blobs fetched, nothing
//! else, and a city that says so when they cannot be.
mod common;

use std::path::Path;
use std::time::Duration;

use citymap_ground_plan::snapshot::Snapshot;
use citymap_history::fetch_manifests::{fetch_manifests, laid_manifests, promisor_remotes, root_trees};
use citymap_history::{HistoryEvent, HistoryItem, ReadOptions, read_history, read_tree};
use common::{Repo, git};

/// Four commits, each changing the workspace manifest but the last, which adds a Cargo.toml; the blobs in order.
fn workspace_repo() -> (Repo, Vec<String>) {
    let source = Repo::new();
    source.write("package.json", r#"{"workspaces":["packages/*"]}"#);
    source.write("packages/a/index.ts", "a");
    source.commit("one");
    source.write("package.json", r#"{"workspaces":["packages/*","tools/*"]}"#);
    source.write("packages/b/index.ts", "b");
    source.commit("two");
    source.write("package.json", r#"{"workspaces":["packages/a"]}"#);
    source.commit("three");
    source.write("Cargo.toml", "[workspace]\nmembers = []\n");
    source.write("packages/c/index.ts", "c");
    source.commit("four");
    let mut blobs: Vec<String> = ["HEAD~3", "HEAD~2", "HEAD"]
        .iter()
        .map(|at| source.git(&["rev-parse", &format!("{at}:package.json")]))
        .collect();
    blobs.push(source.git(&["rev-parse", "HEAD:Cargo.toml"]));
    (source, blobs)
}

/// A blob-less clone, without a checkout, of `source`, which serves its blobs by id.
fn partial_clone_of(source: &Repo) -> Repo {
    source.git(&["config", "uploadpack.allowFilter", "true"]);
    source.git(&["config", "uploadpack.allowAnySHA1InWant", "true"]);
    let clone = Repo::new();
    std::fs::remove_dir_all(clone.path()).expect("an empty place");
    let url = format!("file://{}", source.url());
    git(
        &std::env::temp_dir(),
        &["clone", "-q", "--no-checkout", "--filter=blob:none", &url, &clone.url()],
    );
    clone
}

/// Whether a repository holds an object, asking nobody.
fn holds(dir: &Path, id: &str) -> bool {
    std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["cat-file", "-e", id])
        .env("GIT_NO_LAZY_FETCH", "1")
        .output()
        .expect("git runs")
        .status
        .success()
}

fn sorted(mut blobs: Vec<String>) -> Vec<String> {
    blobs.sort();
    blobs
}

fn read(dir: &Path, from: Option<i64>) -> (Vec<Snapshot>, Vec<HistoryEvent>) {
    let options = ReadOptions {
        from,
        ..ReadOptions::default()
    };
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

fn manifests_lines(events: &[HistoryEvent]) -> Vec<String> {
    events
        .iter()
        .filter(|e| e.code() == "history/manifests")
        .map(HistoryEvent::line)
        .collect()
}

fn no_trees(trees: Vec<String>) -> impl FnOnce() -> citymap_ground_plan::Result<Vec<String>> {
    move || Ok(trees)
}

#[test]
fn names_exactly_the_root_manifest_blobs_of_the_commits_laid_each_once() {
    let (source, blobs) = workspace_repo();
    let head = source.git(&["rev-parse", "HEAD"]);
    let trees = root_trees(source.path(), &head).expect("trees");
    assert_eq!(trees.len(), 4);
    let laid = laid_manifests(source.path(), &[trees[0].clone(), trees[3].clone()]).expect("blobs");
    assert_eq!(laid, sorted(vec![blobs[0].clone(), blobs[2].clone(), blobs[3].clone()]));
    let again = laid_manifests(source.path(), &[trees[3].clone(), "HEAD^{tree}".to_owned()]).expect("blobs");
    assert_eq!(again, sorted(vec![blobs[2].clone(), blobs[3].clone()]));
}

#[test]
fn names_the_partial_clone_s_remote_first_and_none_for_a_full_clone() {
    let (source, _) = workspace_repo();
    assert_eq!(promisor_remotes(source.path()), Vec::<String>::new());
    let clone = partial_clone_of(&source);
    clone.git(&["remote", "add", "spare", &source.url()]);
    clone.git(&["config", "remote.spare.promisor", "true"]);
    assert_eq!(promisor_remotes(clone.path()), ["origin", "spare"]);
    // An older git names the partial clone's remote in extensions.partialclone: git asks it first.
    clone.git(&["config", "extensions.partialclone", "spare"]);
    assert_eq!(promisor_remotes(clone.path()), ["spare", "origin"]);
}

#[test]
fn fetches_exactly_the_laid_manifest_blobs_a_partial_clone_does_not_hold_and_nothing_else() {
    let (source, blobs) = workspace_repo();
    let head_tree = || no_trees(vec!["HEAD^{tree}".to_owned()]);
    assert_eq!(
        fetch_manifests(source.path(), head_tree(), Duration::from_secs(30)).expect("a fetch"),
        None
    );
    let clone = partial_clone_of(&source);
    assert!(!blobs.iter().any(|b| holds(clone.path(), b)));
    let head = clone.git(&["rev-parse", "HEAD"]);
    let trees = root_trees(clone.path(), &head).expect("trees");
    let laid = no_trees(vec![trees[0].clone(), trees[3].clone()]);
    let fetched = fetch_manifests(clone.path(), laid, Duration::from_secs(30)).expect("a fetch");
    assert_eq!(
        fetched.map(|e| e.line()).as_deref(),
        Some("history/manifests status=fetched blobs=3 fetched=3")
    );
    assert!([0, 2, 3].iter().all(|&i| holds(clone.path(), &blobs[i])));
    // The manifest of a commit not laid, and every other file, stay where they are.
    assert!(!holds(clone.path(), &blobs[1]));
    let other = source.git(&["rev-parse", "HEAD:packages/a/index.ts"]);
    assert!(!holds(clone.path(), &other));
    let held = fetch_manifests(clone.path(), no_trees(vec![trees[3].clone()]), Duration::from_secs(30));
    assert_eq!(
        held.expect("a fetch").map(|e| e.line()).as_deref(),
        Some("history/manifests status=held blobs=2 fetched=0")
    );
}

#[test]
fn says_why_when_the_manifests_cannot_be_fetched_and_gives_up_after_its_timeout() {
    let (source, _) = workspace_repo();
    let offline = partial_clone_of(&source);
    let gone = offline.path().join("gone");
    offline.git(&["remote", "set-url", "origin", &gone.display().to_string()]);
    let tree = || no_trees(vec!["HEAD^{tree}".to_owned()]);
    let line = fetch_manifests(offline.path(), tree(), Duration::from_secs(30))
        .expect("a fetch")
        .expect("an event")
        .line();
    assert!(
        line.starts_with("history/manifests status=unfetchable blobs=2 fetched=0 reason=exit-128 error=fatal: '")
            && line.ends_with("does not appear to be a git repository"),
        "{line}"
    );
    let slow = partial_clone_of(&source);
    let ended = fetch_manifests(slow.path(), tree(), Duration::ZERO)
        .expect("a fetch")
        .expect("an event");
    assert_eq!(
        ended.line(),
        "history/manifests status=unfetchable blobs=2 fetched=0 reason=timeout"
    );
}

#[test]
fn lays_the_members_a_full_clone_lays_from_the_manifests_it_fetched() {
    let (source, _) = workspace_repo();
    let clone = partial_clone_of(&source);
    let (whole, whole_events) = read(source.path(), None);
    let (partial, events) = read(clone.path(), None);
    let members = |snaps: &[Snapshot]| snaps.iter().map(|s| s.workspaces.clone()).collect::<Vec<_>>();
    assert_eq!(members(&partial), members(&whole));
    assert_eq!(
        partial.last().and_then(|s| s.workspaces.as_deref().cloned()),
        Some(vec!["packages/a".to_owned()])
    );
    assert_eq!(manifests_lines(&whole_events), Vec::<String>::new());
    assert_eq!(
        manifests_lines(&events),
        ["history/manifests status=fetched blobs=4 fetched=4"]
    );
    assert!(!events.iter().any(|e| e.code() == "history/manifest-unavailable"));
    assert!(partial.iter().all(|s| s.manifests.is_none()));
    let again = partial_clone_of(&source);
    let (resumed, _) = read(again.path(), Some(2));
    assert_eq!(
        resumed.last().and_then(|s| s.workspaces.as_deref().cloned()),
        Some(vec!["packages/a".to_owned()])
    );
    let single = partial_clone_of(&source);
    let snapshot = read_tree(single.path(), "HEAD", None, &mut |_| {}).expect("a tree");
    assert_eq!(
        snapshot.workspaces.as_deref().cloned(),
        Some(vec!["packages/a".to_owned()])
    );
}

#[test]
fn marks_every_snapshot_when_the_manifests_cannot_be_fetched() {
    let (source, _) = workspace_repo();
    let offline = partial_clone_of(&source);
    let gone = offline.path().join("gone");
    offline.git(&["remote", "set-url", "origin", &gone.display().to_string()]);
    let (snaps, events) = read(offline.path(), None);
    assert!(snaps.iter().all(|s| s.manifests == Some("unfetchable")));
    assert_eq!(snaps.last().and_then(|s| s.workspaces.clone()), None);
    assert!(manifests_lines(&events)[0].starts_with("history/manifests status=unfetchable blobs=4 fetched=0"));
    let single = read_tree(offline.path(), "HEAD", None, &mut |_| {}).expect("a tree");
    assert_eq!(single.manifests, Some("unfetchable"));
}
