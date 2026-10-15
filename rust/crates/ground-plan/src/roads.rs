//! Road classes by the tier of the land a road divides: what a cut is laid as, how it follows its land, and the land a
//! folder must budget for its own roads.
use crate::constants::{GROWTH_PCT, RoadClass, TIER_BAND_PCT, TIER_MASS_MILLE};
use crate::fixed::floor_div;

/// Road classes by tier (hamlet, village, town, city): a folder's first cut, and its others one class lower.
const FIRST_CLASS: [RoadClass; 4] = [
    RoadClass::Street,
    RoadClass::Collector,
    RoadClass::Avenue,
    RoadClass::Boulevard,
];
const OTHER_CLASS: [RoadClass; 4] = [
    RoadClass::Street,
    RoadClass::Street,
    RoadClass::Collector,
    RoadClass::Avenue,
];

const fn classes(first: bool) -> &'static [RoadClass; 4] {
    if first { &FIRST_CLASS } else { &OTHER_CLASS }
}

/// Road class by the tier of the land being cut: a folder's first cut is one class above its others.
#[must_use]
pub fn cut_class(mass_mille: i64, first: bool) -> RoadClass {
    let tier = TIER_MASS_MILLE
        .iter()
        .filter(|&&threshold| mass_mille >= threshold)
        .count();
    classes(first)[tier]
}

/// A laid road's class as its land's mass moves: a tier up past its threshold × the band, down below it ÷ the band.
#[must_use]
pub fn reclass(cls: RoadClass, mass_mille: i64, first: bool) -> RoadClass {
    let classes = classes(first);
    let Some(mut tier) = classes.iter().position(|&c| c == cls) else {
        return cls;
    };
    while tier < 3 && mass_mille * 100 >= TIER_MASS_MILLE[tier] * TIER_BAND_PCT {
        tier += 1;
    }
    while tier > 0 && mass_mille * TIER_BAND_PCT < TIER_MASS_MILLE[tier - 1] * 100 {
        tier -= 1;
    }
    classes[tier]
}

/// The class a cut's land is laid at: room for the land at the top of its band, so a reclass takes no lots.
#[must_use]
pub fn reserve_for(mass_mille: i64, first: bool) -> RoadClass {
    cut_class(floor_div(mass_mille * GROWTH_PCT, 100), first)
}

/// The width a folder's first cut can take beyond a street, in fixed units: the land its own roads need above the
/// street margin every lot already carries. A folder with one item has no cut, and needs none.
#[must_use]
pub fn road_excess(mass_mille: i64, items: usize) -> i64 {
    if items < 2 {
        0
    } else {
        reserve_for(mass_mille, true).width() - RoadClass::Street.width()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classes_a_cut_by_the_tier_of_its_land() {
        assert_eq!(cut_class(0, true), RoadClass::Street);
        assert_eq!(cut_class(30_000, true), RoadClass::Collector);
        assert_eq!(cut_class(30_000, false), RoadClass::Street);
        assert_eq!(cut_class(300_000, false), RoadClass::Collector);
        assert_eq!(cut_class(3_000_000, true), RoadClass::Boulevard);
    }

    #[test]
    fn reclasses_within_the_band() {
        assert_eq!(reclass(RoadClass::Street, 30_000, true), RoadClass::Street);
        assert_eq!(reclass(RoadClass::Street, 37_500, true), RoadClass::Collector);
        assert_eq!(reclass(RoadClass::Collector, 24_000, true), RoadClass::Collector);
        assert_eq!(reclass(RoadClass::Collector, 23_999, true), RoadClass::Street);
        assert_eq!(reclass(RoadClass::Street, 4_000_000, false), RoadClass::Avenue);
    }

    #[test]
    fn reserves_the_class_at_the_top_of_the_band() {
        assert_eq!(reserve_for(22_000, true), RoadClass::Street);
        assert_eq!(reserve_for(22_222, true), RoadClass::Street);
        assert_eq!(reserve_for(22_223, true), RoadClass::Collector);
        assert_eq!(road_excess(22_223, 1), 0);
        assert_eq!(road_excess(22_223, 2), 32);
    }
}
