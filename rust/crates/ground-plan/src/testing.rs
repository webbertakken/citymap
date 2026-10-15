//! Test fixtures: synthetic repositories as snapshots and trees.
use std::collections::HashMap;
use std::sync::Arc;

use crate::fixed::{Poly, Pt, compare_keys};
use crate::land_use::{classify_land_use, default_land_uses};
use crate::snapshot::{FileEntry, Snapshot};
use crate::tree::{Shares, TreeNode, TreeOptions, build_tree};

/// n files in a folder, born at increasing indices from `born`.
pub fn files(folder: &str, n: usize, born: i64, ext: &str, stem: &str) -> Vec<FileEntry> {
    (0..n)
        .map(|i| {
            let prefix = if folder.is_empty() {
                String::new()
            } else {
                format!("{folder}/")
            };
            let path = format!("{prefix}{stem}{i:04}.{ext}");
            let first_seen = born + i64::try_from(i).expect("small");
            FileEntry::new(&path, &format!("{path}@{first_seen}"), first_seen)
        })
        .collect()
}

/// n source files in a folder, born at increasing indices from `born`.
pub fn sources(folder: &str, n: usize, born: i64) -> Vec<FileEntry> {
    files(folder, n, born, "ts", "f")
}

pub fn snapshot_with(entries: &[FileEntry], folders: &[(&str, i64)], repository: &str) -> Snapshot {
    let mut sorted = entries.to_vec();
    sorted.sort_by(|a, b| compare_keys(&a.path, &b.path));
    Snapshot {
        repository: repository.to_owned(),
        commit: "worktree".to_owned(),
        index: 0,
        files: Arc::new(sorted),
        folder_first_seen: Arc::new(
            folders
                .iter()
                .map(|&(f, i)| (f.to_owned(), i))
                .collect::<HashMap<_, _>>(),
        ),
        workspaces: None,
    }
}

pub fn snapshot_of(entries: &[FileEntry]) -> Snapshot {
    snapshot_with(entries, &[], "demo")
}

pub fn tree_with(entries: &[FileEntry], folders: &[(&str, i64)], shares: &Shares) -> TreeNode {
    let snapshot = snapshot_with(entries, folders, "demo");
    let options = TreeOptions {
        root: String::new(),
        exclude: vec![],
        land_uses: default_land_uses(),
        density_pct: 50,
    };
    build_tree(&snapshot, &snapshot.files, &options, shares, &|_, f| {
        classify_land_use(&f.path)
    })
    .tree
}

pub fn tree_of(entries: &[FileEntry]) -> TreeNode {
    tree_with(entries, &[], &Shares::new())
}

/// An axis-aligned rectangle as a polygon.
#[allow(dead_code)]
pub fn rect(w: i64, h: i64) -> Poly {
    Poly::uniform(&[Pt::new(0, 0), Pt::new(w, 0), Pt::new(w, h), Pt::new(0, h)], 0)
}
