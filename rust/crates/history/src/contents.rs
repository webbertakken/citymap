//! The files of one commit and their contents, read without fetching: what the CLI counts a city's measures from.
use std::path::Path;

use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::blobs::BlobReader;
use crate::env::git_command;

const SUBMODULE: &str = "160000";

/// A file of a commit's tree: its path and its blob.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeFile {
    pub path: String,
    pub blob: String,
}

/// Every file of the tree at `commit`, submodules left out, in git's order.
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
    Ok(out
        .stdout
        .split(|&b| b == 0)
        .filter_map(|entry| {
            // "<mode> <type> <hash>\t<path>"
            let entry = String::from_utf8_lossy(entry);
            let (meta, path) = entry.split_once('\t')?;
            let mut fields = meta.split(' ');
            let (mode, blob) = (fields.next().unwrap_or(""), fields.nth(1).unwrap_or(""));
            (mode != SUBMODULE).then(|| TreeFile {
                path: path.to_owned(),
                blob: blob.to_owned(),
            })
        })
        .collect())
}

/// Hands each distinct blob's bytes to `on_blob` once, as it arrives; a blob the repository does not hold (a partial
/// clone's) is never asked for, so nothing is fetched, and arrives as none.
pub fn read_blobs(dir: &Path, blobs: &[String], on_blob: &mut dyn FnMut(&str, Option<&[u8]>)) -> Result<()> {
    let mut distinct: Vec<String> = Vec::with_capacity(blobs.len());
    let mut seen = std::collections::HashSet::new();
    for blob in blobs {
        if seen.insert(blob.as_str()) {
            distinct.push(blob.clone());
        }
    }
    BlobReader::new(dir).read_bytes(&distinct, on_blob)
}
