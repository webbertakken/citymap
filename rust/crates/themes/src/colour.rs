//! Colours as the TypeScript themes compute them: the same floating-point operations in the same order.
use std::fmt::Write as _;

/// An sRGB hex colour from OKLCH (lightness 0 to 1, chroma, hue in degrees), clipped to the gamut.
#[must_use]
pub fn oklch(l: f64, c: f64, hue: f64) -> String {
    let h = (hue * std::f64::consts::PI) / 180.0;
    let a = c * h.cos();
    let b = c * h.sin();
    let lc = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powf(3.0);
    let mc = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powf(3.0);
    let sc = (l - 0.089_484_177_5 * a - 1.291_485_548 * b).powf(3.0);
    let linear = [
        4.076_741_662_1 * lc - 3.307_711_591_3 * mc + 0.230_969_929_2 * sc,
        -1.268_438_004_6 * lc + 2.609_757_401_1 * mc - 0.341_319_396_5 * sc,
        -0.004_196_086_3 * lc - 0.703_418_614_7 * mc + 1.707_614_701 * sc,
    ];
    let mut out = String::from("#");
    for x in linear {
        let v = if x <= 0.003_130_8 {
            12.92 * x
        } else {
            1.055 * x.max(0.0).powf(1.0 / 2.4) - 0.055
        };
        let _ = write!(out, "{:02x}", channel(v.clamp(0.0, 1.0) * 255.0));
    }
    out
}

/// `Math.round` of a channel in [0, 255].
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn channel(v: f64) -> u8 {
    v.round() as u8
}

fn channels(c: &str) -> [f64; 3] {
    let at = |i: usize| f64::from(u8::from_str_radix(&c[i..i + 2], 16).expect("a hex colour"));
    [at(1), at(3), at(5)]
}

/// A blend of two hex colours: t = 0 is a, t = 1 is b.
#[must_use]
pub fn mix(a: &str, b: &str, t: f64) -> String {
    let [ar, ag, ab] = channels(a);
    let [br, bg, bb] = channels(b);
    let blend = |x: f64, y: f64| format!("{:02x}", channel(x * (1.0 - t) + y * t));
    format!("#{}{}{}", blend(ar, br), blend(ag, bg), blend(ab, bb))
}

/// The sRGB channel's linear value, as WCAG defines it.
fn linear(v: f64) -> f64 {
    let s = v / 255.0;
    if s <= 0.039_28 {
        s / 12.92
    } else {
        ((s + 0.055) / 1.055).powf(2.4)
    }
}

/// WCAG relative luminance of a hex colour.
fn luminance(c: &str) -> f64 {
    let [r, g, b] = channels(c);
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/// WCAG contrast ratio of two hex colours.
#[must_use]
pub fn contrast(a: &str, b: &str) -> f64 {
    let (x, y) = (luminance(a), luminance(b));
    (x.max(y) + 0.05) / (x.min(y) + 0.05)
}
