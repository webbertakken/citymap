//! The history reader on real, temporary repositories.
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

use citymap_ground_plan::ErrorCode;
use citymap_ground_plan::snapshot::Snapshot;
use citymap_history::read::parse_raw_log;
use citymap_history::{HistoryEvent, HistoryItem, ReadOptions, read_history, read_tree};

static NEXT: AtomicUsize = AtomicUsize::new(0);

/// A temporary repository, removed when dropped.
struct Repo(PathBuf);

impl Drop for Repo {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

impl Repo {
    fn new() -> Self {
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("citymap-history-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("a temporary folder");
        let repo = Self(dir);
        repo.git(&["init", "-q", "-b", "main"]);
        repo
    }

    fn git(&self, args: &[&str]) -> String {
        let out = Command::new("git")
            .arg("-C")
            .arg(&self.0)
            .args(args)
            .env_remove("GIT_DIR")
            .output()
            .expect("git runs");
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().to_owned()
    }

    fn write(&self, path: &str, text: &str) {
        let full = self.0.join(path);
        std::fs::create_dir_all(full.parent().expect("a parent")).expect("folders");
        std::fs::write(full, text).expect("a file");
    }

    fn commit(&self, message: &str) {
        self.git(&["add", "-A"]);
        self.git(&[
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            message,
        ]);
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

fn collect(dir: &Path, from: i64) -> (Vec<Snapshot>, Vec<HistoryEvent>) {
    let mut snapshots = Vec::new();
    let mut events = Vec::new();
    for item in read_history(
        dir,
        ReadOptions {
            from,
            ..ReadOptions::default()
        },
    )
    .expect("a history")
    {
        match item.expect("an item") {
            HistoryItem::Snapshot(s) => snapshots.push(s),
            HistoryItem::Event(e) => events.push(e),
        }
    }
    (snapshots, events)
}

fn files(s: &Snapshot) -> Vec<(String, String, i64)> {
    s.files
        .iter()
        .map(|f| (f.path.to_string(), f.identity.to_string(), f.first_seen))
        .collect()
}

fn identities(s: &Snapshot) -> Vec<String> {
    s.files.iter().map(|f| f.identity.to_string()).collect()
}

#[test]
fn yields_one_snapshot_per_first_parent_commit_with_births_and_folders() {
    let repo = Repo::new();
    repo.write("a b.txt", "a");
    repo.write("src/x.ts", "x");
    repo.commit("one");
    repo.write("src/deep/y.ts", "y");
    repo.commit("two");
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(snaps.iter().map(|s| s.index).collect::<Vec<_>>(), [0, 1]);
    assert_eq!(
        files(&snaps[1]),
        [
            ("a b.txt".into(), "a b.txt@0".into(), 0),
            ("src/deep/y.ts".into(), "src/deep/y.ts@1".into(), 1),
            ("src/x.ts".into(), "src/x.ts@0".into(), 0)
        ]
    );
    let mut folders: Vec<(String, i64)> = snaps[1]
        .folder_first_seen
        .iter()
        .map(|(k, v)| (k.clone(), *v))
        .collect();
    folders.sort();
    assert_eq!(folders, [(String::new(), 0), ("src".into(), 0), ("src/deep".into(), 1)]);
    assert!(snaps[0].repository.starts_with("citymap-history-"));
    assert_eq!(snaps[0].commit.len(), 40);
}

#[test]
fn carries_identity_through_an_exact_rename_and_not_through_an_edit() {
    let repo = Repo::new();
    repo.write("old.ts", "same");
    repo.write("edit.ts", "v1");
    repo.commit("one");
    repo.git(&["mv", "old.ts", "new.ts"]);
    std::fs::remove_file(repo.path().join("edit.ts")).expect("removed");
    repo.write("edited.ts", "v2");
    repo.commit("two");
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(
        files(&snaps[1]),
        [
            ("edited.ts".into(), "edited.ts@1".into(), 1),
            ("new.ts".into(), "old.ts@0".into(), 0)
        ]
    );
}

#[test]
fn pairs_identical_files_moved_together_in_path_order() {
    let repo = Repo::new();
    repo.write("a.ts", "same");
    repo.write("b.ts", "same");
    repo.commit("one");
    repo.git(&["mv", "a.ts", "y.ts"]);
    repo.git(&["mv", "b.ts", "z.ts"]);
    repo.commit("two");
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(identities(&snaps[1]), ["a.ts@0", "b.ts@0"]);
}

#[test]
fn follows_only_the_first_parent_of_a_merge_as_one_step() {
    let repo = Repo::new();
    repo.write("a.ts", "a");
    repo.commit("one");
    repo.git(&["checkout", "-q", "-b", "side"]);
    repo.write("s1.ts", "1");
    repo.commit("s1");
    repo.write("s2.ts", "2");
    repo.commit("s2");
    repo.git(&["checkout", "-q", "main"]);
    repo.git(&[
        "-c",
        "user.email=t@t",
        "-c",
        "user.name=t",
        "merge",
        "-q",
        "--no-ff",
        "side",
        "-m",
        "merge",
    ]);
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(snaps.len(), 2);
    assert_eq!(identities(&snaps[1]), ["a.ts@0", "s1.ts@1", "s2.ts@1"]);
}

#[test]
fn skips_submodules_reports_them_and_lays_a_file_that_replaces_one() {
    let repo = Repo::new();
    repo.write("a.ts", "a");
    repo.commit("one");
    let head = repo.git(&["rev-parse", "HEAD"]);
    repo.git(&["update-index", "--add", "--cacheinfo", &format!("160000,{head},sub")]);
    repo.git(&["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "sub"]);
    repo.git(&["rm", "-q", "--cached", "sub"]);
    repo.write("sub", "now a file");
    repo.commit("replace");
    let (snaps, events) = collect(repo.path(), 0);
    assert_eq!(identities(&snaps[1]), ["a.ts@0"]);
    assert_eq!(
        events,
        [HistoryEvent::SkipSubmodule {
            path: "sub".into(),
            index: 1
        }]
    );
    assert_eq!(events[0].line(), "history/skip-submodule path=sub index=1");
    assert_eq!(identities(&snaps[2]), ["a.ts@0", "sub@2"]);
}

#[test]
fn keeps_an_empty_commit_as_a_step_and_shares_the_file_list_while_nothing_arrives() {
    let repo = Repo::new();
    repo.write("a.ts", "a");
    repo.commit("one");
    repo.commit("empty");
    repo.write("a.ts", "edited");
    repo.commit("edit");
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(snaps.iter().map(|s| s.files.len()).collect::<Vec<_>>(), [1, 1, 1]);
    assert_eq!(identities(&snaps[2]), ["a.ts@0"]);
    assert!(std::sync::Arc::ptr_eq(&snaps[0].files, &snaps[2].files));
}

#[test]
fn starts_yielding_at_a_given_index_with_the_tree_as_it_stood() {
    let repo = Repo::new();
    repo.write("a.ts", "a");
    repo.commit("one");
    repo.write("b.ts", "b");
    repo.commit("two");
    repo.write("c.ts", "c");
    repo.commit("three");
    let (snaps, _) = collect(repo.path(), 1);
    assert_eq!(snaps.iter().map(|s| s.index).collect::<Vec<_>>(), [1, 2]);
    assert_eq!(identities(&snaps[0]), ["a.ts@0", "b.ts@1"]);
}

#[test]
fn rejects_a_folder_that_is_not_a_repository_and_a_failing_git() {
    let missing = std::env::temp_dir().join("citymap-no-such-dir");
    assert_eq!(
        read_history(&missing, ReadOptions::default()).err().map(|e| e.code),
        Some(ErrorCode::HistoryNotARepo)
    );
    let repo = Repo::new();
    let failure = read_history(repo.path(), ReadOptions::default())
        .expect("a reader")
        .find_map(Result::err);
    assert_eq!(failure.map(|e| e.code), Some(ErrorCode::HistoryGitFailed));
}

#[test]
fn reads_workspaces_from_the_root_manifests() {
    let repo = Repo::new();
    repo.write("package.json", r#"{"workspaces":["packages/*"]}"#);
    repo.write("packages/a/index.ts", "a");
    repo.write("packages/b/index.ts", "b");
    repo.write("other/c.ts", "c");
    repo.commit("one");
    repo.write("packages/c/index.ts", "c");
    repo.commit("two");
    let (snaps, _) = collect(repo.path(), 0);
    let members = |s: &Snapshot| s.workspaces.as_ref().map(|w| w.to_vec());
    assert_eq!(members(&snaps[0]), Some(vec!["packages/a".into(), "packages/b".into()]));
    assert_eq!(
        members(&snaps[1]),
        Some(vec!["packages/a".into(), "packages/b".into(), "packages/c".into()])
    );
    let tree = read_tree(repo.path(), &repo.git(&["rev-parse", "HEAD"]), None, &mut |_| {}).expect("a tree");
    assert_eq!(tree.workspaces.as_ref().map(|w| w.to_vec()), members(&snaps[1]));
    assert_eq!(
        tree.files.iter().map(|f| f.identity.to_string()).collect::<Vec<_>>()[0],
        "other/c.ts@0"
    );
}

#[test]
fn reads_the_folder_it_is_given_whatever_repository_the_environment_names() {
    let hook = Repo::new();
    hook.write("hook.ts", "h");
    hook.commit("hook");
    let repo = Repo::new();
    repo.write("mine.ts", "m");
    repo.commit("mine");
    let command = citymap_history::env::git_command(repo.path(), &["log"]);
    assert!(command.get_envs().any(|(k, v)| k == "GIT_DIR" && v.is_none()));
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(identities(&snaps[0]), ["mine.ts@0"]);
}

#[test]
fn rejects_a_path_longer_than_the_engine_reads_by_name() {
    let repo = Repo::new();
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo.path())
        .args(["hash-object", "-w", "--stdin"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("git");
    std::io::Write::write_all(child.stdin.as_mut().expect("stdin"), b"x").expect("written");
    let blob = String::from_utf8(child.wait_with_output().expect("output").stdout)
        .expect("utf8")
        .trim()
        .to_owned();
    let long = format!("{}f.ts", format!("{}/", "d".repeat(200)).repeat(21));
    repo.git(&["update-index", "--add", "--cacheinfo", &format!("100644,{blob},{long}")]);
    repo.git(&[
        "-c",
        "user.email=t@t",
        "-c",
        "user.name=t",
        "commit",
        "-q",
        "-m",
        "long",
    ]);
    let failure = read_history(repo.path(), ReadOptions::default())
        .expect("a reader")
        .find_map(Result::err);
    assert_eq!(failure.map(|e| e.code), Some(ErrorCode::SnapshotBadPath));
}

#[test]
fn parses_raw_log_tokens() {
    assert_eq!(parse_raw_log([]).expect("nothing"), vec![]);
    let a = format!("\u{1}{}", "a".repeat(40));
    let b = format!("\n\u{1}{}", "b".repeat(40));
    let commits = parse_raw_log([a.as_str(), "", "\n:100644 100644 x y M", "f.ts", b.as_str()]).expect("commits");
    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0].sha, "a".repeat(40));
    assert_eq!(
        (commits[0].entries[0].mode.as_str(), commits[0].entries[0].blob.as_str()),
        ("100644", "y")
    );
    assert_eq!(
        (
            commits[0].entries[0].status.as_str(),
            commits[0].entries[0].path.as_str()
        ),
        ("M", "f.ts")
    );
    assert_eq!(commits[1].entries, vec![]);
    assert_eq!(
        parse_raw_log([":100644 100644 a b M", "x"]).unwrap_err().code,
        ErrorCode::HistoryParse
    );
}
