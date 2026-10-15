//! Value noise, a smooth topology-preserving warp and densifying, in fixed point.
use rustc_hash::FxHashMap;

use super::arithmetic::{floor_div, isqrt, round_div};
use super::polygon::Pt;

const ONE: i64 = 65536;

/// A seeded 32-bit hash of a lattice point, as an integer in [−32768, 32767].
#[must_use]
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn lattice(seed: u32, i: i64, j: i64) -> i64 {
    // `Math.imul` takes its operands modulo 2^32: the low 32 bits.
    let mut h = (i as u32).wrapping_mul(0x27d4_eb2d) ^ (j as u32).wrapping_mul(0x1656_67b1) ^ seed;
    h = (h ^ (h >> 15)).wrapping_mul(0x85eb_ca6b);
    h = (h ^ (h >> 13)).wrapping_mul(0xc2b2_ae35);
    i64::from((h ^ (h >> 16)) >> 16) - 32768
}

/// The quintic fade t³(t(6t − 15) + 10) for t in [0, ONE), in 1/ONE steps.
fn fade(t: i64) -> i64 {
    let inner = floor_div(t * (6 * t - 15 * ONE), ONE) + 10 * ONE;
    let cube = floor_div(floor_div(t * t, ONE) * t, ONE);
    floor_div(cube * inner, ONE)
}

/// Smooth value noise at (x, y) / wavelength, in [−32768, 32767].
#[must_use]
pub fn noise(seed: u32, x: i64, y: i64, wavelength: i64) -> i64 {
    let fx = floor_div(x * ONE, wavelength);
    let fy = floor_div(y * ONE, wavelength);
    let i = floor_div(fx, ONE);
    let j = floor_div(fy, ONE);
    let u = fade(fx - i * ONE);
    let v = fade(fy - j * ONE);
    let a = lattice(seed, i, j);
    let b = lattice(seed, i + 1, j);
    let c = lattice(seed, i, j + 1);
    let d = lattice(seed, i + 1, j + 1);
    a + floor_div((b - a) * u, ONE)
        + floor_div((c - a) * v, ONE)
        + floor_div(floor_div(u * v, ONE) * (a - b - c + d), ONE)
}

/// One warp octave: the largest displacement and the wavelength, both in fixed units.
pub type Octave = (i64, i64);

/// A smooth, topology-preserving domain warp: value noise per axis and octave.
#[derive(Clone, Debug)]
pub struct Warp {
    seed: u32,
    octaves: Vec<Octave>,
}

impl Warp {
    /// A warp, refusing octaves whose amplitude could fold space (`fixed/warp-folds`).
    #[must_use]
    pub fn new(seed: u32, octaves: Vec<Octave>) -> Self {
        for &(amplitude, wavelength) in &octaves {
            assert!(
                amplitude * 5 < wavelength,
                "fixed/warp-folds: amplitude {amplitude} could fold wavelength {wavelength}"
            );
        }
        Self { seed, octaves }
    }

    /// The warped point.
    #[must_use]
    pub fn apply(&self, q: Pt) -> Pt {
        let (mut dx, mut dy) = (0, 0);
        for (i, &(amplitude, wavelength)) in (1u32..).zip(&self.octaves) {
            let sx = self.seed ^ 0x9e37_79b9u32.wrapping_mul(i);
            let sy = self.seed ^ 0x7f4a_7c15u32.wrapping_mul(i);
            dx += round_div(noise(sx, q.x, q.y, wavelength) * amplitude, 32768);
            dy += round_div(noise(sy, q.x, q.y, wavelength) * amplitude, 32768);
        }
        Pt::new(q.x + dx, q.y + dy)
    }
}

/// A warp that remembers its results: exact, as warps are pure; the memory clears once it holds `limit` points.
#[derive(Debug)]
pub struct MemoWarp {
    warp: Warp,
    limit: usize,
    seen: FxHashMap<Pt, Pt>,
}

impl MemoWarp {
    #[must_use]
    pub fn new(warp: Warp, limit: usize) -> Self {
        Self {
            warp,
            limit,
            seen: FxHashMap::default(),
        }
    }

    pub fn apply(&mut self, q: Pt) -> Pt {
        if let Some(&hit) = self.seen.get(&q) {
            return hit;
        }
        if self.seen.len() >= self.limit {
            self.seen.clear();
        }
        let out = self.warp.apply(q);
        self.seen.insert(q, out);
        out
    }
}

/// Inserts points so no segment is longer than step; a closed ring does not repeat its first point.
#[must_use]
pub fn densify(pts: &[Pt], step: i64, closed: bool) -> Vec<Pt> {
    let mut out = Vec::new();
    let segments = if closed { pts.len() } else { pts.len().saturating_sub(1) };
    for i in 0..segments {
        let a = pts[i];
        let b = pts[(i + 1) % pts.len()];
        let (dx, dy) = (b.x - a.x, b.y - a.y);
        let length = isqrt(dx * dx + dy * dy);
        let parts = floor_div(length + step - 1, step).max(1);
        for k in 0..parts {
            out.push(Pt::new(a.x + round_div(dx * k, parts), a.y + round_div(dy * k, parts)));
        }
    }
    if !closed && let Some(&last) = pts.last() {
        out.push(last);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lattice_values_stay_in_sixteen_bits() {
        for i in -50..50 {
            let v = lattice(0xdead_beef, i, i * 7 - 3);
            assert!((-32768..32768).contains(&v));
        }
    }

    #[test]
    fn noise_matches_the_lattice_at_cell_corners() {
        assert_eq!(noise(7, 0, 0, 100), lattice(7, 0, 0));
        assert_eq!(noise(7, 300, -200, 100), lattice(7, 3, -2));
    }

    #[test]
    #[should_panic(expected = "fixed/warp-folds")]
    fn refuses_a_folding_octave() {
        let _ = Warp::new(1, vec![(20, 100)]);
    }

    #[test]
    fn densifies_open_and_closed_paths() {
        let pts = [Pt::new(0, 0), Pt::new(10, 0)];
        assert_eq!(
            densify(&pts, 4, false),
            vec![Pt::new(0, 0), Pt::new(3, 0), Pt::new(7, 0), Pt::new(10, 0)]
        );
        assert_eq!(densify(&pts, 20, true), vec![Pt::new(0, 0), Pt::new(10, 0)]);
    }

    #[test]
    fn a_memoised_warp_agrees_with_the_warp() {
        let warp = Warp::new(42, vec![(32, 1280)]);
        let mut memo = MemoWarp::new(warp.clone(), 2);
        for x in 0..5 {
            let q = Pt::new(x * 97, -x * 31);
            assert_eq!(memo.apply(q), warp.apply(q));
            assert_eq!(memo.apply(q), warp.apply(q));
        }
    }
}
