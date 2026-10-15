//! Reads a git repository into tree snapshots: first-parent history, exact renames by blob, and the root workspace
//! manifests. The Rust implementation of `packages/history`.
pub mod ancestry;
pub mod blobs;
pub mod env;
pub mod manifests;
pub mod read;
pub mod tree;
pub mod workspaces;

pub use ancestry::{is_ancestor, resolve_commit};
pub use read::{History, HistoryEvent, HistoryItem, ReadOptions, read_history};
pub use tree::read_tree;
