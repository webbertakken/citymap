//! The citymap ground plan engine: tree snapshots in, plat and city model out. Pure, deterministic, integer core; the
//! Rust implementation of `packages/ground-plan`, byte for byte.
pub mod error;
pub mod fixed;

pub use error::{CitymapError, ErrorCode, Result};
