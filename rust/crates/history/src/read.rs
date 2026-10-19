//! Streams a repository's first-parent history, oldest first, as one snapshot per commit the fold schedule lays; every
//! commit applies to the tree. Reads no file contents but the root workspace manifests. Git runs on a reader thread, and
//! snapshots cross to the fold over a bounded channel.
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};
use std::thread::JoinHandle;

use citymap_ground_plan::fixed::compare_keys;
use citymap_ground_plan::snapshot::{FileEntry, MAX_PATH_BYTES, Snapshot, UNFETCHABLE, folder_of};
use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::ancestry::{count_commits, resolve_commit};
use crate::blobs::BlobReader;
use crate::env::git_command;
use crate::fetch_manifests::{MANIFESTS_FETCH_TIMEOUT, ManifestsStatus, fetch_manifests, root_trees};
use crate::file_history::FileHistory;
use crate::mailmap::{Author, Mailmap, MailmapStatus, read_mailmap};
use crate::schedule::{FOLD_STRIDES, Strides, fold_schedule, is_laid, laid_count};
use crate::submodules::{GITLINK_MODE, Pins, SubmoduleReader, UnreadReason};
use crate::workspaces::{Change, Workspaces};

/// How many snapshots the reader may run ahead of the fold.
pub const SNAPSHOT_QUEUE: usize = 64;

/// Something the reader noticed, for logs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryEvent {
    /// A submodule could not be read at its pin: it is laid as its `.gitlink` file.
    SubmoduleUnavailable {
        path: String,
        index: i64,
        reason: UnreadReason,
    },
    /// A submodule was read at its pin: its files, nested submodules' included.
    Submodule { path: String, index: i64, files: usize },
    /// A root manifest's blob could not be read (a blob-less clone never fetches).
    ManifestUnavailable { path: String, index: i64 },
    /// A partial clone's root manifests of the commits it lays: what became of them, how many there are, how many were
    /// fetched, and for unfetchable ones why (`timeout` or `exit-<code>`) and git's first line of complaint.
    Manifests {
        status: ManifestsStatus,
        blobs: usize,
        fetched: usize,
        reason: Option<String>,
        error: Option<String>,
    },
    /// The target's `.mailmap`, read for a file history: what was found, how many commit emails it has lines for, and
    /// for an unfetchable one why (`timeout` or `exit-<code>`) and git's first line of complaint.
    Mailmap {
        status: MailmapStatus,
        entries: i64,
        reason: Option<String>,
        error: Option<String>,
    },
    /// The fold schedule a read follows: the history's length, its zone boundaries, the first index and how many it lays.
    Schedule {
        commits: i64,
        coarse: i64,
        tail: i64,
        from: i64,
        laid: i64,
    },
}

impl HistoryEvent {
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::SubmoduleUnavailable { .. } => "history/submodule-unavailable",
            Self::Submodule { .. } => "history/submodule",
            Self::ManifestUnavailable { .. } => "history/manifest-unavailable",
            Self::Manifests { .. } => "history/manifests",
            Self::Mailmap { .. } => "history/mailmap",
            Self::Schedule { .. } => "history/schedule",
        }
    }

    /// `code key=value …`, as the CLI logs it.
    #[must_use]
    pub fn line(&self) -> String {
        match self {
            Self::SubmoduleUnavailable { path, index, reason } => {
                format!("{} path={path} index={index} reason={}", self.code(), reason.as_str())
            }
            Self::Submodule { path, index, files } => {
                format!("{} path={path} index={index} files={files}", self.code())
            }
            Self::ManifestUnavailable { path, index } => {
                format!("{} path={path} index={index}", self.code())
            }
            Self::Manifests {
                status,
                blobs,
                fetched,
                reason,
                error,
            } => {
                let reason = reason.as_ref().map_or_else(String::new, |r| format!(" reason={r}"));
                let error = error.as_ref().map_or_else(String::new, |e| format!(" error={e}"));
                format!(
                    "{} status={} blobs={blobs} fetched={fetched}{reason}{error}",
                    self.code(),
                    status.as_str()
                )
            }
            Self::Mailmap {
                status,
                entries,
                reason,
                error,
            } => {
                let reason = reason.as_ref().map_or_else(String::new, |r| format!(" reason={r}"));
                let error = error.as_ref().map_or_else(String::new, |e| format!(" error={e}"));
                format!(
                    "{} status={} entries={entries}{reason}{error}",
                    self.code(),
                    status.as_str()
                )
            }
            Self::Schedule {
                commits,
                coarse,
                tail,
                from,
                laid,
            } => format!(
                "{} commits={commits} coarse={coarse} tail={tail} from={from} laid={laid}",
                self.code()
            ),
        }
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

/// One first-parent commit: its id, its committer time (epoch seconds), its author as written, and its changes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RawCommit {
    pub sha: String,
    pub time: i64,
    pub author: Author,
    pub entries: Vec<RawEntry>,
}

/// The largest safe integer of a JavaScript number: a time beyond it reads 0, as the reference reads it.
const MAX_SAFE: i64 = (1 << 53) - 1;

/// A commit's header, "<sha>\x02<time>\x02<email>\x02<name>" after its \x01 mark: the name is the rest, so one holding a
/// \x02 stays whole; a time that is no number reads 0.
fn header_of(header: &str) -> RawCommit {
    let mut parts = header.splitn(4, '\u{2}');
    let sha = parts.next().unwrap_or("").to_owned();
    let time = parts.next().unwrap_or("");
    let seconds = if !time.is_empty() && time.bytes().all(|b| b.is_ascii_digit()) {
        time.parse::<i64>().ok().filter(|t| *t <= MAX_SAFE).unwrap_or(0)
    } else {
        0
    };
    RawCommit {
        sha,
        time: seconds,
        author: Author {
            email: parts.next().unwrap_or("").to_owned(),
            name: parts.next().unwrap_or("").to_owned(),
        },
        entries: vec![],
    }
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
            self.meta = None;
            return Ok(self.current.replace(header_of(header)));
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

/// The tree state the log is applied to, its gitlinks and their expansions, and what was last handed over.
struct Tree {
    state: BTreeMap<Arc<str>, Live>,
    folders: HashMap<String, i64>,
    workspaces: Workspaces,
    pins: Pins,
    files: Option<Arc<Vec<FileEntry>>>,
    folder_map: Option<Arc<HashMap<String, i64>>>,
}

impl Tree {
    /// Takes a file out of the tree state, noting it as deleted (by blob) for the renames.
    fn remove(&mut self, path: &str, deleted: &mut HashMap<String, VecDeque<Live>>) {
        let Some(live) = self.state.remove(path) else {
            return;
        };
        self.workspaces.remove(path);
        deleted.entry(live.blob.clone()).or_default().push_back(live);
    }

    /// Applies one commit: deletions, exact renames (equal blobs, paired in path order), additions. True when the set
    /// of files changed; a commit that only edits files leaves it as it was. Gitlinks go to the pins: a submodule's
    /// files arrive when its pin is expanded.
    fn apply(&mut self, commit: &RawCommit, index: i64) -> Result<bool> {
        let mut deleted: HashMap<String, VecDeque<Live>> = HashMap::new();
        let mut added: Vec<&RawEntry> = Vec::new();
        for entry in &commit.entries {
            let removed = entry.status == "D";
            self.workspaces
                .touch(&entry.path, (!removed).then_some(entry.blob.as_str()));
            if removed {
                if self.pins.gitlinks.remove(&entry.path).is_none() {
                    self.remove(&entry.path, &mut deleted);
                }
            } else if entry.mode == GITLINK_MODE {
                // A file that becomes a gitlink leaves the tree; the gitlink's pin moves.
                self.remove(&entry.path, &mut deleted);
                self.pins.gitlinks.insert(entry.path.clone(), entry.blob.clone());
            } else {
                // A path the tree does not hold arrives (a birth, or a gitlink turned file); one it holds keeps its
                // identity.
                self.pins.gitlinks.remove(&entry.path);
                if let Some(live) = self.state.get_mut(entry.path.as_str()) {
                    live.blob.clone_from(&entry.blob);
                } else {
                    added.push(entry);
                }
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

/// What the reader hands over, in order; with `files` asked for, the files' history comes last.
#[derive(Debug)]
pub enum HistoryItem {
    Event(HistoryEvent),
    Snapshot(Snapshot),
    Files(FileHistory),
}

/// Where and how to read.
#[derive(Clone, Debug)]
pub struct ReadOptions {
    /// The commit to read up to.
    pub to: String,
    /// A resume: the first index to yield, laid whatever the schedule; earlier commits still apply to the tree, but build
    /// no snapshot, and later ones follow the schedule.
    pub from: Option<i64>,
    /// The fold schedule's strides; `FOLD_STRIDES` by default (tests and measurements choose others).
    pub strides: Strides,
    /// The repository's display name; the folder name by default.
    pub repository: Option<String>,
    /// Record every commit's changes by identity, for the files' own measures, handed over at the end.
    pub files: bool,
}

impl Default for ReadOptions {
    fn default() -> Self {
        Self {
            to: "HEAD".into(),
            from: None,
            strides: FOLD_STRIDES,
            repository: None,
            files: false,
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

/// Streams a repository's first-parent history, oldest first, as one snapshot per commit the fold schedule lays.
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
    // The count and the log walk the same commit, even when the ref moves between them.
    let head = resolve_commit(dir, &options.to)?;
    let schedule = fold_schedule(count_commits(dir, &head)?, options.strides)?;
    let from = options.from;
    let laid = |index: i64| is_laid(&schedule, index, from);
    let chosen = HistoryEvent::Schedule {
        commits: schedule.commits,
        coarse: schedule.coarse_end,
        tail: schedule.tail_start,
        from: from.unwrap_or(0),
        laid: laid_count(&schedule, from),
    };
    if send.send(Ok(HistoryItem::Event(chosen))).is_err() {
        return Ok(());
    }
    // A partial clone fetches the root manifests of the commits it lays, before any blob is read.
    let manifests = fetch_manifests(
        dir,
        || {
            Ok(root_trees(dir, &head)?
                .into_iter()
                .enumerate()
                .filter(|(at, _)| laid(i64::try_from(*at).unwrap_or(i64::MAX)))
                .map(|(_, tree)| tree)
                .collect())
        },
        MANIFESTS_FETCH_TIMEOUT,
    )?;
    let unfetched = matches!(
        manifests,
        Some(HistoryEvent::Manifests {
            status: ManifestsStatus::Unfetchable,
            ..
        })
    );
    if let Some(event) = manifests
        && send.send(Ok(HistoryItem::Event(event))).is_err()
    {
        return Ok(());
    }
    let mut blobs = BlobReader::new(dir);
    // The target's own .mailmap names the people, so the history alone decides who they are. Read before the log starts.
    let mut mailmap = Mailmap::default();
    let mut files = options.files.then(FileHistory::default);
    if let Some(history) = files.as_mut() {
        let (read, event) = read_mailmap(dir, &head, &mut blobs)?;
        if matches!(
            event,
            HistoryEvent::Mailmap {
                status: MailmapStatus::Unfetchable,
                ..
            }
        ) {
            history.forget_authors();
        }
        if send.send(Ok(HistoryItem::Event(event))).is_err() {
            return Ok(());
        }
        mailmap = read;
    }
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
        // Every gitlink change, whatever .gitmodules says to ignore: git would read that blob, which a blob-less clone
        // does not hold and may not fetch, and a submodule it ignores would vanish from the fold.
        "--ignore-submodules=none",
        "--no-abbrev",
        // The author as written: %aE would map it through the working tree's .mailmap.
        "--format=%x01%H%x02%ct%x02%ae%x02%an",
        head.as_str(),
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
        pins: Pins::new(SubmoduleReader::new(dir)),
        files: None,
        folder_map: None,
    };
    // Pins are expanded where the uninterrupted fold lays, whatever the resume, so births carry the same indices.
    let expands_at = |index: i64| is_laid(&schedule, index, None) || Some(index) == from;
    let mut parser = RawLogParser::default();
    let mut index = 0;
    let mut token = Vec::new();
    let mut lay = |commit: RawCommit, index: &mut i64| -> Result<bool> {
        let mut events = Vec::new();
        let mut on_event = |e: HistoryEvent| events.push(e);
        // The manifests this commit needs, read before its snapshot is built.
        let texts = if laid(*index) {
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
        if tree.apply(&commit, *index)? {
            tree.files = None;
            tree.folder_map = None;
        }
        // The commit's own changes, recorded before its pins expand: a submodule's files carry no history of their own.
        if let Some(history) = files.as_mut() {
            record_changes(history, &mailmap, &tree, &commit);
        }
        if expands_at(*index) {
            // The pins that moved, read now, each named by `.gitmodules` as it stands; applied after the commit's own.
            let names = tree.state.get(".gitmodules").map(|live| live.blob.clone());
            let mut gitmodules = || -> Result<Option<String>> {
                let Some(blob) = &names else { return Ok(None) };
                Ok(blobs.read_all(std::slice::from_ref(blob))?.remove(blob).flatten())
            };
            let moved = tree.pins.move_pins(*index, &mut gitmodules, &mut on_event)?;
            if let Some(entries) = moved {
                let synthetic = RawCommit {
                    sha: commit.sha.clone(),
                    time: commit.time,
                    author: commit.author.clone(),
                    entries,
                };
                if tree.apply(&synthetic, *index)? {
                    tree.files = None;
                    tree.folder_map = None;
                }
            }
        }
        let snapshot = if laid(*index) {
            let workspaces = tree
                .workspaces
                .resolve(&texts, *index, &mut on_event, &mut |older| blobs.read_all(older))?;
            Some(Snapshot {
                repository: repository.to_owned(),
                commit: commit.sha,
                index: *index,
                files: tree.files(),
                folder_first_seen: tree.folder_map(),
                workspaces,
                submodules: tree.pins.submodules(),
                manifests: unfetched.then_some(UNFETCHABLE),
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
    if let Some(commit) = parser.finish()
        && !lay(commit, &mut index)?
    {
        return Ok(());
    }
    if let Some(history) = files {
        let _ = send.send(Ok(HistoryItem::Files(history)));
    }
    Ok(())
}

/// Records a commit's changes to the files it leaves live, after it is applied, by the identities they carry, under the
/// email the mailmap gives its author.
fn record_changes(history: &mut FileHistory, mailmap: &Mailmap, tree: &Tree, commit: &RawCommit) {
    let email = mailmap.email_of(&commit.author);
    for entry in &commit.entries {
        if entry.status == "D" || entry.mode == GITLINK_MODE {
            continue;
        }
        // Applying the commit made every such path live.
        if let Some(live) = tree.state.get(entry.path.as_str()) {
            history.record(&live.identity, commit.time, email);
        }
    }
}
