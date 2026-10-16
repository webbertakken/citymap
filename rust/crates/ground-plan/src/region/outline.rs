//! A town's outline: an irregular convex octagon of its land.
use crate::fixed::{Pt, Rounding, area2, dir, isqrt_of_number, mul_div, round_div, unit_mille};

/// Each outline vertex's radius varies by up to this share (‰) either way.
const JITTER: i64 = 60;

/// An irregular convex octagon of the given doubled area about a centre, seeded by the town's key.
#[must_use]
pub fn outline_for(target_area2: i64, centre: Pt, key: &str) -> Vec<Pt> {
    assert!(
        target_area2 >= 0,
        "engine/invariant: outline land {target_area2} is not a non-negative integer"
    );
    let base: Vec<Pt> = (0..8)
        .map(|k| {
            let radius = 1000 + round_div((unit_mille(&format!("{key}#r{k}")) - 500) * JITTER * 2, 1000);
            let [x, y] = dir(k * 512 + 256);
            Pt::new(x * radius, y * radius)
        })
        .collect();
    // Scale by √(target / base area), held in 1/2^24 steps.
    let scale = isqrt_of_number((i128::from(target_area2) << 48) / i128::from(area2(&base)));
    base.iter()
        .map(|p| {
            Pt::new(
                centre.x + mul_div(p.x, scale, 1 << 24, Rounding::Round),
                centre.y + mul_div(p.y, scale, 1 << 24, Rounding::Round),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lays_an_octagon_of_the_given_land_about_its_centre() {
        let outline = outline_for(2_000_000_000, Pt::new(100, -50), "demo");
        assert_eq!(outline.len(), 8);
        assert!((area2(&outline) - 2_000_000_000).abs() < 2_000_000);
    }

    #[test]
    fn is_the_same_for_the_same_key_and_differs_between_keys() {
        assert_eq!(
            outline_for(10_000_000, Pt::new(0, 0), "a"),
            outline_for(10_000_000, Pt::new(0, 0), "a")
        );
        assert_ne!(
            outline_for(10_000_000, Pt::new(0, 0), "a"),
            outline_for(10_000_000, Pt::new(0, 0), "b")
        );
    }

    #[test]
    #[should_panic(expected = "engine/invariant")]
    fn rejects_negative_land() {
        let _ = outline_for(-4, Pt::new(0, 0), "a");
    }
}
