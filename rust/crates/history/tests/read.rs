//! The history reader on real, temporary repositories.
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

use citymap_ground_plan::ErrorCode;
use citymap_ground_plan::snapshot::Snapshot;
use citymap_history::read::parse_raw_log;
use citymap_history::submodules::UnreadReason;
use citymap_history::{HistoryEvent, HistoryItem, ReadOptions, Strides, read_history, read_tree};

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
            from: Some(from),
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
fn lays_an_unread_submodule_as_its_gitlink_file_and_a_file_that_replaces_it() {
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
    assert_eq!(identities(&snaps[1]), ["a.ts@0", "sub/.gitlink@1"]);
    assert_eq!(
        events,
        [
            HistoryEvent::Schedule {
                commits: 3,
                coarse: 0,
                tail: 0,
                from: 0,
                laid: 3
            },
            HistoryEvent::SubmoduleUnavailable {
                path: "sub".into(),
                index: 1,
                reason: UnreadReason::NoGitData
            }
        ]
    );
    assert_eq!(
        events[1].line(),
        "history/submodule-unavailable path=sub index=1 reason=no-git-data"
    );
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
fn reports_git_log_failing_on_a_tree_it_cannot_read() {
    let repo = Repo::new();
    repo.write("a.ts", "a");
    repo.commit("one");
    // The count reads commits only; the log needs the tree, and finds it gone.
    let tree = repo.git(&["rev-parse", "HEAD^{tree}"]);
    std::fs::remove_file(repo.path().join(".git/objects").join(&tree[..2]).join(&tree[2..])).expect("a loose tree");
    let failure = read_history(repo.path(), ReadOptions::default())
        .expect("a reader")
        .find_map(Result::err)
        .expect("a failure");
    assert!(
        failure
            .to_string()
            .starts_with("history/git-failed: git log exited with 128"),
        "{failure}"
    );
}

/// A history built in one `git fast-import`: each commit maps paths to contents, none deleting the path.
fn history(commits: &[&[(&str, Option<&str>)]]) -> Repo {
    use std::fmt::Write as _;
    use std::io::Write as _;
    let repo = Repo::new();
    let mut stream = String::new();
    for (i, changes) in commits.iter().enumerate() {
        writeln!(stream, "commit refs/heads/main\ncommitter t <t@t> {i} +0000\ndata 0").expect("a string");
        for (path, text) in *changes {
            match text {
                None => writeln!(stream, "D {path}"),
                Some(text) => writeln!(stream, "M 100644 inline {path}\ndata {}\n{text}", text.len()),
            }
            .expect("a string");
        }
        stream.push('\n');
    }
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo.path())
        .args(["fast-import", "--quiet"])
        .env_remove("GIT_DIR")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .expect("git runs");
    child
        .stdin
        .take()
        .expect("piped")
        .write_all(stream.as_bytes())
        .expect("the stream");
    assert!(child.wait().expect("git ends").success());
    repo
}

/// Small strides: windows of 4 below commit 4 of a 10-commit history, of 2 up to 8, then every commit.
const SMALL: Strides = Strides {
    tail: 2,
    window: 2,
    coarse_after: 4,
    coarse_window: 4,
    grain: 4,
};

/// Renames chained in one window, a file born and deleted in one, manifests changed inside windows.
fn windowed() -> Repo {
    history(&[
        &[("a.ts", Some("a")), ("keep.ts", Some("k"))],
        &[
            ("a.ts", None),
            ("b.ts", Some("a")),
            ("x.ts", Some("x")),
            ("src/y.ts", Some("y")),
        ],
        &[("b.ts", None), ("c.ts", Some("a")), ("x.ts", None)],
        &[("z.ts", Some("z"))],
        &[
            ("package.json", Some(r#"{"workspaces":["pkgs/*"]}"#)),
            ("pkgs/one/package.json", Some("{}")),
        ],
        &[("pkgs/one/index.ts", Some("1"))],
        &[("package.json", Some(r#"{"workspaces":["nope/*"]}"#))],
        &[
            ("package.json", Some(r#"{"workspaces":["pkgs/*","more/*"]}"#)),
            ("more/two/index.ts", Some("2")),
        ],
        &[("keep.ts", Some("edited"))],
        &[("z.ts", None)],
    ])
}

/// The snapshots and events of one read on the given strides.
fn read(dir: &Path, from: Option<i64>, strides: Strides) -> (Vec<Snapshot>, Vec<HistoryEvent>) {
    let mut snapshots = Vec::new();
    let mut events = Vec::new();
    let options = ReadOptions {
        from,
        strides,
        ..ReadOptions::default()
    };
    for item in read_history(dir, options).expect("a history") {
        match item.expect("an item") {
            HistoryItem::Snapshot(s) => snapshots.push(s),
            HistoryItem::Event(e) => events.push(e),
        }
    }
    (snapshots, events)
}

fn indices(snaps: &[Snapshot]) -> Vec<i64> {
    snaps.iter().map(|s| s.index).collect()
}

#[test]
fn lays_only_the_ends_of_windows_and_the_tail_each_at_its_last_commit() {
    let repo = windowed();
    let (snaps, _) = read(repo.path(), None, SMALL);
    let shas: Vec<String> = repo
        .git(&["rev-list", "--first-parent", "--reverse", "HEAD"])
        .lines()
        .map(str::to_owned)
        .collect();
    assert_eq!(indices(&snaps), [3, 5, 7, 8, 9]);
    let commits: Vec<&str> = snaps.iter().map(|s| s.commit.as_str()).collect();
    assert_eq!(commits, [3, 5, 7, 8, 9].map(|i| shas[i].as_str()));
}

#[test]
fn keeps_identity_through_renames_chained_inside_a_window_and_drops_a_file_born_and_deleted_in_it() {
    let (snaps, _) = read(windowed().path(), None, SMALL);
    assert_eq!(
        files(&snaps[0]),
        [
            ("c.ts".into(), "a.ts@0".into(), 0),
            ("keep.ts".into(), "keep.ts@0".into(), 0),
            ("src/y.ts".into(), "src/y.ts@1".into(), 1),
            ("z.ts".into(), "z.ts@3".into(), 3)
        ]
    );
    let mut folders: Vec<(String, i64)> = snaps[0]
        .folder_first_seen
        .iter()
        .map(|(k, v)| (k.clone(), *v))
        .collect();
    folders.sort();
    assert_eq!(folders, [(String::new(), 0), ("src".into(), 1)]);
}

#[test]
fn resolves_manifests_changed_inside_a_window_at_its_end() {
    let (snaps, _) = read(windowed().path(), None, SMALL);
    assert_eq!(
        snaps.iter().map(members).collect::<Vec<_>>(),
        [
            None,
            list(&["pkgs/one"]),
            list(&["more/two", "pkgs/one"]),
            list(&["more/two", "pkgs/one"]),
            list(&["more/two", "pkgs/one"])
        ]
    );
}

#[test]
fn logs_the_schedule_once() {
    let (_, events) = read(windowed().path(), None, SMALL);
    assert_eq!(
        events,
        [HistoryEvent::Schedule {
            commits: 10,
            coarse: 4,
            tail: 8,
            from: 0,
            laid: 5
        }]
    );
    assert_eq!(
        events[0].line(),
        "history/schedule commits=10 coarse=4 tail=8 from=0 laid=5"
    );
}

#[test]
fn resumes_with_the_first_index_laid_again_then_the_same_schedule() {
    let repo = windowed();
    let (snaps, events) = read(repo.path(), Some(6), SMALL);
    assert_eq!(indices(&snaps), [6, 7, 8, 9]);
    assert_eq!(members(&snaps[0]), list(&[]));
    assert!(events.contains(&HistoryEvent::Schedule {
        commits: 10,
        coarse: 4,
        tail: 8,
        from: 6,
        laid: 4
    }));
    assert_eq!(indices(&read(repo.path(), Some(1), SMALL).0), [1, 3, 5, 7, 8, 9]);
}

#[test]
fn folds_every_commit_of_a_short_history_on_the_default_strides() {
    let (snaps, events) = read(windowed().path(), None, citymap_history::FOLD_STRIDES);
    assert_eq!(indices(&snaps), (0..10).collect::<Vec<_>>());
    assert_eq!(
        events,
        [HistoryEvent::Schedule {
            commits: 10,
            coarse: 0,
            tail: 0,
            from: 0,
            laid: 10
        }]
    );
}

#[test]
fn rejects_strides_the_schedule_cannot_use() {
    let failure = read_history(
        windowed().path(),
        ReadOptions {
            strides: Strides { grain: 3, ..SMALL },
            ..ReadOptions::default()
        },
    )
    .expect("a reader")
    .find_map(Result::err);
    assert_eq!(failure.map(|e| e.code), Some(ErrorCode::HistoryBadSchedule));
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

fn members(s: &Snapshot) -> Option<Vec<String>> {
    s.workspaces.as_ref().map(|w| w.to_vec())
}

#[expect(clippy::unnecessary_wraps, reason = "compared with the members a snapshot carries")]
fn list(items: &[&str]) -> Option<Vec<String>> {
    Some(items.iter().map(|s| (*s).to_owned()).collect())
}

#[test]
fn lists_the_folders_a_root_package_json_declares_following_it_as_it_changes_and_goes() {
    let repo = Repo::new();
    repo.write("src/index.ts", "x");
    repo.commit("no manifest");
    repo.write("package.json", r#"{"workspaces":["packages/*","!packages/skip"]}"#);
    repo.write("packages/a/index.ts", "a");
    repo.write("packages/skip/index.ts", "s");
    repo.write("tools/t/index.ts", "t");
    repo.commit("workspaces");
    repo.write("packages/b/deep/index.ts", "b");
    repo.commit("a new member");
    repo.write("packages/b/deep/index.ts", "b2");
    repo.commit("an edit, no folder changes");
    repo.write(
        "package.json",
        r#"{"workspaces":{"packages":["packages/*","tools/*"]}}"#,
    );
    repo.commit("more patterns");
    std::fs::remove_file(repo.path().join("packages/a/index.ts")).expect("removed");
    repo.commit("a member goes");
    std::fs::remove_file(repo.path().join("package.json")).expect("removed");
    repo.commit("manifest goes");
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(
        snaps.iter().map(members).collect::<Vec<_>>(),
        [
            None,
            list(&["packages/a"]),
            list(&["packages/a", "packages/b"]),
            list(&["packages/a", "packages/b"]),
            list(&["packages/a", "packages/b", "packages/skip", "tools/t"]),
            list(&["packages/b", "packages/skip", "tools/t"]),
            None,
        ]
    );
    // While neither the manifests nor the folders change, a commit hands over the same members.
    assert!(std::sync::Arc::ptr_eq(
        snaps[2].workspaces.as_ref().expect("members"),
        snaps[3].workspaces.as_ref().expect("members")
    ));
}

#[test]
fn joins_the_members_of_every_root_manifest_and_ignores_manifests_below_the_root() {
    let repo = Repo::new();
    repo.write("Cargo.toml", "[workspace]\nmembers = [\"crates/*\"]\n");
    repo.write("go.work", "go 1.22\nuse ./cmd/tool\n");
    repo.write("crates/x/src/lib.rs", "x");
    repo.write("cmd/tool/main.go", "m");
    repo.write("nested/package.json", r#"{"workspaces":["nested/*"]}"#);
    repo.write("nested/n/index.ts", "n");
    repo.commit("polyglot");
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(members(&snaps[0]), list(&["cmd/tool", "crates/x"]));
}

#[test]
fn leaves_workspaces_out_while_the_root_manifest_declares_none() {
    let repo = Repo::new();
    repo.write("package.json", r#"{"name":"solo"}"#);
    repo.write("packages/a/package.json", "{}");
    repo.commit("one package");
    let (snaps, _) = collect(repo.path(), 0);
    assert_eq!(members(&snaps[0]), None);
}

#[test]
fn reads_the_manifest_as_it_stands_at_the_first_commit_yielded() {
    let repo = Repo::new();
    repo.write("package.json", r#"{"workspaces":["apps/*"]}"#);
    repo.write("apps/web/index.ts", "w");
    repo.commit("apps");
    repo.write("README.md", "r");
    repo.commit("readme");
    let (snaps, _) = collect(repo.path(), 1);
    assert_eq!(
        snaps.iter().map(|s| (s.index, members(s))).collect::<Vec<_>>(),
        [(1, list(&["apps/web"]))]
    );
}

#[test]
fn logs_a_manifest_it_cannot_read_and_keeps_what_it_knew() {
    let source = Repo::new();
    source.write("package.json", r#"{"workspaces":["apps/*"]}"#);
    source.write("apps/web/index.ts", "w");
    source.commit("apps");
    source.write("package.json", r#"{"workspaces":["apps/*","packages/*"]}"#);
    source.write("packages/p/index.ts", "p");
    source.commit("packages");
    source.git(&["config", "uploadpack.allowFilter", "true"]);
    // A blob-less clone with no checkout holds no blobs at all, and never fetches one.
    let clone = Repo::new();
    std::fs::remove_dir_all(clone.path()).expect("an empty place");
    let url = format!("file://{}", source.path().display());
    let cloned = Command::new("git")
        .args(["clone", "-q", "--filter=blob:none", "--no-checkout", &url])
        .arg(clone.path())
        .output()
        .expect("git runs");
    assert!(cloned.status.success(), "{}", String::from_utf8_lossy(&cloned.stderr));
    // Only the first manifest is put back.
    clone.write("first.json", r#"{"workspaces":["apps/*"]}"#);
    clone.git(&["hash-object", "-w", "first.json"]);
    let (snaps, events) = collect(clone.path(), 0);
    assert_eq!(
        snaps.iter().map(members).collect::<Vec<_>>(),
        [list(&["apps/web"]), list(&["apps/web"])]
    );
    assert_eq!(
        events,
        [
            HistoryEvent::Schedule {
                commits: 2,
                coarse: 0,
                tail: 0,
                from: 0,
                laid: 2
            },
            HistoryEvent::ManifestUnavailable {
                path: "package.json".into(),
                index: 1
            }
        ]
    );
    // A single state of the same clone logs the same, at index 0.
    let mut seen = Vec::new();
    let head = clone.git(&["rev-parse", "HEAD"]);
    let tree = read_tree(clone.path(), &head, None, &mut |e| seen.push(e)).expect("a tree");
    assert_eq!(members(&tree), None);
    assert_eq!(
        seen,
        [HistoryEvent::ManifestUnavailable {
            path: "package.json".into(),
            index: 0
        }]
    );
}

/// A blob-less clone of `source` with no checkout: it holds no blobs at all, and never fetches one.
fn blobless(source: &Repo) -> Repo {
    source.git(&["config", "uploadpack.allowFilter", "true"]);
    let clone = Repo::new();
    std::fs::remove_dir_all(clone.path()).expect("an empty place");
    let url = format!("file://{}", source.path().display());
    let cloned = Command::new("git")
        .args(["clone", "-q", "--filter=blob:none", "--no-checkout", &url])
        .arg(clone.path())
        .env_remove("GIT_DIR")
        .output()
        .expect("git runs");
    assert!(cloned.status.success(), "{}", String::from_utf8_lossy(&cloned.stderr));
    clone
}

#[test]
fn knows_the_newest_manifest_it_holds_when_it_resumes_as_a_read_from_the_root_does() {
    let source = Repo::new();
    source.write("package.json", r#"{"workspaces":["apps/*"]}"#);
    source.write("apps/web/index.ts", "w");
    source.commit("apps");
    source.write("package.json", r#"{"workspaces":["apps/*","packages/*"]}"#);
    source.write("packages/p/index.ts", "p");
    source.commit("packages");
    source.write("README.md", "r");
    source.commit("readme");
    source.write("package.json", r#"{"workspaces":["packages/*"]}"#);
    source.commit("packages only");
    std::fs::remove_file(source.path().join("package.json")).expect("a manifest");
    source.commit("manifest goes");
    source.write("package.json", r#"{"workspaces":["apps/*","tools/*"]}"#);
    source.commit("manifest returns");
    let clone = blobless(&source);
    // Only the first manifest is put back; every later one is missing.
    clone.write("first.json", r#"{"workspaces":["apps/*"]}"#);
    clone.git(&["hash-object", "-w", "first.json"]);
    let (whole, _) = collect(clone.path(), 0);
    // The first manifest stands until the manifest goes; the one that returns cannot be read, and nothing is known.
    let web = list(&["apps/web"]);
    assert_eq!(
        whole.iter().map(members).collect::<Vec<_>>(),
        [web.clone(), web.clone(), web.clone(), web, None, None]
    );
    for from in 1..=5 {
        let (resumed, _) = collect(clone.path(), from);
        let tail: Vec<_> = whole[usize::try_from(from).expect("an index")..]
            .iter()
            .map(members)
            .collect();
        assert_eq!(
            resumed.iter().map(members).collect::<Vec<_>>(),
            tail,
            "resumed at {from}"
        );
    }
}

#[test]
fn looks_back_past_a_manifest_blob_a_full_clone_has_lost() {
    let repo = Repo::new();
    repo.write("package.json", r#"{"workspaces":["apps/*"]}"#);
    repo.write("apps/web/index.ts", "w");
    repo.commit("apps");
    repo.write("package.json", r#"{"workspaces":["packages/*"]}"#);
    repo.write("packages/p/index.ts", "p");
    repo.commit("packages");
    let lost = repo.git(&["hash-object", "package.json"]);
    std::fs::remove_file(repo.path().join(".git/objects").join(&lost[..2]).join(&lost[2..])).expect("a loose blob");
    let (snaps, events) = collect(repo.path(), 1);
    assert_eq!(snaps.iter().map(members).collect::<Vec<_>>(), [list(&["apps/web"])]);
    assert!(events.contains(&HistoryEvent::ManifestUnavailable {
        path: "package.json".into(),
        index: 1
    }));
}

#[test]
fn tells_whether_one_commit_is_in_another_s_history_counts_and_resolves_refs() {
    let repo = Repo::new();
    repo.write("a", "a");
    repo.commit("a");
    let first = repo.git(&["rev-parse", "HEAD"]);
    repo.write("b", "b");
    repo.commit("b");
    let second = repo.git(&["rev-parse", "HEAD"]);
    repo.git(&["checkout", "-q", "-b", "side", &first]);
    repo.write("c", "c");
    repo.commit("c");
    let side = repo.git(&["rev-parse", "HEAD"]);
    assert_eq!(citymap_history::is_ancestor(repo.path(), &first, &second), Ok(true));
    assert_eq!(citymap_history::is_ancestor(repo.path(), &side, &second), Ok(false));
    let unknown = citymap_history::is_ancestor(repo.path(), &"0".repeat(40), &second).unwrap_err();
    assert_eq!(unknown.code, ErrorCode::HistoryGitFailed);
    assert_eq!(citymap_history::resolve_commit(repo.path(), "main"), Ok(second.clone()));
    repo.git(&["checkout", "-q", "-b", "merged", &second]);
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
    let merged = repo.git(&["rev-parse", "HEAD"]);
    assert_eq!(citymap_history::count_commits(repo.path(), &first), Ok(1));
    assert_eq!(citymap_history::count_commits(repo.path(), &side), Ok(2));
    assert_eq!(citymap_history::count_commits(repo.path(), &merged), Ok(3));
    let uncounted = citymap_history::count_commits(repo.path(), &"f".repeat(40)).unwrap_err();
    assert!(
        uncounted
            .to_string()
            .starts_with("history/git-failed: git rev-list exited with 128"),
        "{uncounted}"
    );
    let missing = citymap_history::resolve_commit(repo.path(), "no-such-ref").unwrap_err();
    assert!(
        missing
            .to_string()
            .starts_with("history/git-failed: git rev-parse exited with 1"),
        "{missing}"
    );
}

#[test]
fn reads_blobs_empty_ones_included_an_absent_one_as_none_and_again_after() {
    use citymap_history::blobs::BlobReader;
    let repo = Repo::new();
    repo.write("a", "first\nline\n");
    repo.write("b", "");
    let (a, b) = (
        repo.git(&["hash-object", "-w", "a"]),
        repo.git(&["hash-object", "-w", "b"]),
    );
    let absent = "0".repeat(40);
    let mut reader = BlobReader::new(repo.path());
    let texts = reader.read_all(&[a.clone(), absent.clone(), b.clone()]).expect("texts");
    assert_eq!(texts[&a].as_deref(), Some("first\nline\n"));
    assert_eq!(texts[&absent], None);
    assert_eq!(texts[&b].as_deref(), Some(""));
    assert_eq!(reader.read_all(&[]).expect("nothing").len(), 0);
    assert_eq!(
        reader.read_all(std::slice::from_ref(&b)).expect("again")[&b].as_deref(),
        Some("")
    );
    // Outside a repository git cat-file exits at once: every blob is unavailable, each after a fresh start.
    let nowhere = std::env::temp_dir().join(format!("citymap-blobs-none-{}", std::process::id()));
    std::fs::create_dir_all(&nowhere).expect("a folder");
    let mut lost = BlobReader::new(&nowhere);
    let texts = lost.read_all(&["1".repeat(40), "2".repeat(40)]).expect("texts");
    assert!(texts.values().all(Option::is_none));
    let _ = std::fs::remove_dir_all(&nowhere);
}

#[test]
fn reads_one_commit_s_files_as_born_together_with_every_folder_and_its_members() {
    let repo = Repo::new();
    repo.write("package.json", r#"{"workspaces":["apps/*"]}"#);
    repo.write("apps/web/src/index.ts", "w");
    repo.write("lib/a.ts", "a");
    repo.commit("first");
    let first = repo.git(&["rev-parse", "HEAD"]);
    repo.write("later.ts", "l");
    repo.commit("second");
    let tree = read_tree(repo.path(), &first, Some("named"), &mut |_| {}).expect("a tree");
    assert_eq!(
        (tree.repository.as_str(), tree.commit.as_str(), tree.index),
        ("named", first.as_str(), 0)
    );
    assert_eq!(
        files(&tree),
        [
            ("apps/web/src/index.ts".into(), "apps/web/src/index.ts@0".into(), 0),
            ("lib/a.ts".into(), "lib/a.ts@0".into(), 0),
            ("package.json".into(), "package.json@0".into(), 0)
        ]
    );
    let mut folders: Vec<&str> = tree.folder_first_seen.keys().map(String::as_str).collect();
    folders.sort_unstable();
    assert_eq!(folders, ["", "apps", "apps/web", "apps/web/src", "lib"]);
    assert_eq!(members(&tree), list(&["apps/web"]));
    let base = repo.git(&["rev-parse", "HEAD"]);
    repo.git(&[
        "update-index",
        "--add",
        "--cacheinfo",
        &format!("160000,{base},vendor/lib"),
    ]);
    repo.git(&["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "sub"]);
    let sub = repo.git(&["rev-parse", "HEAD"]);
    let mut events = Vec::new();
    let tree = read_tree(repo.path(), &sub, None, &mut |e| events.push(e)).expect("a tree");
    assert!(tree.repository.starts_with("citymap-history-"));
    assert!(files(&tree).iter().any(|(path, _, _)| path == "vendor/lib/.gitlink"));
    assert_eq!(
        tree.submodules.as_deref().map(Vec::as_slice),
        Some(&["vendor/lib".to_owned()][..])
    );
    assert_eq!(
        events,
        [HistoryEvent::SubmoduleUnavailable {
            path: "vendor/lib".into(),
            index: 0,
            reason: UnreadReason::NoGitData
        }]
    );
}
