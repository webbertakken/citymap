//! The fixed-point core: integers only, every rounding named.
pub mod arithmetic;
pub mod direction;
pub mod directions;
pub mod hash;
pub mod polygon;
pub mod warp;

pub use arithmetic::{MAX_SAFE, Rounding, floor_div, isqrt, isqrt_of_number, mul_div, round_div};
pub use direction::{DIRECTION, Dir, TURN, dir, negate, normalise, perp, rotate};
pub use hash::{compare_keys, fnv1a, seed_of, unit_mille};
pub use polygon::{Poly, Pt, area2, centroid, chord, clip, extent, inset, longest_edge, offset_for, reach, side};
pub use warp::{MemoWarp, Octave, Warp, densify, lattice, noise};

/// Fixed units per u, one local street width.
pub const UNIT: i64 = 64;
