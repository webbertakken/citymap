//! A partial clone's root workspace manifests: exactly the blobs the commits it lays name, fetched in one call before
//! the fold reads them, so it lays the towns a full clone lays. A full clone holds them all, and is asked nothing. The
//! Rust implementation of `packages/history/src/fetch-manifests.ts`.
use std::collections::BTreeSet;
use std::io::{Read, Write};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::blobs::list_held;
use crate::env::git_command;
use crate::mailmap::{Ended, run_feeding};
use crate::manifests::is_manifest;
use crate::read::HistoryEvent;

/// How long the one fetch of the manifests may take before it is given up: a prompt or a stalled network.
pub const MANIFESTS_FETCH_TIMEOUT: Duration = Duration::from_secs(30);

/// What became of a partial clone's manifests.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ManifestsStatus {
    Held,
    Fetched,
    Unfetchable,
}

impl ManifestsStatus {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Held => "held",
            Self::Fetched => "fetched",
            Self::Unfetchable => "unfetchable",
        }
    }
}

fn failed(what: &str, stderr: &[u8], code: Option<i32>) -> CitymapError {
    let stderr = String::from_utf8_lossy(stderr);
    let code = code.map_or_else(|| "null".to_owned(), |c| c.to_string());
    CitymapError::new(
        ErrorCode::HistoryGitFailed,
        format!(
            "git {what} exited with {code}: {}",
            stderr.split('\n').next().unwrap_or("")
        ),
    )
}

/// Each item on a line of its own, as git reads its input.
fn lines<'a>(items: impl Iterator<Item = &'a str>) -> String {
    let mut text = String::new();
    for item in items {
        text.push_str(item);
        text.push('\n');
    }
    text
}

/// Bytes as lower-case hex, as git writes an object id.
fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut text = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        text.push(char::from(DIGITS[usize::from(byte >> 4)]));
        text.push(char::from(DIGITS[usize::from(byte & 15)]));
    }
    text
}

/// Every first-parent commit's root tree, by index, oldest first, up to `head`.
pub fn root_trees(dir: &Path, head: &str) -> Result<Vec<String>> {
    let out = git_command(dir, &["log", "--first-parent", "--reverse", "--format=%T", head, "--"])
        .output()
        .map_err(|e| CitymapError::new(ErrorCode::HistoryGitFailed, format!("git log could not start: {e}")))?;
    if !out.status.success() {
        return Err(failed("log", &out.stderr, out.status.code()));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .split('\n')
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect())
}

/// Each tree's raw bytes, through one `git cat-file --batch` (trees are held, in a partial clone too).
fn read_trees(dir: &Path, trees: &[&str]) -> Result<Vec<u8>> {
    let mut child = git_command(dir, &["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            CitymapError::new(
                ErrorCode::HistoryGitFailed,
                format!("git cat-file could not start: {e}"),
            )
        })?;
    let mut stdin = child.stdin.take().expect("piped");
    let input = lines(trees.iter().copied());
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(input.as_bytes());
    });
    let mut bytes = Vec::new();
    let _ = child.stdout.take().expect("piped").read_to_end(&mut bytes);
    let _ = writer.join();
    let _ = child.wait();
    Ok(bytes)
}

/// The manifest blobs a root tree's entries name: files `is_manifest` names, not folders or gitlinks.
fn manifests_in(tree: &[u8], id_bytes: usize, into: &mut BTreeSet<String>) {
    let mut at = 0;
    while at < tree.len() {
        let Some(space) = tree[at..].iter().position(|&b| b == b' ').map(|i| at + i) else {
            return;
        };
        let Some(nul) = tree[space..].iter().position(|&b| b == 0).map(|i| space + i) else {
            return;
        };
        let mode = &tree[at..space];
        let name = String::from_utf8_lossy(&tree[space + 1..nul]);
        let id = hex(&tree[nul + 1..nul + 1 + id_bytes]);
        if mode != b"40000" && mode != b"160000" && is_manifest(&name) {
            into.insert(id);
        }
        at = nul + 1 + id_bytes;
    }
}

/// The root manifest blobs of these trees (ids or expressions such as `HEAD^{tree}`), each tree read once, each blob
/// named once, sorted: exactly the blobs a fold laying their commits reads.
pub fn laid_manifests(dir: &Path, trees: &[String]) -> Result<Vec<String>> {
    let mut distinct: Vec<&str> = Vec::new();
    for tree in trees {
        if !distinct.contains(&tree.as_str()) {
            distinct.push(tree);
        }
    }
    let bytes = read_trees(dir, &distinct)?;
    let mut blobs = BTreeSet::new();
    let mut at = 0;
    while let Some(newline) = bytes[at..].iter().position(|&b| b == b'\n').map(|i| at + i) {
        // "<id> tree <size>\n<content>\n"
        let header = String::from_utf8_lossy(&bytes[at..newline]);
        let mut fields = header.split(' ');
        let id = fields.next().unwrap_or("");
        let size: usize = fields.nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        let end = newline + 1 + size;
        manifests_in(&bytes[newline + 1..end], id.len() / 2, &mut blobs);
        at = end + 1;
    }
    Ok(blobs.into_iter().collect())
}

/// The clone's promisor remotes, in the order git asks them: `extensions.partialclone`'s first.
#[must_use]
pub fn promisor_remotes(dir: &Path) -> Vec<String> {
    let pattern = "^(extensions\\.partialclone|remote\\..*\\.promisor)$";
    let Ok(out) = git_command(dir, &["config", "--get-regexp", pattern]).output() else {
        return vec![];
    };
    let mut first: Vec<String> = Vec::new();
    let mut promisors: Vec<String> = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).split('\n') {
        let (key, value) = line.split_once(' ').unwrap_or((line, ""));
        if key == "extensions.partialclone" {
            first = vec![value.to_owned()];
        } else if value == "true" {
            let name = key.strip_prefix("remote.").and_then(|k| k.strip_suffix(".promisor"));
            promisors.extend(name.map(str::to_owned));
        }
    }
    let mut remotes: Vec<String> = Vec::new();
    for name in first.into_iter().chain(promisors) {
        if !remotes.contains(&name) {
            remotes.push(name);
        }
    }
    remotes
}

/// Fetches the root manifest blobs of the trees `trees` names (asked only of a partial clone) that it does not hold, and
/// nothing else, in one call per promisor remote, as git's own lazy fetch asks for objects
/// (`fetch.negotiationAlgorithm=noop`, `--filter=blob:none`, the ids on its input). Never prompts; given up after
/// `timeout`. None for a full clone, which is asked nothing.
pub fn fetch_manifests(
    dir: &Path,
    trees: impl FnOnce() -> Result<Vec<String>>,
    timeout: Duration,
) -> Result<Option<HistoryEvent>> {
    let remotes = promisor_remotes(dir);
    if remotes.is_empty() {
        return Ok(None);
    }
    let wanted = laid_manifests(dir, &trees()?)?;
    let missing = |held: &std::collections::HashSet<String>| -> Vec<String> {
        wanted.iter().filter(|blob| !held.contains(*blob)).cloned().collect()
    };
    let before = missing(&list_held(dir, false)?);
    let event = |status: ManifestsStatus, fetched: usize, reason: Option<String>, error: Option<String>| {
        HistoryEvent::Manifests {
            status,
            blobs: wanted.len(),
            fetched,
            reason,
            error,
        }
    };
    if before.is_empty() {
        return Ok(Some(event(ManifestsStatus::Held, 0, None, None)));
    }
    let mut left = before.clone();
    let (mut reason, mut error) = ("timeout".to_owned(), None);
    for remote in &remotes {
        let mut command = git_command(
            dir,
            &[
                "-c",
                "fetch.negotiationAlgorithm=noop",
                "fetch",
                remote,
                "--no-tags",
                "--no-write-fetch-head",
                "--recurse-submodules=no",
                "--filter=blob:none",
                "--stdin",
            ],
        );
        command.env_remove("GIT_NO_LAZY_FETCH").env("GIT_TERMINAL_PROMPT", "0");
        let input = lines(left.iter().map(String::as_str));
        match run_feeding(command, timeout, input.as_bytes()) {
            Ended::Timeout => (reason, error) = ("timeout".to_owned(), None),
            Ended::Ran { code: Some(0), .. } => {}
            Ended::Ran { code, stderr, .. } => {
                reason = format!("exit-{}", code.map_or_else(|| "null".to_owned(), |c| c.to_string()));
                error = Some(stderr.split('\n').next().unwrap_or("").to_owned());
            }
        }
        left = missing(&list_held(dir, false)?);
        if left.is_empty() {
            break;
        }
    }
    let fetched = before.len() - left.len();
    Ok(Some(if left.is_empty() {
        event(ManifestsStatus::Fetched, fetched, None, None)
    } else {
        event(ManifestsStatus::Unfetchable, fetched, Some(reason), error)
    }))
}
