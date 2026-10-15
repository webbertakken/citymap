//! Integer directions and angles from the committed quarter-wave table.
use super::arithmetic::{isqrt, round_div};
use super::directions::COSINE;

/// Length of a direction vector.
pub const DIRECTION: i64 = 4096;
/// Angle steps per full turn.
pub const TURN: i64 = 4096;
const QUARTER: i64 = TURN / 4;

/// An integer direction (or any integer vector).
pub type Dir = [i64; 2];

fn at(i: i64) -> i64 {
    COSINE[usize::try_from(i).expect("a table index is in range")]
}

/// The direction at angle step a (taken modulo a turn), scaled to `DIRECTION`, from the committed table.
#[must_use]
pub fn dir(a: i64) -> Dir {
    let step = a.rem_euclid(TURN);
    let q = step / QUARTER;
    let r = step - q * QUARTER;
    let c = at(r);
    let s = at(QUARTER - r);
    match q {
        0 => [c, s],
        1 => [-s, c],
        2 => [-c, -s],
        _ => [s, -c],
    }
}

/// The direction of an integer vector, scaled to `DIRECTION` (`fixed/zero-direction` for the zero vector).
#[must_use]
pub fn normalise(x: i64, y: i64) -> Dir {
    assert!(
        x != 0 || y != 0,
        "fixed/zero-direction: cannot normalise the zero vector"
    );
    // Scale the vector by 2^k so its length has at least 25 significant bits, keeping every product safe.
    let squared = x * x + y * y;
    let mut k = 0;
    while squared << (2 * (k + 1)) < 1 << 52 {
        k += 1;
    }
    let length = isqrt(squared << (2 * k));
    [
        round_div((x * DIRECTION) << k, length),
        round_div((y * DIRECTION) << k, length),
    ]
}

/// A quarter turn anticlockwise.
#[must_use]
pub const fn perp([x, y]: Dir) -> Dir {
    [-y, x]
}

/// The opposite direction.
#[must_use]
pub const fn negate([x, y]: Dir) -> Dir {
    [-x, -y]
}

/// A vector rotated by angle step a.
#[must_use]
pub fn rotate([x, y]: Dir, a: i64) -> Dir {
    let [c, s] = dir(a);
    [round_div(x * c - y * s, DIRECTION), round_div(x * s + y * c, DIRECTION)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixed::hash::fnv1a;

    #[test]
    fn the_table_is_the_committed_quarter_wave() {
        assert_eq!(COSINE.len(), 1025);
        assert_eq!(COSINE[0], DIRECTION);
        assert_eq!(COSINE[1024], 0);
        let text = COSINE.iter().map(ToString::to_string).collect::<Vec<_>>().join(",");
        assert_eq!(fnv1a(&text), 0x2f6d_907a);
        assert!(COSINE.windows(2).all(|w| w[1] <= w[0]));
    }

    #[test]
    fn points_along_the_axes_at_the_quarter_turns() {
        assert_eq!(dir(0), [4096, 0]);
        assert_eq!(dir(1024), [0, 4096]);
        assert_eq!(dir(2048), [-4096, 0]);
        assert_eq!(dir(3072), [0, -4096]);
    }

    #[test]
    fn wraps_modulo_a_turn_negatives_included() {
        assert_eq!(dir(TURN + 5), dir(5));
        assert_eq!(dir(-1), dir(TURN - 1));
    }

    #[test]
    fn keeps_every_direction_within_rounding_of_the_unit_circle() {
        for a in 0..TURN {
            let [x, y] = dir(a);
            assert!((x * x + y * y - DIRECTION * DIRECTION).abs() <= 2 * DIRECTION + 2);
        }
    }

    #[test]
    fn normalises_vectors_to_the_direction_length() {
        assert_eq!(normalise(3, 0), [4096, 0]);
        assert_eq!(normalise(0, -7), [0, -4096]);
        assert_eq!(normalise(1, 1), [2896, 2896]);
        assert_eq!(normalise(-(1 << 21), 1 << 21), [-2896, 2896]);
    }

    #[test]
    #[should_panic(expected = "fixed/zero-direction")]
    fn rejects_the_zero_vector() {
        let _ = normalise(0, 0);
    }

    #[test]
    fn turns_by_quarter_turns_and_angle_steps() {
        assert_eq!(perp([3, 4]), [-4, 3]);
        assert_eq!(negate([3, -4]), [-3, 4]);
        assert_eq!(rotate([4096, 0], 1024), [0, 4096]);
        assert_eq!(rotate([4096, 0], 512), dir(512));
    }
}
