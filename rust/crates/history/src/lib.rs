//! Reads a git repository into tree snapshots: first-parent history, exact renames by blob, and the root workspace
//! manifests. The Rust implementation of `packages/history`.
pub mod ancestry;
pub mod blobs;
pub mod contents;
pub mod env;
pub mod file_history;
pub mod mailmap;
pub mod manifests;
pub mod read;
pub mod schedule;
pub mod tree;
pub mod workspaces;

pub use ancestry::{count_commits, is_ancestor, resolve_commit};
pub use contents::{TreeFile, list_tree, read_blobs};
pub use file_history::{FileFacts, FileHistory};
pub use mailmap::{Author, Mailmap, MailmapStatus, read_mailmap};
pub use read::{History, HistoryEvent, HistoryItem, ReadOptions, read_history};
pub use schedule::{EVERY_COMMIT, FOLD_STRIDES, FoldSchedule, Strides, fold_schedule, is_laid, laid_count};
pub use tree::read_tree;
