//! The mailmap on real, temporary repositories: git's own `%aE` as the reference, and the commit's `.mailmap` read
//! whatever the working tree holds.
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use citymap_ground_plan::ErrorCode;
use citymap_history::blobs::BlobReader;
use citymap_history::mailmap::{Ended, Fetched, fetch_blob, run_within};
use citymap_history::{Author, HistoryEvent, Mailmap, MailmapStatus, read_mailmap};

static NEXT: AtomicUsize = AtomicUsize::new(0);

/// A temporary folder, removed when dropped.
struct Temp(PathBuf);

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn temp() -> Temp {
    let n = NEXT.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("citymap-mailmap-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a temporary folder");
    Temp(dir)
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env_remove("GIT_DIR")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn repo() -> Temp {
    let dir = temp();
    git(&dir.0, &["init", "-q", "-b", "main"]);
    dir
}

fn commit_as(dir: &Path, name: &str, email: &str, message: &str) {
    git(dir, &["add", "-A"]);
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["commit", "-q", "--allow-empty", "-m", message])
        .env_remove("GIT_DIR")
        .env("GIT_AUTHOR_NAME", name)
        .env("GIT_AUTHOR_EMAIL", email)
        .env("GIT_COMMITTER_NAME", "c")
        .env("GIT_COMMITTER_EMAIL", "c@c")
        .output()
        .expect("git runs");
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
}

fn read(dir: &Path, commit: &str) -> (Mailmap, HistoryEvent) {
    let sha = git(dir, &["rev-parse", commit]).trim().to_owned();
    read_mailmap(dir, &sha, &mut BlobReader::new(dir)).expect("a mailmap")
}

const fn event(status: MailmapStatus, entries: i64) -> HistoryEvent {
    HistoryEvent::Mailmap {
        status,
        entries,
        reason: None,
        error: None,
    }
}

fn author(name: &str, email: &str) -> Author {
    Author {
        name: name.to_owned(),
        email: email.to_owned(),
    }
}

#[test]
fn maps_every_author_as_gits_own_percent_a_e_does_with_the_same_mailmap() {
    let repo = repo();
    let authors = [
        ("Ann", "ann@old.org"),
        ("Bob", "bob@old.org"),
        ("Cy", "cy@x.org"),
        ("Dee Old", "dee@old.org"),
        ("Someone Else", "dee@old.org"),
        ("EVE", "eve@old.org"),
        ("Fay", "fay@old.org"),
        ("Gil", "gil@old.org"),
        ("Gus", "gus@old.org"),
        ("Hal", "hal@old.org"),
        ("Ivy", "ivy@old.org"),
        ("Jo", "jo@old.org"),
        ("Lee", "lee@old.org"),
        ("Max", "max@old.org"),
        ("Ned", "ned@old.org"),
        ("Oz", "oz@old.org"),
        ("Pat Name", "pat@old.org"),
        ("ROS", "ros@old.org"),
        ("Ünal", "unal@old.org"),
        ("Öla", "öla@old.org"),
        ("Zed", "zed@other.org"),
    ];
    for (i, (name, email)) in authors.iter().enumerate() {
        commit_as(&repo.0, name, email, &format!("c{i}"));
    }
    let text = [
        "# a comment",
        "Ann Proper <ann@new.org> <ANN@old.org>",
        "<bob@new.org> <bob@old.org>",
        "Cy Proper <cy@x.org>",
        "Dee Proper <dee@new.org> Dee Old <dee@old.org>",
        "<dee@simple.org> <dee@old.org>",
        "Eve <eve@new.org> eve <EVE@old.org>",
        "<first@x.org> <fay@old.org>",
        "<second@x.org> <fay@old.org>",
        "<gil@new.org> <gil@old.org>",
        "Gil Proper <gil@old.org>",
        "Gus Only <gus@old.org>",
        "<> <hal@old.org>",
        " <ivy@new.org>   <ivy@old.org>  trailing junk",
        "<jo@new.org> <jo@old.org> Extra <x@y>",
        "<lee@new.org> < lee@old.org >",
        "#<max@new.org> <max@old.org>",
        "  # <ned@new.org> <ned@old.org>",
        "<oz@new.org><oz@old.org>",
        "Pat <pat@new.org> Pat Name  <pat@old.org>\r",
        "Ros <ros@one.org> Ros <ros@old.org>",
        "Ros <ros@two.org> ros <ros@old.org>",
        "<unal@new.org> ünal <unal@old.org>",
        "<ola@new.org> <ÖLA@old.org>",
        "",
    ]
    .join("\n");
    // In a checkout, git maps %aE through the working tree's .mailmap: the reference to match.
    std::fs::write(repo.0.join(".mailmap"), &text).expect("a mailmap");
    let log = git(&repo.0, &["log", "--reverse", "--format=%an%x02%ae%x02%aE"]);
    let mailmap = Mailmap::parse(&text);
    let (mut ours, mut gits) = (Vec::new(), Vec::new());
    for line in log.trim_end().split('\n') {
        let fields: Vec<&str> = line.split('\u{2}').collect();
        ours.push(mailmap.email_of(&author(fields[0], fields[1])).to_owned());
        gits.push(fields[2].to_owned());
    }
    assert_eq!(ours, gits);
    assert!(ours.contains(&"dee@simple.org".to_owned()));
    assert!(ours.contains(&"second@x.org".to_owned()));
}

#[test]
fn reads_the_commits_mailmap_whatever_the_working_tree_holds() {
    let repo = repo();
    std::fs::write(repo.0.join(".mailmap"), "<one@x> <a@x>\n").expect("a mailmap");
    commit_as(&repo.0, "A", "a@x", "one");
    std::fs::write(repo.0.join(".mailmap"), "<two@x> <a@x>\n<b2@x> <b@x>\n").expect("a mailmap");
    commit_as(&repo.0, "A", "a@x", "two");
    std::fs::write(repo.0.join(".mailmap"), "<tree@x> <a@x>\n").expect("a mailmap");
    let a = author("A", "a@x");
    let (head, said) = read(&repo.0, "HEAD");
    assert_eq!((head.email_of(&a), said), ("two@x", event(MailmapStatus::Read, 2)));
    let (first, said) = read(&repo.0, "HEAD~1");
    assert_eq!((first.email_of(&a), said), ("one@x", event(MailmapStatus::Read, 1)));
}

#[test]
fn maps_nobody_when_the_commit_has_no_mailmap_file() {
    let repo = repo();
    std::fs::write(repo.0.join("a.ts"), "a").expect("a file");
    commit_as(&repo.0, "A", "a@x", "one");
    std::fs::write(repo.0.join(".mailmap"), "<tree@x> <a@x>\n").expect("a mailmap");
    let a = author("A", "a@x");
    let (absent, said) = read(&repo.0, "HEAD");
    assert_eq!((absent.email_of(&a), said), ("a@x", event(MailmapStatus::Absent, 0)));
    std::fs::remove_file(repo.0.join(".mailmap")).expect("removed");
    std::fs::write(repo.0.join("real"), "<link@x> <a@x>\n").expect("a file");
    std::os::unix::fs::symlink("real", repo.0.join(".mailmap")).expect("a link");
    commit_as(&repo.0, "A", "a@x", "link");
    assert_eq!(read(&repo.0, "HEAD").1, event(MailmapStatus::NotAFile, 0));
    std::fs::remove_file(repo.0.join(".mailmap")).expect("removed");
    git(&repo.0, &["rm", "-q", "--cached", ".mailmap"]);
    std::fs::create_dir(repo.0.join(".mailmap")).expect("a folder");
    std::fs::write(repo.0.join(".mailmap/inside"), "<dir@x> <a@x>\n").expect("a file");
    commit_as(&repo.0, "A", "a@x", "folder");
    assert_eq!(read(&repo.0, "HEAD").1, event(MailmapStatus::NotAFile, 0));
}

/// A blob-less clone, without a checkout, of a repository whose one commit holds a .mailmap; its temporary folder too.
fn partial_clone() -> (Temp, Temp, PathBuf) {
    let source = repo();
    std::fs::write(source.0.join(".mailmap"), "<one@x> <a@x>\n").expect("a mailmap");
    std::fs::write(source.0.join("a.ts"), "a").expect("a file");
    commit_as(&source.0, "A", "a@x", "one");
    git(&source.0, &["config", "uploadpack.allowFilter", "true"]);
    let clone = temp();
    let url = format!("file://{}", source.0.display());
    let target = clone.0.join("c");
    git(
        &clone.0,
        &[
            "clone",
            "-q",
            "--no-checkout",
            "--filter=blob:none",
            &url,
            &target.display().to_string(),
        ],
    );
    (source, clone, target)
}

/// The blobs a repository holds, sorted.
fn held_blobs(dir: &Path) -> Vec<String> {
    let mut blobs: Vec<String> = git(
        dir,
        &[
            "cat-file",
            "--batch-check=%(objecttype) %(objectname)",
            "--batch-all-objects",
        ],
    )
    .lines()
    .filter_map(|line| line.strip_prefix("blob ").map(str::to_owned))
    .collect();
    blobs.sort();
    blobs
}

#[test]
fn fetches_a_partial_clones_missing_mailmap_that_one_blob_and_no_other_object() {
    let (_source, _clone, target) = partial_clone();
    assert_eq!(held_blobs(&target), Vec::<String>::new());
    let (fetched, said) = read(&target, "HEAD");
    assert_eq!(
        (fetched.email_of(&author("A", "a@x")), said),
        ("one@x", event(MailmapStatus::Fetched, 1))
    );
    let mailmap = git(&target, &["rev-parse", "HEAD:.mailmap"]).trim().to_owned();
    assert_eq!(held_blobs(&target), vec![mailmap]);
    // Held now, it reads as any other.
    assert_eq!(read(&target, "HEAD").1, event(MailmapStatus::Read, 1));
}

#[test]
fn makes_the_authors_unknown_saying_why_when_the_mailmap_cannot_be_fetched() {
    let (_source, _clone, target) = partial_clone();
    let gone = target.join("gone").display().to_string();
    git(&target, &["remote", "set-url", "origin", &gone]);
    let (unfetched, said) = read(&target, "HEAD");
    assert_eq!(unfetched.email_of(&author("A", "a@x")), "a@x");
    assert_eq!(
        said,
        HistoryEvent::Mailmap {
            status: MailmapStatus::Unfetchable,
            entries: 0,
            reason: Some("exit-128".to_owned()),
            error: Some(format!("fatal: '{gone}' does not appear to be a git repository")),
        }
    );
    assert_eq!(
        said.line(),
        format!(
            "history/mailmap status=unfetchable entries=0 reason=exit-128 error=fatal: '{gone}' does not appear to be a git repository"
        )
    );
    assert_eq!(held_blobs(&target), Vec::<String>::new());
}

#[test]
fn names_a_clone_with_no_promisor_remote_that_lacks_the_blob_without_asking_anyone() {
    let repo = repo();
    let mut mktree = Command::new("git")
        .arg("-C")
        .arg(&repo.0)
        .args(["mktree", "--missing"])
        .env_remove("GIT_DIR")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("git runs");
    let missing = "1".repeat(40);
    std::io::Write::write_all(
        mktree.stdin.as_mut().expect("stdin"),
        format!("100644 blob {missing}\t.mailmap\n").as_bytes(),
    )
    .expect("written");
    let out = mktree.wait_with_output().expect("a tree");
    let tree = String::from_utf8_lossy(&out.stdout).trim().to_owned();
    let commit = git(
        &repo.0,
        &[
            "-c",
            "user.name=a",
            "-c",
            "user.email=a@x",
            "commit-tree",
            &tree,
            "-m",
            "lost",
        ],
    )
    .trim()
    .to_owned();
    let (_, said) = read_mailmap(&repo.0, &commit, &mut BlobReader::new(&repo.0)).expect("a mailmap");
    assert_eq!(
        said,
        HistoryEvent::Mailmap {
            status: MailmapStatus::Unfetchable,
            entries: 0,
            reason: Some("exit-128".to_owned()),
            error: Some(format!("fatal: git cat-file {missing}: bad file")),
        }
    );
}

#[test]
fn gives_up_on_a_fetch_that_does_not_answer_in_time() {
    let (_source, clone, target) = partial_clone();
    let hang = clone.0.join("hang.sh");
    std::fs::write(&hang, "#!/bin/sh\nexec sleep 5\n").expect("a script");
    std::fs::set_permissions(&hang, std::os::unix::fs::PermissionsExt::from_mode(0o755)).expect("executable");
    git(
        &target,
        &["config", "remote.origin.uploadpack", &hang.display().to_string()],
    );
    let blob = git(&target, &["rev-parse", "HEAD:.mailmap"]).trim().to_owned();
    let started = std::time::Instant::now();
    assert_eq!(
        fetch_blob(&target, &blob, Duration::from_millis(200)),
        Fetched::Failed {
            reason: "timeout".to_owned(),
            error: None
        }
    );
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[test]
fn says_a_command_that_could_not_start_and_one_that_ends_quietly() {
    let second = Duration::from_secs(1);
    match run_within(Command::new("citymap-no-such-command"), second) {
        Ended::Ran { code, stderr, .. } => assert_eq!((code, stderr.is_empty()), (None, false)),
        Ended::Timeout => panic!("it never started"),
    }
    assert_eq!(
        run_within(Command::new("true"), second),
        Ended::Ran {
            code: Some(0),
            stdout: vec![],
            stderr: String::new()
        }
    );
    assert!(matches!(
        run_within(Command::new("false"), second),
        Ended::Ran { code: Some(1), .. }
    ));
}

#[test]
fn names_git_failing_on_a_commit_it_cannot_list() {
    let repo = repo();
    commit_as(&repo.0, "A", "a@x", "one");
    let failed = read_mailmap(&repo.0, &"0".repeat(40), &mut BlobReader::new(&repo.0)).unwrap_err();
    assert_eq!(failed.code, ErrorCode::HistoryGitFailed);
    assert!(
        failed.message.starts_with("git ls-tree exited with 128: "),
        "{}",
        failed.message
    );
}
