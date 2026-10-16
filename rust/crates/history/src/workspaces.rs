//! Follows the root workspace manifests and the folders holding files, and resolves the declared members per commit.
use std::collections::HashMap;
use std::sync::Arc;

use citymap_ground_plan::Result;
use citymap_ground_plan::fixed::compare_keys;
use citymap_ground_plan::snapshot::folder_of;

use crate::manifests::{Patterns, is_manifest, patterns_of, resolve_workspaces};
use crate::read::HistoryEvent;

/// Blob texts by blob id; none for a blob the repository does not hold.
pub type Texts = HashMap<String, Option<String>>;

#[derive(Default)]
pub struct Workspaces {
    /// Root manifests changed since the last snapshot: the new blob, or none when the manifest went.
    pending: HashMap<String, Option<String>>,
    /// Each root manifest's blobs since it was last added, oldest first.
    chains: HashMap<String, Vec<String>>,
    /// The patterns of each root manifest read so far (none: it declares none).
    known: HashMap<String, Option<Patterns>>,
    /// Folders other than the root holding files, and how many files are beneath each.
    holding: HashMap<String, usize>,
    folders_changed: bool,
    current: Option<Arc<Vec<String>>>,
}

/// One changed path of a commit, as `wanted` reads it.
pub struct Change<'a> {
    pub path: &'a str,
    pub blob: &'a str,
    pub deleted: bool,
}

impl Workspaces {
    /// Notes a changed path: a root manifest's new blob, or none when it was deleted.
    pub fn touch(&mut self, path: &str, blob: Option<&str>) {
        if is_manifest(path) {
            self.pending.insert(path.to_owned(), blob.map(str::to_owned));
            match blob {
                None => {
                    self.chains.remove(path);
                }
                Some(blob) => self.chains.entry(path.to_owned()).or_default().push(blob.to_owned()),
            }
        }
    }

    /// Counts a file that arrived at `path`.
    pub fn add(&mut self, path: &str) {
        let mut folder = folder_of(path);
        while !folder.is_empty() {
            let count = self.holding.entry(folder.to_owned()).or_insert(0);
            if *count == 0 {
                self.folders_changed = true;
            }
            *count += 1;
            folder = folder_of(folder);
        }
    }

    /// Uncounts a file that left `path`.
    pub fn remove(&mut self, path: &str) {
        let mut folder = folder_of(path);
        while !folder.is_empty() {
            let count = self.holding.get_mut(folder).expect("a counted folder");
            *count -= 1;
            if *count == 0 {
                self.holding.remove(folder);
                self.folders_changed = true;
            }
            folder = folder_of(folder);
        }
    }

    /// The manifest blobs `resolve` will read at a commit that changes these paths.
    #[must_use]
    pub fn wanted(&self, changes: &[Change]) -> Vec<String> {
        let mut pending = self.pending.clone();
        for change in changes {
            if is_manifest(change.path) {
                pending.insert(
                    change.path.to_owned(),
                    (!change.deleted).then(|| change.blob.to_owned()),
                );
            }
        }
        pending.into_values().flatten().collect()
    }

    /// The declared members at commit `index`, from the manifests changed since the last call; none: none declared. A
    /// manifest whose blob cannot be read is known by its newest blob the repository holds since it was last added
    /// (`read_more` reads them), so what a read knows depends on the history alone, never on the commit it began at.
    pub fn resolve(
        &mut self,
        texts: &Texts,
        index: i64,
        on_event: &mut dyn FnMut(HistoryEvent),
        read_more: &mut dyn FnMut(&[String]) -> Result<Texts>,
    ) -> Result<Option<Arc<Vec<String>>>> {
        let mut changed = false;
        let mut pending: Vec<(String, Option<String>)> = self.pending.drain().collect();
        pending.sort_by(|a, b| compare_keys(&a.0, &b.0));
        for (path, blob) in pending {
            changed = true;
            let Some(blob) = blob else {
                self.known.remove(&path);
                continue;
            };
            let mut text = texts.get(&blob).cloned().flatten();
            if text.is_none() {
                on_event(HistoryEvent::ManifestUnavailable {
                    path: path.clone(),
                    index,
                });
                let chain = self.chains.get(&path).map_or(&[][..], Vec::as_slice);
                let older: Vec<String> = chain[..chain.len().saturating_sub(1)].iter().rev().cloned().collect();
                let more = read_more(&older)?;
                text = older.iter().find_map(|b| more.get(b).cloned().flatten());
            }
            match text {
                Some(text) => {
                    let patterns = patterns_of(&path, &text);
                    self.known.insert(path, patterns);
                }
                None => {
                    self.known.remove(&path);
                }
            }
        }
        let patterns: Vec<Patterns> = self.known.values().flatten().cloned().collect();
        if patterns.is_empty() {
            self.current = None;
        } else if changed || self.folders_changed {
            // Patterns only change with `changed`, so otherwise the members stand until the folders holding files change.
            self.current = Some(Arc::new(resolve_workspaces(
                &patterns,
                self.holding.keys().map(String::as_str),
            )));
        }
        self.folders_changed = false;
        Ok(self.current.clone())
    }
}
