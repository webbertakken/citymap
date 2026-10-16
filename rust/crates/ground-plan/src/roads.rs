//! Road classes by the tier of the land a road divides: what a cut is laid as, how it follows its land, and the land a
//! folder must budget for its own roads.
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::constants::{GROWTH_PCT, RoadClass, TIER_BAND_PCT, TIER_MASS_MILLE};
use crate::fixed::floor_div;

/// Road classes by tier (hamlet, village, town, city, metropolis): a folder's first cut, and its others.
const FIRST_CLASS: [RoadClass; 5] = [
    RoadClass::Street,
    RoadClass::Collector,
    RoadClass::Avenue,
    RoadClass::Boulevard,
    RoadClass::Boulevard,
];
const OTHER_CLASS: [RoadClass; 5] = [
    RoadClass::Street,
    RoadClass::Street,
    RoadClass::Collector,
    RoadClass::Avenue,
    RoadClass::Avenue,
];

/// A settlement tier by decade of mass.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Hamlet,
    Village,
    Town,
    City,
    Metropolis,
}

/// Every tier, smallest first.
pub const TIERS: [Tier; 5] = [Tier::Hamlet, Tier::Village, Tier::Town, Tier::City, Tier::Metropolis];

impl Tier {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Hamlet => "hamlet",
            Self::Village => "village",
            Self::Town => "town",
            Self::City => "city",
            Self::Metropolis => "metropolis",
        }
    }

    const fn index(self) -> usize {
        self as usize
    }
}

impl fmt::Display for Tier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The tier of a mass, without hysteresis: how many thresholds it reaches.
#[must_use]
pub fn cold_tier(mass_mille: i64) -> usize {
    TIER_MASS_MILLE
        .iter()
        .filter(|&&threshold| mass_mille >= threshold)
        .count()
}

/// A town's tier as its mass moves: up at a threshold × the band, down below a threshold ÷ the band.
#[must_use]
pub fn town_tier(mass_mille: i64, previous: Option<Tier>) -> Tier {
    let mut tier = previous.map_or_else(|| cold_tier(mass_mille), Tier::index);
    while tier < TIER_MASS_MILLE.len() && mass_mille * 100 >= TIER_MASS_MILLE[tier] * TIER_BAND_PCT {
        tier += 1;
    }
    while tier > 0 && mass_mille * TIER_BAND_PCT < TIER_MASS_MILLE[tier - 1] * 100 {
        tier -= 1;
    }
    TIERS[tier]
}

/// A town's tier as its roads read it: the tier now, and the tier at the top of its band (never lower).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TierRule {
    pub tier: usize,
    pub reach: usize,
}

#[must_use]
pub fn tier_rule(tier: Tier, root_mass_mille: i64) -> TierRule {
    TierRule {
        tier: tier.index(),
        reach: tier
            .index()
            .max(cold_tier(floor_div(root_mass_mille * GROWTH_PCT, 100))),
    }
}

/// A cut's class under the town's tier, when tiers are on: the town's first cut takes the tier's class, every other
/// cut the mass rule's capped one class below it.
#[must_use]
pub fn class_of(mass_mille: i64, first: bool, town_first: bool, rule: Option<TierRule>) -> RoadClass {
    let cold = cut_class(mass_mille, first);
    match rule {
        None => cold,
        Some(r) if town_first => FIRST_CLASS[r.tier],
        Some(r) => cold.min(OTHER_CLASS[r.tier]),
    }
}

/// A laid cut's class as its land's mass moves, under the town's tier when tiers are on.
#[must_use]
pub fn reclass_of(cls: RoadClass, mass_mille: i64, first: bool, town_first: bool, rule: Option<TierRule>) -> RoadClass {
    match rule {
        None => reclass(cls, mass_mille, first),
        Some(r) if town_first => FIRST_CLASS[r.tier],
        Some(r) => reclass(cls, mass_mille, first).min(OTHER_CLASS[r.tier]),
    }
}

/// A cut's right of way: the class the rule gives with the town and the land each at the top of its band.
#[must_use]
pub fn right_of_way_for(mass_mille: i64, first: bool, town_first: bool, rule: Option<TierRule>) -> RoadClass {
    let reserve = reserve_for(mass_mille, first);
    match rule {
        Some(r) if !town_first => reserve.min(OTHER_CLASS[r.reach]),
        _ => reserve,
    }
}

/// The class of a road other than a cut (a street village's high street) under the town's tier.
#[must_use]
pub fn capped_class(cls: RoadClass, rule: Option<TierRule>) -> RoadClass {
    rule.map_or(cls, |r| cls.min(OTHER_CLASS[r.tier]))
}

const fn classes(first: bool) -> &'static [RoadClass; 5] {
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
    while tier < TIER_MASS_MILLE.len() && mass_mille * 100 >= TIER_MASS_MILLE[tier] * TIER_BAND_PCT {
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

    const CITY: i64 = 3_000_000;
    const METROPOLIS: i64 = 30_000_000;

    #[test]
    fn tells_the_tier_by_decade_of_mass_metropolis_included() {
        let tiers: Vec<usize> = [0, 29_999, 30_000, 300_000, CITY, METROPOLIS]
            .into_iter()
            .map(cold_tier)
            .collect();
        assert_eq!(tiers, [0, 0, 1, 2, 3, 4]);
    }

    #[test]
    fn moves_a_town_up_at_a_threshold_times_1_25_and_down_below_a_threshold_over_1_25() {
        assert_eq!(town_tier(30_000, None), Tier::Village);
        assert_eq!(town_tier(37_499, Some(Tier::Hamlet)), Tier::Hamlet);
        assert_eq!(town_tier(37_500, Some(Tier::Hamlet)), Tier::Village);
        assert_eq!(town_tier(24_000, Some(Tier::Village)), Tier::Village);
        assert_eq!(town_tier(23_999, Some(Tier::Village)), Tier::Hamlet);
        assert_eq!(town_tier(METROPOLIS * 2, Some(Tier::Hamlet)), Tier::Metropolis);
        assert_eq!(town_tier(0, Some(Tier::Metropolis)), Tier::Hamlet);
        assert_eq!(Tier::Metropolis.to_string(), "metropolis");
    }

    #[test]
    fn reaches_the_tier_at_the_top_of_the_town_s_band() {
        assert_eq!(tier_rule(Tier::Town, 2_300_000), TierRule { tier: 2, reach: 3 });
        assert_eq!(tier_rule(Tier::City, 2_300_000), TierRule { tier: 3, reach: 3 });
    }

    #[test]
    fn lays_metropolis_roads_as_a_city_s() {
        assert_eq!(cut_class(METROPOLIS, true), RoadClass::Boulevard);
        assert_eq!(cut_class(METROPOLIS, false), RoadClass::Avenue);
        assert_eq!(
            reclass(RoadClass::Boulevard, METROPOLIS * 2, true),
            RoadClass::Boulevard
        );
        assert_eq!(reclass(RoadClass::Avenue, METROPOLIS * 2, false), RoadClass::Avenue);
    }

    #[test]
    fn follows_the_mass_rule_without_a_tier() {
        assert_eq!(class_of(CITY, true, true, None), RoadClass::Boulevard);
        assert_eq!(
            reclass_of(RoadClass::Avenue, CITY * 2, true, true, None),
            RoadClass::Boulevard
        );
        assert_eq!(right_of_way_for(CITY, false, false, None), reserve_for(CITY, false));
        assert_eq!(capped_class(RoadClass::Collector, None), RoadClass::Collector);
    }

    #[test]
    fn gives_the_town_s_first_cut_the_tier_s_class_and_every_other_cut_one_class_below() {
        let town = Some(tier_rule(Tier::Town, 2_300_000));
        assert_eq!(class_of(10, true, true, town), RoadClass::Avenue);
        assert_eq!(reclass_of(RoadClass::Street, 10, true, true, town), RoadClass::Avenue);
        assert_eq!(right_of_way_for(2_300_000, true, true, town), RoadClass::Boulevard);
        assert_eq!(class_of(CITY, true, false, town), RoadClass::Collector);
        assert_eq!(class_of(40_000, true, false, town), RoadClass::Collector);
        assert_eq!(class_of(10, true, false, town), RoadClass::Street);
        assert_eq!(
            reclass_of(RoadClass::Collector, CITY * 2, true, false, town),
            RoadClass::Collector
        );
        assert_eq!(right_of_way_for(CITY, true, false, town), RoadClass::Avenue);
        assert_eq!(right_of_way_for(10, true, false, town), RoadClass::Street);
        assert_eq!(
            capped_class(RoadClass::Collector, Some(tier_rule(Tier::Village, 40_000))),
            RoadClass::Street
        );
    }
}
