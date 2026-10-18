//! Submodules: a gitlink's pinned tree, read from the submodule's own git data, as files under its folder.
use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, LazyLock};

use citymap_ground_plan::fixed::compare_keys;
use citymap_ground_plan::region::separate::GITLINK_FILE;
use citymap_ground_plan::{CitymapError, ErrorCode, Result};
use indexmap::IndexMap;
use regress::Regex;

use crate::env::{git_command, git_data_command};
use crate::gitmodules::{ModuleEntry, is_safe_module_path, parse_gitmodules};
use crate::manifests::is_js_space;
use crate::read::{HistoryEvent, RawEntry};

/// Nesting deeper than this is not followed.
pub const SUBMODULE_DEPTH: usize = 8;
/// A gitlink's mode in a tree.
pub const GITLINK_MODE: &str = "160000";
/// The mode a submodule's files arrive with in the fold.
const FILE_MODE: &str = "100644";
/// The most a pinned tree's listing may hold, as the TypeScript reader's buffer (1 GiB).
const LISTING_LIMIT: usize = 1 << 30;
/// The most a nested `.gitmodules` may hold, as the TypeScript reader's default buffer (1 MiB).
const BLOB_LIMIT: usize = 1024 * 1024;

static GITDIR: LazyLock<Regex> =
    LazyLock::new(|| Regex::with_flags(r"^gitdir:\s*(.+?)\s*$", "m").expect("a valid pattern"));

/// Why a submodule could not be read.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnreadReason {
    NoGitData,
    MissingCommit,
    Depth,
    BadName,
}

impl UnreadReason {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NoGitData => "no-git-data",
            Self::MissingCommit => "missing-commit",
            Self::Depth => "depth",
            Self::BadName => "bad-name",
        }
    }
}

/// A submodule that could not be read, and why.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unread {
    pub path: String,
    pub reason: UnreadReason,
}

/// One gitlink as read at its pin: its files (path → blob id), the submodules in it, and those it could not read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Expanded {
    pub commit: String,
    pub files: IndexMap<String, String>,
    /// Every submodule folder it holds, itself included, sorted.
    pub submodules: Vec<String>,
    pub unread: Vec<Unread>,
    /// The git data of each submodule read (folder, git data), itself and nested ones: where their blobs are held.
    pub stores: Vec<(String, PathBuf)>,
}

/// A path resolved as `path.resolve` resolves it: each absolute part starts afresh, `.` and `..` resolved lexically.
fn resolve(base: &Path, parts: &[&OsStr]) -> PathBuf {
    let mut segments: Vec<&OsStr> = Vec::new();
    for part in std::iter::once(base.as_os_str()).chain(parts.iter().copied()) {
        let part = Path::new(part);
        if part.is_absolute() {
            segments.clear();
        }
        for component in part.components() {
            match component {
                Component::Normal(segment) => segments.push(segment),
                Component::ParentDir => {
                    segments.pop();
                }
                Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
            }
        }
    }
    let mut out = PathBuf::from("/");
    out.extend(segments);
    out
}

/// True when a path lies in a root, as `path.relative` judges it: the root itself, or below it by a relative path that
/// does not start with `..`.
fn within(path: &Path, root: &Path) -> bool {
    path.strip_prefix(root)
        .is_ok_and(|rest| !rest.as_os_str().as_encoded_bytes().starts_with(b".."))
}

/// A pinned tree's entries: mode, blob id and path; none when git cannot list it.
fn ls_tree(git_data: &Path, commit: &str) -> Option<Vec<(String, String, String)>> {
    let out = git_data_command(git_data, &["-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit])
        .output()
        .ok()?;
    if !out.status.success() || out.stdout.len() > LISTING_LIMIT {
        return None;
    }
    let entries = out
        .stdout
        .split(|&b| b == 0)
        .filter(|e| !e.is_empty())
        .map(|entry| {
            // "<mode> <type> <hash>\t<path>"
            let entry = String::from_utf8_lossy(entry);
            let (meta, path) = entry.split_once('\t').unwrap_or((&entry, ""));
            let mut fields = meta.split(' ');
            let mode = fields.next().unwrap_or("").to_owned();
            let blob = fields.nth(1).unwrap_or("").to_owned();
            (mode, blob, path.to_owned())
        })
        .collect();
    Some(entries)
}

/// A blob's text from some git data, or empty when it cannot be read.
fn cat_blob(git_data: &Path, blob: &str) -> String {
    match git_data_command(git_data, &["cat-file", "blob", blob]).output() {
        Ok(out) if out.status.success() && out.stdout.len() <= BLOB_LIMIT => {
            String::from_utf8_lossy(&out.stdout).into_owned()
        }
        _ => String::new(),
    }
}

/// What a read is kept by: the parent's git data, the path, the module's name as `.gitmodules` gives it, the pin.
type ReadKey = (Option<PathBuf>, String, Option<String>, String);

/// Reads submodules at their pins from the git data a repository holds; nothing is fetched or written.
pub struct SubmoduleReader {
    dir: PathBuf,
    common: Option<PathBuf>,
    kept: HashMap<ReadKey, Arc<Expanded>>,
}

impl SubmoduleReader {
    /// A reader of the repository whose working tree is `dir` (absolute).
    #[must_use]
    pub fn new(dir: &Path) -> Self {
        Self {
            dir: resolve(dir, &[]),
            common: None,
            kept: HashMap::new(),
        }
    }

    /// How many readings it keeps.
    #[must_use]
    pub fn held(&self) -> usize {
        self.kept.len()
    }

    /// Lets go of every reading it keeps: a pin asked for again is read again.
    pub fn forget(&mut self) {
        self.kept.clear();
    }

    /// The pinned trees of a tree's gitlinks (path → commit), named by its `.gitmodules` text (none when unread), in
    /// path order.
    pub fn expand_all(
        &mut self,
        gitlinks: &HashMap<String, String>,
        gitmodules: Option<&str>,
    ) -> Result<Vec<(String, Arc<Expanded>)>> {
        let modules = parse_gitmodules(gitmodules.unwrap_or(""));
        let mut sorted: Vec<(&String, &String)> = gitlinks.iter().collect();
        sorted.sort_by(|a, b| compare_keys(a.0, b.0));
        sorted
            .into_iter()
            .map(|(path, commit)| Ok((path.clone(), self.expand(None, path, modules.get(path), commit, 0)?)))
            .collect()
    }

    /// One gitlink at its pin, kept until `forget`: a pin seen again before then reads nothing.
    pub fn expand(
        &mut self,
        parent: Option<&Path>,
        path: &str,
        module: Option<&ModuleEntry>,
        commit: &str,
        depth: usize,
    ) -> Result<Arc<Expanded>> {
        let key: ReadKey = (
            parent.map(Path::to_path_buf),
            path.to_owned(),
            module.map(|m| m.name.clone()),
            commit.to_owned(),
        );
        if let Some(found) = self.kept.get(&key) {
            return Ok(found.clone());
        }
        let name = module.map_or(path, |m| m.name.as_str());
        let found = Arc::new(self.read(parent, path, name, commit, depth)?);
        self.kept.insert(key, found.clone());
        Ok(found)
    }

    fn read(&mut self, parent: Option<&Path>, path: &str, name: &str, commit: &str, depth: usize) -> Result<Expanded> {
        let unread = |reason: UnreadReason| Expanded {
            commit: commit.to_owned(),
            files: IndexMap::from([(format!("{path}/{GITLINK_FILE}"), commit.to_owned())]),
            submodules: vec![path.to_owned()],
            unread: vec![Unread {
                path: path.to_owned(),
                reason,
            }],
            stores: Vec::new(),
        };
        if depth >= SUBMODULE_DEPTH {
            return Ok(unread(UnreadReason::Depth));
        }
        if !is_safe_module_path(name) || !is_safe_module_path(path) {
            return Ok(unread(UnreadReason::BadName));
        }
        let Some(git_data) = self.git_data_of(parent, path, name)? else {
            return Ok(unread(UnreadReason::NoGitData));
        };
        let Some(entries) = ls_tree(&git_data, commit) else {
            return Ok(unread(UnreadReason::MissingCommit));
        };
        let mut files: IndexMap<String, String> = IndexMap::new();
        let mut nested: Vec<(String, String)> = Vec::new();
        let mut gitmodules_blob: Option<String> = None;
        for (mode, blob, inner) in entries {
            if mode == GITLINK_MODE {
                nested.push((inner, blob));
            } else {
                files.insert(format!("{path}/{inner}"), blob.clone());
                if inner == ".gitmodules" {
                    gitmodules_blob = Some(blob);
                }
            }
        }
        let mut submodules = vec![path.to_owned()];
        let mut unread_list: Vec<Unread> = Vec::new();
        let mut stores = vec![(path.to_owned(), git_data.clone())];
        if !nested.is_empty() {
            let text = gitmodules_blob.map_or_else(String::new, |blob| cat_blob(&git_data, &blob));
            let modules = parse_gitmodules(&text);
            nested.sort_by(|a, b| compare_keys(&a.0, &b.0));
            for (inner, pin) in &nested {
                let sub = self.expand(
                    Some(&git_data),
                    &format!("{path}/{inner}"),
                    modules.get(inner),
                    pin,
                    depth + 1,
                )?;
                for (p, b) in &sub.files {
                    files.insert(p.clone(), b.clone());
                }
                submodules.extend(sub.submodules.iter().cloned());
                unread_list.extend(sub.unread.iter().cloned());
                stores.extend(sub.stores.iter().cloned());
            }
        }
        submodules.sort_by(|a, b| compare_keys(a, b));
        Ok(Expanded {
            commit: commit.to_owned(),
            files,
            submodules,
            unread: unread_list,
            stores,
        })
    }

    /// Where a submodule's git data lies: its parent's `modules/<name>`, else its working tree's `.git`; or none.
    fn git_data_of(&mut self, parent: Option<&Path>, path: &str, name: &str) -> Result<Option<PathBuf>> {
        let base = match parent {
            Some(parent) => parent.to_path_buf(),
            None => self.common_dir()?,
        };
        let modules = resolve(&base, &[OsStr::new("modules"), OsStr::new(name)]);
        if modules.join("objects").is_dir() {
            return Ok(Some(modules));
        }
        let dot_git = resolve(&self.dir, &[OsStr::new(path), OsStr::new(".git")]);
        if dot_git.join("objects").is_dir() {
            return Ok(Some(dot_git));
        }
        if !dot_git.is_file() {
            return Ok(None);
        }
        let bytes = std::fs::read(&dot_git).map_err(|e| {
            CitymapError::new(
                ErrorCode::EngineUnexpected,
                format!("{} could not be read: {e}", dot_git.display()),
            )
        })?;
        let text = String::from_utf8_lossy(&bytes);
        let Some(line) = GITDIR.find(&text) else {
            return Ok(None);
        };
        let pointed = &text[line.group(1).expect("the git data's path")];
        let target = resolve(&self.dir, &[OsStr::new(path), OsStr::new(pointed)]);
        // Followed only inside the repository's folder or its git data.
        if !within(&target, &self.dir) && !within(&target, &self.common_dir()?) {
            return Ok(None);
        }
        Ok(target.join("objects").is_dir().then_some(target))
    }

    fn common_dir(&mut self) -> Result<PathBuf> {
        if let Some(common) = &self.common {
            return Ok(common.clone());
        }
        let out = git_command(&self.dir, &["rev-parse", "--git-common-dir"])
            .output()
            .map_err(|e| {
                CitymapError::new(
                    ErrorCode::HistoryGitFailed,
                    format!("git rev-parse could not start: {e}"),
                )
            })?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(CitymapError::new(
                ErrorCode::HistoryGitFailed,
                format!(
                    "git rev-parse exited with {}: {}",
                    out.status.code().unwrap_or(-1),
                    stderr.split('\n').next().unwrap_or("")
                ),
            ));
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        let common = resolve(&self.dir, &[OsStr::new(stdout.trim_matches(is_js_space))]);
        self.common = Some(common.clone());
        Ok(common)
    }
}

/// The fold's gitlinks and what each was last expanded to. `move_pins` expands the pins that moved since, at once,
/// and says what changed, as one commit's changes sorted by path; nothing moved is none. Each pin is read at its own
/// expansion point, named by the `.gitmodules` in force there, and nothing read outlives the expansion that read it
/// but the expansions it made.
pub struct Pins {
    reader: SubmoduleReader,
    /// The tree state's gitlinks: path → pinned commit.
    pub gitlinks: HashMap<String, String>,
    expanded: HashMap<String, Arc<Expanded>>,
    list: Option<Arc<Vec<String>>>,
}

impl Pins {
    #[must_use]
    pub fn new(reader: SubmoduleReader) -> Self {
        Self {
            reader,
            gitlinks: HashMap::new(),
            expanded: HashMap::new(),
            list: None,
        }
    }

    /// The submodule folders as last expanded, sorted, when any: the same list while they stay the same.
    #[must_use]
    pub fn submodules(&self) -> Option<Arc<Vec<String>>> {
        self.list.clone()
    }

    /// How many readings it holds: the last expansions, and those the reader keeps.
    #[must_use]
    pub fn held(&self) -> (usize, usize) {
        (self.expanded.len(), self.reader.held())
    }

    /// Expands the pins that moved since their last expansion (or are new, or gone), emitting the events in path
    /// order, and returns the changes; none when nothing moved. Each moved pin is read now, named by the `.gitmodules`
    /// in force (`gitmodules` gives its text, asked once and only when a pin moved); the reader keeps nothing past it.
    pub fn move_pins(
        &mut self,
        index: i64,
        gitmodules: &mut dyn FnMut() -> Result<Option<String>>,
        on_event: &mut dyn FnMut(HistoryEvent),
    ) -> Result<Option<Vec<RawEntry>>> {
        let mut moved: Vec<(String, String)> = self
            .gitlinks
            .iter()
            .filter(|(path, pin)| self.expanded.get(*path).is_none_or(|e| e.commit != **pin))
            .map(|(path, pin)| (path.clone(), pin.clone()))
            .collect();
        moved.sort_by(|a, b| compare_keys(&a.0, &b.0));
        let gone: Vec<String> = self
            .expanded
            .keys()
            .filter(|path| !self.gitlinks.contains_key(*path))
            .cloned()
            .collect();
        if moved.is_empty() && gone.is_empty() {
            return Ok(None);
        }
        let mut before: IndexMap<String, String> = IndexMap::new();
        for path in moved.iter().map(|(p, _)| p).chain(&gone) {
            if let Some(expanded) = self.expanded.get(path) {
                for (file, blob) in &expanded.files {
                    before.insert(file.clone(), blob.clone());
                }
            }
        }
        for path in &gone {
            self.expanded.remove(path);
        }
        let modules = if moved.is_empty() {
            IndexMap::new()
        } else {
            parse_gitmodules(gitmodules()?.as_deref().unwrap_or(""))
        };
        let mut after: IndexMap<String, String> = IndexMap::new();
        for (path, pin) in moved {
            let found = self.reader.expand(None, &path, modules.get(&path), &pin, 0)?;
            for (file, blob) in &found.files {
                after.insert(file.clone(), blob.clone());
            }
            for unread in &found.unread {
                on_event(HistoryEvent::SubmoduleUnavailable {
                    path: unread.path.clone(),
                    index,
                    reason: unread.reason,
                });
            }
            if !found.unread.iter().any(|u| u.path == path) {
                on_event(HistoryEvent::Submodule {
                    path: path.clone(),
                    index,
                    files: found.files.len(),
                });
            }
            self.expanded.insert(path, found);
        }
        self.reader.forget();
        let entry = |status: &str, path: &String, blob: &String| RawEntry {
            mode: FILE_MODE.to_owned(),
            blob: blob.clone(),
            status: status.to_owned(),
            path: path.clone(),
        };
        let mut changes: Vec<RawEntry> = Vec::new();
        for (path, blob) in &before {
            if !after.contains_key(path) {
                changes.push(entry("D", path, blob));
            }
        }
        for (path, blob) in &after {
            match before.get(path) {
                None => changes.push(entry("A", path, blob)),
                Some(was) if was != blob => changes.push(entry("M", path, blob)),
                Some(_) => {}
            }
        }
        let mut list: Vec<String> = self
            .expanded
            .values()
            .flat_map(|e| e.submodules.iter().cloned())
            .collect();
        list.sort_by(|a, b| compare_keys(a, b));
        if self.list.as_ref().map_or(&[][..], |l| l.as_slice()) != list.as_slice() {
            self.list = (!list.is_empty()).then(|| Arc::new(list));
        }
        changes.sort_by(|a, b| compare_keys(&a.path, &b.path));
        Ok(Some(changes))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_paths_as_node_does() {
        let base = Path::new("/repo");
        assert_eq!(
            resolve(base, &[OsStr::new("a/./b"), OsStr::new("../c")]),
            PathBuf::from("/repo/a/c")
        );
        assert_eq!(
            resolve(base, &[OsStr::new("x"), OsStr::new("/abs/y")]),
            PathBuf::from("/abs/y")
        );
        assert_eq!(resolve(base, &[OsStr::new("../../..")]), PathBuf::from("/"));
        assert_eq!(resolve(Path::new("/repo/"), &[]), PathBuf::from("/repo"));
    }

    #[test]
    fn judges_a_path_within_a_root_as_path_relative_does() {
        let root = Path::new("/repo");
        assert!(within(Path::new("/repo"), root));
        assert!(within(Path::new("/repo/.git/modules/x"), root));
        assert!(!within(Path::new("/other"), root));
        assert!(!within(Path::new("/repository"), root));
        assert!(!within(Path::new("/repo/..x"), root));
    }

    #[test]
    fn names_each_reason_as_typescript_does() {
        assert_eq!(
            [
                UnreadReason::NoGitData,
                UnreadReason::MissingCommit,
                UnreadReason::Depth,
                UnreadReason::BadName
            ]
            .map(UnreadReason::as_str),
            ["no-git-data", "missing-commit", "depth", "bad-name"]
        );
    }
}
