//! Reads a git repository into tree snapshots: first-parent history, exact renames by blob, and the root workspace
//! manifests. The Rust implementation of `packages/history`.
pub mod ancestry;
pub mod blobs;
pub mod env;
pub mod gitmodules;
pub mod manifests;
pub mod read;
pub mod schedule;
pub mod submodules;
pub mod tree;
pub mod workspaces;

pub use ancestry::{count_commits, is_ancestor, resolve_commit};
pub use read::{History, HistoryEvent, HistoryItem, ReadOptions, read_history};
pub use schedule::{EVERY_COMMIT, FOLD_STRIDES, FoldSchedule, Strides, fold_schedule, is_laid, laid_count};
pub use tree::read_tree;
