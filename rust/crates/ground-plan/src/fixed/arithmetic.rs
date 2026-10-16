//! Integer division with named rounding, exact products and square roots: the arithmetic every coordinate goes through.

/// The largest integer a JavaScript number holds exactly; the engine's values stay within it.
pub const MAX_SAFE: i64 = (1 << 53) - 1;

/// How a division rounds: toward negative infinity, or to nearest with halves toward positive infinity.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rounding {
    Floor,
    Round,
}

/// True for an integer a JavaScript number holds exactly.
#[must_use]
pub const fn is_safe(v: i64) -> bool {
    v.unsigned_abs() <= MAX_SAFE.unsigned_abs()
}

fn to_safe(v: i128) -> i64 {
    let n = i64::try_from(v).unwrap_or(i64::MAX);
    debug_assert!(is_safe(n), "fixed/overflow: result {v} is outside the safe range");
    n
}

/// ⌊a / b⌋ for a positive divisor (`fixed/bad-divisor` otherwise).
#[must_use]
#[inline]
pub fn floor_div(a: i64, b: i64) -> i64 {
    debug_assert!(b > 0, "fixed/bad-divisor: divisor {b} is not positive");
    a.div_euclid(b)
}

/// ⌊a / b⌋ for a positive divisor, on wide integers.
#[must_use]
#[inline]
pub fn floor_div_wide(a: i128, b: i128) -> i128 {
    debug_assert!(b > 0, "fixed/bad-divisor: divisor {b} is not positive");
    a.div_euclid(b)
}

/// a / b rounded to nearest, halves toward positive infinity: ⌊(2a + b) / 2b⌋.
#[must_use]
#[inline]
pub fn round_div(a: i64, b: i64) -> i64 {
    debug_assert!(b > 0, "fixed/bad-divisor: divisor {b} is not positive");
    to_safe(round_div_wide(i128::from(a), i128::from(b)))
}

/// a / b rounded to nearest, halves toward positive infinity, on wide integers.
#[must_use]
#[inline]
pub fn round_div_wide(a: i128, b: i128) -> i128 {
    (2 * a + b).div_euclid(2 * b)
}

/// a × b / c with the named rounding, exact for any safe integers.
#[must_use]
#[inline]
pub fn mul_div(a: i64, b: i64, c: i64, rounding: Rounding) -> i64 {
    debug_assert!(c > 0, "fixed/bad-divisor: divisor {c} is not positive");
    let p = i128::from(a) * i128::from(b);
    let d = i128::from(c);
    to_safe(match rounding {
        Rounding::Floor => p.div_euclid(d),
        Rounding::Round => round_div_wide(p, d),
    })
}

/// ⌊√n⌋ for a non-negative integer (`fixed/negative-sqrt` otherwise).
#[must_use]
#[inline]
pub fn isqrt(n: i64) -> i64 {
    assert!(n >= 0, "fixed/negative-sqrt: cannot take the square root of {n}");
    // ⌊√n⌋ of an i64 is below 2^32, so it fits.
    n.isqrt()
}

/// ⌊√v⌋ of the integer a JavaScript number holds: `isqrt(Number(big))` rounds the big integer to a double first.
#[must_use]
pub fn isqrt_of_number(big: i128) -> i64 {
    assert!(big >= 0, "fixed/negative-sqrt: cannot take the square root of {big}");
    #[allow(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss
    )]
    let rounded = big as f64 as u128;
    i64::try_from(rounded.isqrt()).unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn reference_floor(a: i64, b: i64) -> i64 {
        let (a, b) = (i128::from(a), i128::from(b));
        let q = a / b;
        i64::try_from(if a % b != 0 && a < 0 { q - 1 } else { q }).unwrap()
    }

    #[test]
    fn floor_div_rounds_toward_negative_infinity() {
        assert_eq!(floor_div(7, 2), 3);
        assert_eq!(floor_div(-7, 2), -4);
        assert_eq!(floor_div(-8, 2), -4);
        assert_eq!(floor_div(0, 5), 0);
    }

    #[test]
    fn round_div_rounds_halves_toward_positive_infinity() {
        assert_eq!(round_div(5, 2), 3);
        assert_eq!(round_div(-5, 2), -2);
        assert_eq!(round_div(7, 3), 2);
        assert_eq!(round_div(-7, 3), -2);
        assert_eq!(round_div(MAX_SAFE, 1), MAX_SAFE);
    }

    #[test]
    fn mul_div_is_exact_across_two_to_the_fifty_third() {
        assert_eq!(mul_div(1 << 40, 1 << 20, 1 << 10, Rounding::Floor), 1 << 50);
        assert_eq!(mul_div(3, 5, 2, Rounding::Round), 8);
        assert_eq!(mul_div(-3, 5, 2, Rounding::Round), -7);
        assert_eq!(mul_div(-3, 5, 2, Rounding::Floor), -8);
    }

    #[test]
    #[should_panic(expected = "fixed/negative-sqrt")]
    fn isqrt_rejects_a_negative() {
        let _ = isqrt(-1);
    }

    #[test]
    fn isqrt_of_number_rounds_to_a_double_first() {
        // 2^60 + 1 is not a double: it rounds to 2^60, whose root is exact.
        assert_eq!(isqrt_of_number((1 << 60) + 1), 1 << 30);
        assert_eq!(isqrt_of_number(99), 9);
    }

    proptest! {
        #[test]
        fn floor_and_round_agree_with_the_wide_reference(a in -MAX_SAFE / 4..MAX_SAFE / 4, b in 1i64..1 << 40) {
            prop_assert_eq!(floor_div(a, b), reference_floor(a, b));
            prop_assert_eq!(round_div(a, b), reference_floor(2 * a + b, 2 * b));
        }

        #[test]
        fn isqrt_brackets_the_root(n in 0i64..MAX_SAFE) {
            let r = i128::from(isqrt(n));
            prop_assert!(r * r <= i128::from(n) && i128::from(n) < (r + 1) * (r + 1));
        }

        #[test]
        fn mul_div_matches_the_wide_product(a in -(1i64 << 40)..1 << 40, b in -(1i64 << 30)..1 << 30, c in 1i64..1 << 30) {
            let p = i128::from(a) * i128::from(b);
            prop_assume!((p / i128::from(c)).unsigned_abs() < 1 << 52);
            prop_assert_eq!(i128::from(mul_div(a, b, c, Rounding::Floor)), p.div_euclid(i128::from(c)));
        }
    }
}
