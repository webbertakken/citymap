//! The files of one commit and their contents, read without fetching: what the CLI counts a city's measures from. A
//! submodule's files are listed at its pin, as the city lays them, each with the git data that holds its blob.
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::blobs::BlobReader;
use crate::env::git_command;
use crate::submodules::{GITLINK_MODE, SubmoduleReader};

/// Where a file's blob is held.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Store {
    /// The repository itself.
    Repository,
    /// A submodule's git data.
    GitData(PathBuf),
    /// Nowhere: the `.gitlink` file of a submodule that could not be read, which is never asked for.
    Nowhere,
}

/// A file of a commit's tree, as the city lays it: its path, its blob, and where the blob is held.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeFile {
    pub path: String,
    pub blob: String,
    pub store: Store,
}

/// The submodule store of a path: the git data of the deepest submodule folder holding it, or nowhere.
fn store_of(path: &str, stores: &[&(String, PathBuf)]) -> Store {
    stores
        .iter()
        .find(|(folder, _)| {
            path.len() > folder.len() && path.starts_with(folder.as_str()) && path.as_bytes()[folder.len()] == b'/'
        })
        .map_or(Store::Nowhere, |(_, data)| Store::GitData(data.clone()))
}

/// Every file of the tree at `commit`, in git's order, then each submodule's files at its pin (named by the commit's
/// `.gitmodules`), as the single state and the fold lay them.
pub fn list_tree(dir: &Path, commit: &str) -> Result<Vec<TreeFile>> {
    let out = git_command(dir, &["-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit])
        .output()
        .map_err(|e| CitymapError::new(ErrorCode::HistoryGitFailed, format!("git ls-tree could not start: {e}")))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(CitymapError::new(
            ErrorCode::HistoryGitFailed,
            format!(
                "git ls-tree exited with {}: {}",
                out.status.code().unwrap_or(-1),
                stderr.split('\n').next().unwrap_or("")
            ),
        ));
    }
    let mut files: Vec<TreeFile> = Vec::new();
    let mut gitlinks: HashMap<String, String> = HashMap::new();
    for entry in out.stdout.split(|&b| b == 0) {
        // "<mode> <type> <hash>\t<path>"
        let entry = String::from_utf8_lossy(entry);
        let Some((meta, path)) = entry.split_once('\t') else {
            continue;
        };
        let mut fields = meta.split(' ');
        let (mode, blob) = (fields.next().unwrap_or(""), fields.nth(1).unwrap_or(""));
        if mode == GITLINK_MODE {
            gitlinks.insert(path.to_owned(), blob.to_owned());
        } else {
            files.push(TreeFile {
                path: path.to_owned(),
                blob: blob.to_owned(),
                store: Store::Repository,
            });
        }
    }
    if gitlinks.is_empty() {
        return Ok(files);
    }
    let names = match files.iter().find(|f| f.path == ".gitmodules") {
        Some(found) => {
            let blob = found.blob.clone();
            BlobReader::new(dir)
                .read_all(std::slice::from_ref(&blob))?
                .remove(&blob)
                .flatten()
        }
        None => None,
    };
    for (_, found) in SubmoduleReader::new(dir).expand_all(&gitlinks, names.as_deref())? {
        // Deepest first, so a nested submodule's files name its own git data.
        let mut stores: Vec<&(String, PathBuf)> = found.stores.iter().collect();
        stores.sort_by_key(|(folder, _)| std::cmp::Reverse(folder.len()));
        for (path, blob) in &found.files {
            files.push(TreeFile {
                path: path.clone(),
                blob: blob.clone(),
                store: store_of(path, &stores),
            });
        }
    }
    Ok(files)
}

/// Hands each distinct blob's bytes to `on_blob` once, as it arrives, each read from the git data that holds it; a blob
/// the git data does not hold (a partial clone's) is never asked for, so nothing is fetched, and arrives as none, as
/// does one held nowhere.
pub fn read_blobs(dir: &Path, files: &[TreeFile], on_blob: &mut dyn FnMut(&str, Option<&[u8]>)) -> Result<()> {
    // The repository's own blobs first, then each submodule's git data's, in the order they come; none are asked of
    // no store.
    let mut stores: Vec<(Option<&PathBuf>, Vec<String>, HashSet<&str>)> = vec![(None, Vec::new(), HashSet::new())];
    let mut all: Vec<&str> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    for file in files {
        if seen.insert(&file.blob) {
            all.push(&file.blob);
        }
        let at = match &file.store {
            Store::Nowhere => continue,
            Store::Repository => None,
            Store::GitData(data) => Some(data),
        };
        let index = stores.iter().position(|(s, _, _)| *s == at).unwrap_or_else(|| {
            stores.push((at, Vec::new(), HashSet::new()));
            stores.len() - 1
        });
        let (_, blobs, held) = &mut stores[index];
        if held.insert(&file.blob) {
            blobs.push(file.blob.clone());
        }
    }
    let mut answered: HashSet<String> = HashSet::new();
    for (at, blobs, _) in stores {
        let mut reader = at.map_or_else(|| BlobReader::new(dir), |data| BlobReader::on_git_data(data));
        let wanted: Vec<String> = blobs.into_iter().filter(|b| !answered.contains(b)).collect();
        reader.read_bytes(&wanted, &mut |blob, bytes| {
            if let Some(bytes) = bytes
                && answered.insert(blob.to_owned())
            {
                on_blob(blob, Some(bytes));
            }
        })?;
    }
    // What no store held arrives as none.
    for blob in all {
        if answered.insert(blob.to_owned()) {
            on_blob(blob, None);
        }
    }
    Ok(())
}
