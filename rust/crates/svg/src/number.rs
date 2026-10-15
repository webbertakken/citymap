//! JavaScript's number formatting, exactly: `toFixed` and `String` of the numbers the renderer writes.

/// `v.toFixed(digits)`: the exact value of the double, rounded to `digits` decimals with ties toward the larger
/// magnitude, and a `-` only for a negative value (so `-0` prints as `0.0`).
#[must_use]
pub fn to_fixed(v: f64, digits: u32) -> String {
    let negative = v < 0.0;
    let x = v.abs();
    assert!(x < 1e21, "toFixed of {v} would print in exponent form");
    let bits = x.to_bits();
    let exponent = i32::try_from((bits >> 52) & 0x7ff).expect("eleven bits");
    let fraction = bits & ((1 << 52) - 1);
    let (mantissa, shift) = if exponent == 0 {
        (fraction, -1074)
    } else {
        (fraction | (1 << 52), exponent - 1075)
    };
    let scale = 10u128.pow(digits);
    let n: u128 = if shift >= 0 {
        (u128::from(mantissa) * scale) << shift
    } else {
        let s = shift.unsigned_abs();
        if s > 120 {
            0
        } else {
            (u128::from(mantissa) * scale + (1u128 << (s - 1))) >> s
        }
    };
    let text = format!("{n:0width$}", width = usize::try_from(digits).expect("few digits") + 1);
    let (whole, decimals) = text.split_at(text.len() - usize::try_from(digits).expect("few digits"));
    let sign = if negative { "-" } else { "" };
    if digits == 0 {
        format!("{sign}{whole}")
    } else {
        format!("{sign}{whole}.{decimals}")
    }
}

/// `String(v)` for the plain numbers the renderer writes: integers without a point, others in their shortest form.
#[must_use]
pub fn js_number(v: f64) -> String {
    format!("{v}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounds_ties_away_from_zero_on_the_exact_value() {
        assert_eq!(to_fixed(0.25, 1), "0.3");
        assert_eq!(to_fixed(0.35, 1), "0.3");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(2.5, 0), "3");
        assert_eq!(to_fixed(-2.5, 0), "-3");
        assert_eq!(to_fixed(-0.04, 1), "-0.0");
        assert_eq!(to_fixed(-0.0, 1), "0.0");
        assert_eq!(to_fixed(1234.5678, 2), "1234.57");
        assert_eq!(to_fixed(1e-300, 2), "0.00");
        assert_eq!(js_number(1.5), "1.5");
        assert_eq!(js_number(3.0), "3");
        assert_eq!(js_number(0.0), "0");
    }
}
