//! Draws a city model as SVG, per theme: the Rust implementation of `packages/svg`.
pub mod number;
pub mod render;

pub use render::{Camera, RenderOptions, escape_text, render_city};
