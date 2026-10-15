//! The citymap ground plan engine: tree snapshots in, plat and city model out. Pure, deterministic, integer core; the
//! Rust implementation of `packages/ground-plan`, byte for byte.
pub mod archetype;
pub mod city;
pub mod constants;
pub mod error;
pub mod fixed;
pub mod json;
pub mod land_use;
pub mod lock;
pub mod plat;
pub mod roads;
pub mod snapshot;
pub mod tree;
pub mod workspace;

#[cfg(test)]
mod testing;

pub use error::{CitymapError, ErrorCode, Result};
