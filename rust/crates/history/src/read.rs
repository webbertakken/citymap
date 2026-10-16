//! Streams a repository's first-parent history, oldest first, as one snapshot per commit; reads no file contents but
//! the root workspace manifests. Git runs on a reader thread, and snapshots cross to the fold over a bounded channel.
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};
use std::thread::JoinHandle;

use citymap_ground_plan::fixed::compare_keys;
use citymap_ground_plan::snapshot::{FileEntry, MAX_PATH_BYTES, Snapshot, folder_of};
use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::blobs::BlobReader;
use crate::env::git_command;
use crate::workspaces::{Change, Workspaces};

/// How many snapshots the reader may run ahead of the fold.
pub const SNAPSHOT_QUEUE: usize = 64;
const SUBMODULE: &str = "160000";

/// Something the reader noticed, for logs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryEvent {
    /// A submodule entry is skipped.
    SkipSubmodule { path: String, index: i64 },
    /// A root manifest's blob could not be read (a blob-less clone never fetches).
    ManifestUnavailable { path: String, index: i64 },
}

impl HistoryEvent {
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::SkipSubmodule { .. } => "history/skip-submodule",
            Self::ManifestUnavailable { .. } => "history/manifest-unavailable",
        }
    }

    /// `code path=… index=…`, as the CLI logs it.
    #[must_use]
    pub fn line(&self) -> String {
        let (Self::SkipSubmodule { path, index } | Self::ManifestUnavailable { path, index }) = self;
        format!("{} path={path} index={index}", self.code())
    }
}

/// One changed path of a commit, from git's raw diff against the first parent.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RawEntry {
    pub mode: String,
    pub blob: String,
    pub status: String,
    pub path: String,
}

/// One first-parent commit and its changes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RawCommit {
    pub sha: String,
    pub entries: Vec<RawEntry>,
}

/// Parses git's `log --raw -z` tokens (split at NUL) into commits, one token at a time.
#[derive(Default)]
pub struct RawLogParser {
    current: Option<RawCommit>,
    meta: Option<String>,
}

impl RawLogParser {
    /// Takes one token; returns the commit it completed, if any.
    pub fn push(&mut self, raw: &str) -> Result<Option<RawCommit>> {
        let token = raw.strip_prefix('\n').unwrap_or(raw);
        if let Some(header) = token.strip_prefix('\u{1}') {
            let sha = header.get(..40).unwrap_or(header).to_owned();
            self.meta = None;
            return Ok(self.current.replace(RawCommit { sha, entries: vec![] }));
        }
        if token.is_empty() {
            return Ok(None);
        }
        let Some(current) = self.current.as_mut() else {
            let start: String = token.chars().take(80).collect();
            return Err(
                CitymapError::new(ErrorCode::HistoryParse, "the log does not start with a commit")
                    .with("token", &start),
            );
        };
        let Some(meta) = self.meta.take() else {
            self.meta = Some(token.to_owned());
            return Ok(None);
        };
        // ":<old mode> <new mode> <old blob> <new blob> <status>", then the path.
        let fields: Vec<&str> = meta.get(1..).unwrap_or("").split(' ').collect();
        let field = |i: usize| fields.get(i).copied().unwrap_or("").to_owned();
        current.entries.push(RawEntry {
            mode: field(1),
            blob: field(3),
            status: field(4),
            path: token.to_owned(),
        });
        Ok(None)
    }

    /// The last commit, once the log has ended.
    #[must_use]
    pub fn finish(self) -> Option<RawCommit> {
        self.current
    }
}

/// Parses a whole log's tokens into commits.
pub fn parse_raw_log<'a>(tokens: impl IntoIterator<Item = &'a str>) -> Result<Vec<RawCommit>> {
    let mut parser = RawLogParser::default();
    let mut out = Vec::new();
    for token in tokens {
        out.extend(parser.push(token)?);
    }
    out.extend(parser.finish());
    Ok(out)
}

#[derive(Clone, Debug)]
struct Live {
    blob: String,
    identity: Arc<str>,
    first_seen: i64,
}

/// The tree state the log is applied to, and what was last handed over.
struct Tree {
    state: BTreeMap<Arc<str>, Live>,
    folders: HashMap<String, i64>,
    workspaces: Workspaces,
    files: Option<Arc<Vec<FileEntry>>>,
    folder_map: Option<Arc<HashMap<String, i64>>>,
}

impl Tree {
    /// Applies one commit: deletions, exact renames (equal blobs, paired in path order), additions. True when the set
    /// of files changed; a commit that only edits files leaves it as it was.
    fn apply(&mut self, commit: &RawCommit, index: i64, on_event: &mut dyn FnMut(HistoryEvent)) -> Result<bool> {
        let mut deleted: HashMap<String, VecDeque<Live>> = HashMap::new();
        let mut added: Vec<&RawEntry> = Vec::new();
        for entry in &commit.entries {
            let removed = entry.status == "D";
            self.workspaces
                .touch(&entry.path, (!removed).then_some(entry.blob.as_str()));
            if removed {
                let Some(live) = self.state.remove(entry.path.as_str()) else {
                    continue;
                };
                self.workspaces.remove(&entry.path);
                deleted.entry(live.blob.clone()).or_default().push_back(live);
            } else if entry.mode == SUBMODULE {
                on_event(HistoryEvent::SkipSubmodule {
                    path: entry.path.clone(),
                    index,
                });
            } else if entry.status == "A" {
                added.push(entry);
            } else if let Some(live) = self.state.get_mut(entry.path.as_str()) {
                live.blob.clone_from(&entry.blob);
            } else {
                added.push(entry);
            }
        }
        added.sort_by(|a, b| compare_keys(&a.path, &b.path));
        for entry in &added {
            // A path the engine cannot hold ends the read, by name: its length bounds every folder walk.
            if entry.path.len() > MAX_PATH_BYTES {
                let start: String = entry.path.chars().take(80).collect();
                return Err(CitymapError::new(
                    ErrorCode::SnapshotBadPath,
                    format!("a path is longer than {MAX_PATH_BYTES} bytes"),
                )
                .with("index", &index)
                .with("start", &start));
            }
            let moved = deleted.get_mut(entry.blob.as_str()).and_then(VecDeque::pop_front);
            self.workspaces.add(&entry.path);
            let live = match moved {
                Some(moved) => Live {
                    blob: entry.blob.clone(),
                    ..moved
                },
                None => Live {
                    blob: entry.blob.clone(),
                    identity: format!("{}@{index}", entry.path).into(),
                    first_seen: index,
                },
            };
            self.state.insert(entry.path.as_str().into(), live);
            let mut folder = folder_of(&entry.path);
            while !self.folders.contains_key(folder) {
                self.folders.insert(folder.to_owned(), index);
                if folder.is_empty() {
                    break;
                }
                folder = folder_of(folder);
            }
        }
        Ok(!deleted.is_empty() || !added.is_empty())
    }

    /// The files of the tree state, sorted, as the snapshot holds them; the same list while the set of files stands.
    fn files(&mut self) -> Arc<Vec<FileEntry>> {
        self.files
            .get_or_insert_with(|| {
                Arc::new(
                    self.state
                        .iter()
                        .map(|(path, live)| FileEntry {
                            path: path.clone(),
                            identity: live.identity.clone(),
                            first_seen: live.first_seen,
                        })
                        .collect(),
                )
            })
            .clone()
    }

    fn folder_map(&mut self) -> Arc<HashMap<String, i64>> {
        self.folder_map
            .get_or_insert_with(|| Arc::new(self.folders.clone()))
            .clone()
    }
}

/// What the reader hands over, in order.
#[derive(Debug)]
pub enum HistoryItem {
    Event(HistoryEvent),
    Snapshot(Snapshot),
}

/// Where and how to read.
#[derive(Clone, Debug)]
pub struct ReadOptions {
    /// The commit to read up to.
    pub to: String,
    /// The first index to yield: earlier commits still apply to the tree, but build no snapshot.
    pub from: i64,
    /// The repository's display name; the folder name by default.
    pub repository: Option<String>,
}

impl Default for ReadOptions {
    fn default() -> Self {
        Self {
            to: "HEAD".into(),
            from: 0,
            repository: None,
        }
    }
}

/// A history being read: snapshots and events, oldest first, ending with an error if the read failed.
pub struct History {
    items: Receiver<Result<HistoryItem>>,
    reader: Option<JoinHandle<()>>,
}

impl Iterator for History {
    type Item = Result<HistoryItem>;

    fn next(&mut self) -> Option<Self::Item> {
        let item = self.items.recv().ok();
        if item.is_none()
            && let Some(reader) = self.reader.take()
        {
            let _ = reader.join();
        }
        item
    }
}

/// The folder's absolute path and its display name.
pub(crate) fn locate(dir: &Path, repository: Option<&str>) -> (PathBuf, String) {
    let absolute = std::path::absolute(dir).unwrap_or_else(|_| dir.to_path_buf());
    let name = repository.map_or_else(
        || {
            absolute
                .file_name()
                .map_or_else(String::new, |n| n.to_string_lossy().into_owned())
        },
        str::to_owned,
    );
    (absolute, name)
}

/// Streams a repository's first-parent history, oldest first, as one snapshot per commit.
pub fn read_history(dir: &Path, options: ReadOptions) -> Result<History> {
    let (dir, repository) = locate(dir, options.repository.as_deref());
    if !dir.is_dir() {
        return Err(CitymapError::new(
            ErrorCode::HistoryNotARepo,
            format!("{} is not a directory", dir.display()),
        )
        .with("dir", &dir.display()));
    }
    let (send, items) = sync_channel(SNAPSHOT_QUEUE);
    let reader = std::thread::Builder::new()
        .name("citymap-history".into())
        .spawn(move || {
            if let Err(error) = read(&dir, &repository, &options, &send) {
                let _ = send.send(Err(error));
            }
        })
        .map_err(|e| {
            CitymapError::new(
                ErrorCode::EngineUnexpected,
                format!("the history reader could not start: {e}"),
            )
        })?;
    Ok(History {
        items,
        reader: Some(reader),
    })
}

/// The reader thread: runs git, applies each commit as it completes, and sends what the fold needs. Stops quietly when
/// the fold stops listening.
fn read(dir: &Path, repository: &str, options: &ReadOptions, send: &SyncSender<Result<HistoryItem>>) -> Result<()> {
    let args = [
        "-c",
        "core.quotepath=off",
        "-c",
        "core.hooksPath=/dev/null",
        "log",
        "--first-parent",
        "--reverse",
        "--diff-merges=first-parent",
        "--raw",
        "-z",
        "--no-renames",
        "--no-abbrev",
        "--format=%x01%H",
        options.to.as_str(),
        "--",
    ];
    let mut child = git_command(dir, &args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| CitymapError::new(ErrorCode::HistoryGitFailed, format!("git log could not start: {e}")))?;
    let mut stderr = child.stderr.take().expect("piped");
    let errors = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    });
    let mut stdout = BufReader::new(child.stdout.take().expect("piped"));
    let mut tree = Tree {
        state: BTreeMap::new(),
        folders: HashMap::new(),
        workspaces: Workspaces::default(),
        files: None,
        folder_map: None,
    };
    let mut blobs = BlobReader::new(dir);
    let mut parser = RawLogParser::default();
    let mut index = 0;
    let mut token = Vec::new();
    let mut lay = |commit: RawCommit, index: &mut i64| -> Result<bool> {
        let mut events = Vec::new();
        let mut on_event = |e: HistoryEvent| events.push(e);
        // The manifests this commit needs, read before its snapshot is built.
        let texts = if *index >= options.from {
            let changes: Vec<Change> = commit
                .entries
                .iter()
                .map(|e| Change {
                    path: &e.path,
                    blob: &e.blob,
                    deleted: e.status == "D",
                })
                .collect();
            blobs.read_all(&tree.workspaces.wanted(&changes))?
        } else {
            HashMap::new()
        };
        if tree.apply(&commit, *index, &mut on_event)? {
            tree.files = None;
            tree.folder_map = None;
        }
        let snapshot = if *index >= options.from {
            let workspaces = tree.workspaces.resolve(&texts, *index, &mut on_event);
            Some(Snapshot {
                repository: repository.to_owned(),
                commit: commit.sha,
                index: *index,
                files: tree.files(),
                folder_first_seen: tree.folder_map(),
                workspaces,
            })
        } else {
            None
        };
        *index += 1;
        for event in events {
            if send.send(Ok(HistoryItem::Event(event))).is_err() {
                return Ok(false);
            }
        }
        Ok(snapshot.is_none_or(|s| send.send(Ok(HistoryItem::Snapshot(s))).is_ok()))
    };
    loop {
        token.clear();
        let read = stdout
            .read_until(0, &mut token)
            .map_err(|e| CitymapError::new(ErrorCode::HistoryGitFailed, format!("git log could not be read: {e}")))?;
        if read == 0 {
            break;
        }
        if token.last() == Some(&0) {
            token.pop();
        }
        if let Some(commit) = parser.push(&String::from_utf8_lossy(&token))?
            && !lay(commit, &mut index)?
        {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(());
        }
    }
    let status = child
        .wait()
        .map_err(|e| CitymapError::new(ErrorCode::HistoryGitFailed, format!("git log: {e}")))?;
    let stderr = errors.join().unwrap_or_default();
    if !status.success() {
        let code = status.code().map_or_else(|| "null".to_owned(), |c| c.to_string());
        let first = stderr.split('\n').next().unwrap_or("").to_owned();
        return Err(CitymapError::new(
            ErrorCode::HistoryGitFailed,
            format!("git log exited with {code}: {first}"),
        )
        .with("code", &code)
        .with("stderr", &first));
    }
    if let Some(commit) = parser.finish() {
        lay(commit, &mut index)?;
    }
    Ok(())
}
