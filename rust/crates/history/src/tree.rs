//! One commit's tree as a snapshot, every file born together: the single state of a repository, without its history.
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use citymap_ground_plan::fixed::compare_keys;
use citymap_ground_plan::snapshot::{FileEntry, MAX_PATH_BYTES, Snapshot, folder_of};
use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::blobs::BlobReader;
use crate::env::git_command;
use crate::manifests::{Patterns, is_manifest, patterns_of, resolve_workspaces};
use crate::read::{HistoryEvent, locate};

const SUBMODULE: &str = "160000";

/// The tree at `commit` as a snapshot at index 0: every file and folder born at once, members from its manifests.
pub fn read_tree(
    dir: &Path,
    commit: &str,
    repository: Option<&str>,
    on_event: &mut dyn FnMut(HistoryEvent),
) -> Result<Snapshot> {
    let (dir, repository) = locate(dir, repository);
    let out = git_command(&dir, &["-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit])
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
    let mut files: Vec<(String, String)> = Vec::new();
    for entry in out.stdout.split(|&b| b == 0).filter(|e| !e.is_empty()) {
        // "<mode> <type> <hash>\t<path>"
        let entry = String::from_utf8_lossy(entry);
        let (meta, path) = entry.split_once('\t').unwrap_or((&entry, &entry));
        let mut fields = meta.split(' ');
        let (mode, blob) = (fields.next().unwrap_or(""), fields.nth(1).unwrap_or(""));
        if mode == SUBMODULE {
            on_event(HistoryEvent::SkipSubmodule {
                path: path.to_owned(),
                index: 0,
            });
            continue;
        }
        if path.len() > MAX_PATH_BYTES {
            let start: String = path.chars().take(80).collect();
            return Err(CitymapError::new(
                ErrorCode::SnapshotBadPath,
                format!("a path is longer than {MAX_PATH_BYTES} bytes"),
            )
            .with("index", &0)
            .with("start", &start));
        }
        files.push((path.to_owned(), blob.to_owned()));
    }
    files.sort_by(|a, b| compare_keys(&a.0, &b.0));
    let mut folders: Vec<String> = vec![String::new()];
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::from([String::new()]);
    for (path, _) in &files {
        let mut f = folder_of(path);
        while !f.is_empty() {
            if seen.insert(f.to_owned()) {
                folders.push(f.to_owned());
            }
            f = folder_of(f);
        }
    }
    folders.sort_by(|a, b| compare_keys(a, b));
    // The root manifests' members, matched against the folders that hold files.
    let manifests: Vec<&(String, String)> = files.iter().filter(|(path, _)| is_manifest(path)).collect();
    let mut reader = BlobReader::new(&dir);
    let wanted: Vec<String> = manifests.iter().map(|(_, blob)| blob.clone()).collect();
    let texts = reader.read_all(&wanted)?;
    let mut patterns: Vec<Patterns> = Vec::new();
    for (path, blob) in &manifests {
        match texts.get(blob) {
            Some(Some(text)) => patterns.extend(patterns_of(path, text)),
            _ => on_event(HistoryEvent::ManifestUnavailable {
                path: path.clone(),
                index: 0,
            }),
        }
    }
    let workspaces = (!patterns.is_empty()).then(|| {
        Arc::new(resolve_workspaces(
            &patterns,
            folders.iter().filter(|f| !f.is_empty()).map(String::as_str),
        ))
    });
    Ok(Snapshot {
        repository,
        commit: commit.to_owned(),
        index: 0,
        files: Arc::new(
            files
                .iter()
                .map(|(path, _)| FileEntry::new(path, &format!("{path}@0"), 0))
                .collect(),
        ),
        folder_first_seen: Arc::new(folders.into_iter().map(|f| (f, 0)).collect::<HashMap<_, _>>()),
        workspaces,
    })
}
