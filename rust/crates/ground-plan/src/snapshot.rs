//! One commit's tree: the engine's only input.
use std::collections::HashMap;
use std::sync::Arc;

/// The most files a snapshot may hold.
pub const MAX_FILES: usize = 2_000_000;
/// The longest path, in UTF-8 bytes; it also bounds a path's depth (2,048 folders).
pub const MAX_PATH_BYTES: usize = 4096;

/// One file of a commit's tree.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileEntry {
    pub path: Arc<str>,
    /// `{pathAtBirth}@{birthIndex}`, carried through exact renames.
    pub identity: Arc<str>,
    /// Birth index of the identity.
    pub first_seen: i64,
}

impl FileEntry {
    #[must_use]
    pub fn new(path: &str, identity: &str, first_seen: i64) -> Self {
        Self {
            path: path.into(),
            identity: identity.into(),
            first_seen,
        }
    }
}

/// One commit's tree. A history reader hands over the same `files` and `folder_first_seen` (the same `Arc`s) while
/// commits only edit files, so what the engine derives from them is kept.
#[derive(Clone, Debug)]
pub struct Snapshot {
    pub repository: String,
    pub commit: String,
    pub index: i64,
    /// Sorted by `compare_keys(path)`.
    pub files: Arc<Vec<FileEntry>>,
    /// Folder path to the first commit index holding it.
    pub folder_first_seen: Arc<HashMap<String, i64>>,
    /// Member folders declared by the root workspace manifests, when the history reader read them; sorted.
    pub workspaces: Option<Arc<Vec<String>>>,
    /// The submodules' folders (gitlinks), read or not, when the tree holds any; sorted.
    pub submodules: Option<Arc<Vec<String>>>,
}

impl Snapshot {
    /// The first index a folder held a file, or 0 when it is not known.
    #[must_use]
    pub fn folder_first_seen(&self, folder: &str) -> i64 {
        self.folder_first_seen.get(folder).copied().unwrap_or(0)
    }
}

/// The folder of a path: everything before its last `/`, or the root.
#[must_use]
pub fn folder_of(path: &str) -> &str {
    path.rfind('/').map_or("", |i| &path[..i])
}
