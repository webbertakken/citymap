//! The archetypes that are settings: three district forms and the tier rule, each on or off.
use std::fmt;

/// An archetype toggle.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Toggle {
    Corridor,
    Archipelago,
    Quarters,
    Tiers,
}

/// Every toggle, in its own order.
pub const TOGGLES: [Toggle; 4] = [Toggle::Corridor, Toggle::Archipelago, Toggle::Quarters, Toggle::Tiers];

/// Corridor and tiers are on unless a setting says otherwise.
pub const DEFAULT_TOGGLES: [Toggle; 2] = [Toggle::Corridor, Toggle::Tiers];

impl Toggle {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Corridor => "corridor",
            Self::Archipelago => "archipelago",
            Self::Quarters => "quarters",
            Self::Tiers => "tiers",
        }
    }

    /// The toggle a name names, if any.
    #[must_use]
    pub fn parse(name: &str) -> Option<Self> {
        TOGGLES.into_iter().find(|t| t.as_str() == name)
    }
}

impl fmt::Display for Toggle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The toggles named, in `TOGGLES` order and once each.
#[must_use]
pub fn toggle_list(toggles: &[Toggle]) -> Vec<Toggle> {
    TOGGLES.into_iter().filter(|t| toggles.contains(t)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_four_toggles_in_their_order_corridor_and_tiers_on_by_default() {
        assert_eq!(
            TOGGLES.map(Toggle::as_str),
            ["corridor", "archipelago", "quarters", "tiers"]
        );
        assert_eq!(DEFAULT_TOGGLES, [Toggle::Corridor, Toggle::Tiers]);
    }

    #[test]
    fn lists_the_toggles_named_in_their_own_order_and_once_each() {
        assert_eq!(toggle_list(&[]), []);
        assert_eq!(
            toggle_list(&[Toggle::Tiers, Toggle::Quarters, Toggle::Tiers]),
            [Toggle::Quarters, Toggle::Tiers]
        );
    }

    #[test]
    fn tells_a_toggle_s_name_from_any_other_text() {
        assert_eq!(Toggle::parse("archipelago"), Some(Toggle::Archipelago));
        assert_eq!(Toggle::parse("gridiron"), None);
        assert_eq!(Toggle::Corridor.to_string(), "corridor");
    }
}
