//! Archetypes: a folder's form, chosen from continuous features with a Schmitt trigger round the incumbent.
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::constants::{FLATTEN_HYSTERESIS_PCT, FLATTEN_LIMIT};
use crate::fixed::{compare_keys, floor_div};
use crate::toggles::Toggle;
use crate::tree::{LotSeed, TreeNode};

/// A folder's form: a flattened folder's neighbourhood form, or a district form that arranges its children.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Form {
    Hamlet,
    StreetVillage,
    Neighbourhood,
    Radial,
    Twin,
    Polycentric,
    Corridor,
    Archipelago,
    Quarters,
}

impl Form {
    /// True for a neighbourhood form (hamlet, street village, neighbourhood).
    #[must_use]
    pub const fn is_flat(self) -> bool {
        matches!(self, Self::Hamlet | Self::StreetVillage | Self::Neighbourhood)
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Hamlet => "hamlet",
            Self::StreetVillage => "street-village",
            Self::Neighbourhood => "neighbourhood",
            Self::Radial => "radial",
            Self::Twin => "twin",
            Self::Polycentric => "polycentric",
            Self::Corridor => "corridor",
            Self::Archipelago => "archipelago",
            Self::Quarters => "quarters",
        }
    }
}

impl fmt::Display for Form {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// True when a previous form exists and is flat.
fn was_flat(previous: Option<Form>) -> bool {
    previous.is_some_and(Form::is_flat)
}

/// The shape of a folder, in per mille of its mass.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Features {
    pub mass_mille: i64,
    /// Shares of the heaviest and second-heaviest child folder.
    pub s1: i64,
    pub s2: i64,
    /// Share in the folder's own files.
    pub f0: i64,
    /// Lots the folder holds when flattened.
    pub lots: i64,
    /// Child folders that are packages, and their share of the mass (archipelago only; else 0).
    pub packages: i64,
    pub package_mille: i64,
    /// The effective number of children, in per mille: one over the sum of squared shares (quarters only; else 0).
    pub neff_mille: i64,
}

/// What only some rules need: the packages' masses, and whether to measure the effective number of children.
#[derive(Clone, Debug, Default)]
pub struct MoreFeatures {
    pub package_masses: Vec<i64>,
    pub neff: bool,
}

fn share(part: i64, whole: i64) -> i64 {
    if whole > 0 { part * 1000 / whole } else { 0 }
}

/// One over the sum of squared shares of the parts (children and own files), in per mille; exact.
fn effective_mille(mass_mille: i64, parts: &[i64]) -> i64 {
    let squares: i128 = parts.iter().map(|&m| i128::from(m) * i128::from(m)).sum();
    if squares == 0 {
        return 0;
    }
    let mass = i128::from(mass_mille);
    i64::try_from(mass * mass * 1000 / squares).expect("an effective count fits")
}

#[must_use]
pub fn features(mass_mille: i64, child_masses: &[i64], lots: i64, more: &MoreFeatures) -> Features {
    let mut sorted = child_masses.to_vec();
    sorted.sort_by(|a, b| b.cmp(a));
    let own = (mass_mille - child_masses.iter().sum::<i64>()).max(0);
    let neff_mille = if more.neff {
        let mut parts = child_masses.to_vec();
        parts.push(own);
        effective_mille(mass_mille, &parts)
    } else {
        0
    };
    Features {
        mass_mille,
        s1: share(sorted.first().copied().unwrap_or(0), mass_mille),
        s2: share(sorted.get(1).copied().unwrap_or(0), mass_mille),
        f0: share(own, mass_mille),
        lots,
        packages: i64::try_from(more.package_masses.len()).expect("small"),
        package_mille: share(more.package_masses.iter().sum(), mass_mille),
        neff_mille,
    }
}

/// A corridor holds at least this share (‰) in its heaviest child, and under this share in its own files.
pub const CORRIDOR_SHARE: i64 = 900;
pub const CORRIDOR_OWN: i64 = 100;
/// An archipelago has at least this many packages, holding at least this share (‰) of its mass.
pub const ARCHIPELAGO_PACKAGES: i64 = 3;
pub const ARCHIPELAGO_COVER: i64 = 500;
/// Quarters need at least this many effective children (‰), and no child over this share (‰).
pub const QUARTERS_NEFF: i64 = 7000;
pub const QUARTERS_MAX_SHARE: i64 = 250;

/// The incumbent holds down to this margin; a challenger needs this one.
const STAY: i64 = 150;
const CHALLENGE: i64 = 100;
/// A corridor's own, narrower band: its features are thresholds.
const CORRIDOR_STAY: i64 = 50;
const CORRIDOR_CHALLENGE: i64 = 20;

/// A district form, its margin in per mille, the toggle that turns it on (none: always on), and its band.
struct Rule {
    form: Form,
    margin: fn(&Features) -> i64,
    toggle: Option<Toggle>,
    stay: i64,
    challenge: i64,
}

// District forms in priority order; polycentric is the fallback, always open.
const RULES: [Rule; 5] = [
    Rule {
        form: Form::Corridor,
        margin: |f| (f.s1 - CORRIDOR_SHARE).min(CORRIDOR_OWN - 1 - f.f0),
        toggle: Some(Toggle::Corridor),
        stay: CORRIDOR_STAY,
        challenge: CORRIDOR_CHALLENGE,
    },
    Rule {
        form: Form::Archipelago,
        margin: |f| {
            floor_div((f.packages - ARCHIPELAGO_PACKAGES) * 1000, ARCHIPELAGO_PACKAGES)
                .min(f.package_mille - ARCHIPELAGO_COVER)
        },
        toggle: Some(Toggle::Archipelago),
        stay: STAY,
        challenge: CHALLENGE,
    },
    Rule {
        form: Form::Radial,
        margin: |f| f.s1 - 600,
        toggle: None,
        stay: STAY,
        challenge: CHALLENGE,
    },
    Rule {
        form: Form::Twin,
        margin: |f| (f.s2 - 300).min(f.s1 + f.s2 - 750),
        toggle: None,
        stay: STAY,
        challenge: CHALLENGE,
    },
    Rule {
        form: Form::Quarters,
        margin: |f| floor_div(f.neff_mille - QUARTERS_NEFF, 7).min(QUARTERS_MAX_SHARE - f.s1),
        toggle: Some(Toggle::Quarters),
        stay: STAY,
        challenge: CHALLENGE,
    },
];

/// The district form: a Schmitt trigger round the incumbent, over the rules whose toggles are on.
#[must_use]
pub fn district_form(f: &Features, previous: Option<Form>, toggles: &[Toggle]) -> Form {
    let rules: Vec<&Rule> = RULES
        .iter()
        .filter(|r| r.toggle.is_none_or(|t| toggles.contains(&t)))
        .collect();
    let challenger = |list: &[&Rule], cold: bool| {
        list.iter()
            .find(|r| (r.margin)(f) >= if cold { 0 } else { r.challenge })
            .map(|r| r.form)
    };
    // Polycentric ranks after every rule and never falls out of its band; a form whose toggle is off starts cold.
    let index = match previous {
        Some(Form::Polycentric) => Some(rules.len()),
        Some(p) if !p.is_flat() => rules.iter().position(|r| r.form == p),
        _ => None,
    };
    let (Some(previous), Some(i)) = (previous, index) else {
        return challenger(&rules, true).unwrap_or(Form::Polycentric);
    };
    if let Some(earlier) = challenger(&rules[..i], false) {
        return earlier;
    }
    match rules.get(i) {
        None => return previous,
        Some(r) if (r.margin)(f) >= -r.stay => return previous,
        Some(_) => {}
    }
    challenger(&rules[i + 1..], false).unwrap_or(Form::Polycentric)
}

const HAMLET_MASS: i64 = 25_000;
const STREET_LOTS: i64 = 40;
const STREET_F0: i64 = 600;

/// The neighbourhood form, each threshold with a ±25 % band round the incumbent.
#[must_use]
pub fn flat_form(f: &Features, previous: Option<Form>) -> Form {
    let hamlet = if previous == Some(Form::Hamlet) {
        f.mass_mille * 4 < HAMLET_MASS * 5
    } else {
        f.mass_mille < HAMLET_MASS
    };
    if hamlet {
        return Form::Hamlet;
    }
    let street = if previous == Some(Form::StreetVillage) {
        f.lots * 5 >= STREET_LOTS * 4 && f.f0 * 5 >= STREET_F0 * 4
    } else {
        f.lots >= STREET_LOTS && f.f0 >= STREET_F0
    };
    if street {
        Form::StreetVillage
    } else {
        Form::Neighbourhood
    }
}

/// A folder's lots in order: its own, then each child's by first appearance and path; and all its docs.
#[must_use]
pub fn flatten(node: &TreeNode) -> (Vec<LotSeed>, i64) {
    let mut lots = Vec::new();
    let docs = flatten_into(node, &mut lots);
    (lots, docs)
}

fn flatten_into(node: &TreeNode, lots: &mut Vec<LotSeed>) -> i64 {
    lots.extend(node.lots.iter().cloned());
    let mut docs = node.docs;
    let mut children: Vec<&TreeNode> = node.children.iter().collect();
    children.sort_by(|a, b| {
        a.first_seen
            .cmp(&b.first_seen)
            .then_with(|| compare_keys(&a.path, &b.path))
    });
    for child in children {
        docs += flatten_into(child, lots);
    }
    docs
}

/// How many lots a folder holds when flattened.
fn flat_lots(node: &TreeNode) -> i64 {
    i64::try_from(node.lots.len()).expect("small") + node.children.iter().map(flat_lots).sum::<i64>()
}

/// A child folder an archipelago makes an island: a workspace member whose mass is at least half source.
#[must_use]
pub const fn is_package(node: &TreeNode) -> bool {
    node.member && node.mass_mille > 0 && 2 * node.source_mille >= node.mass_mille
}

/// A folder's form given the form it had: flat (one neighbourhood) or a district form, each with hysteresis.
#[must_use]
pub fn classify_node(node: &TreeNode, previous: Option<Form>, toggles: &[Toggle]) -> Form {
    let leaf = node.children.is_empty();
    let mut flat = leaf || node.demand <= FLATTEN_LIMIT;
    if was_flat(previous) && !leaf {
        flat = node.demand * 100 <= FLATTEN_LIMIT * FLATTEN_HYSTERESIS_PCT;
    }
    if previous.is_some_and(|p| !p.is_flat()) {
        flat = leaf || node.demand * FLATTEN_HYSTERESIS_PCT <= FLATTEN_LIMIT * 100;
    }
    let lots = if flat { flat_lots(node) } else { 0 };
    let masses: Vec<i64> = node.children.iter().map(|c| c.mass_mille).collect();
    let more = if flat {
        MoreFeatures::default()
    } else {
        MoreFeatures {
            package_masses: if toggles.contains(&Toggle::Archipelago) {
                node.children
                    .iter()
                    .filter(|c| is_package(c))
                    .map(|c| c.mass_mille)
                    .collect()
            } else {
                Vec::new()
            },
            neff: toggles.contains(&Toggle::Quarters),
        }
    };
    let f = features(node.mass_mille, &masses, lots, &more);
    if flat {
        flat_form(&f, previous)
    } else {
        district_form(&f, previous, toggles)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::land_use::LandUse;

    const NONE: &[Toggle] = &[];

    fn seed(path: &str, first_seen: i64) -> LotSeed {
        LotSeed {
            key: format!("{path}@0").into(),
            path: path.into(),
            land_use: LandUse::Source,
            first_seen,
        }
    }

    fn node(path: &str) -> TreeNode {
        TreeNode {
            path: path.into(),
            name: path.to_owned(),
            depth: 1,
            first_seen: 0,
            lots: vec![],
            docs: 0,
            children: vec![],
            mass_mille: 0,
            demand: 0,
            digest: 0,
            member: false,
            source_mille: 0,
        }
    }

    fn with(path: &str, children: Vec<TreeNode>, mass_mille: i64, demand: i64) -> TreeNode {
        TreeNode {
            children,
            mass_mille,
            demand,
            ..node(path)
        }
    }

    fn child() -> TreeNode {
        with("p/c", vec![], 1000, 10)
    }

    fn flat(mass_mille: i64, lots: i64, f0: i64) -> Features {
        Features {
            mass_mille,
            f0,
            lots,
            ..Features::default()
        }
    }

    fn district(s1: i64, s2: i64) -> Features {
        Features {
            mass_mille: 1,
            s1,
            s2,
            ..Features::default()
        }
    }

    #[test]
    fn measures_the_heaviest_children_and_own_files_in_per_mille() {
        assert_eq!(
            features(10_000, &[6000, 3000], 7, &MoreFeatures::default()),
            Features {
                mass_mille: 10_000,
                s1: 600,
                s2: 300,
                f0: 100,
                lots: 7,
                ..Features::default()
            }
        );
        assert_eq!(features(0, &[], 0, &MoreFeatures::default()), Features::default());
    }

    #[test]
    fn counts_packages_and_their_share_when_asked() {
        let more = MoreFeatures {
            package_masses: vec![3000, 2000],
            neff: false,
        };
        let f = features(10_000, &[3000, 2000, 1000], 0, &more);
        assert_eq!((f.packages, f.package_mille), (2, 500));
    }

    #[test]
    fn measures_the_effective_number_of_children_exactly_when_asked() {
        let more = MoreFeatures {
            package_masses: vec![],
            neff: true,
        };
        assert_eq!(features(4000, &[1000, 1000, 1000, 1000], 0, &more).neff_mille, 4000);
        assert_eq!(features(4000, &[1000, 1000, 1000], 0, &more).neff_mille, 4000);
        assert_eq!(features(10, &[6, 3, 1], 0, &more).neff_mille, 2173);
        assert_eq!(features(0, &[], 0, &more).neff_mille, 0);
    }

    #[test]
    fn makes_small_folders_hamlets_with_a_band_round_the_incumbent() {
        assert_eq!(flat_form(&flat(24_999, 0, 0), None), Form::Hamlet);
        assert_eq!(flat_form(&flat(25_000, 0, 0), None), Form::Neighbourhood);
        assert_eq!(flat_form(&flat(31_249, 0, 0), Some(Form::Hamlet)), Form::Hamlet);
        assert_eq!(flat_form(&flat(31_250, 0, 0), Some(Form::Hamlet)), Form::Neighbourhood);
    }

    #[test]
    fn makes_large_own_file_folders_street_villages_with_a_band() {
        assert_eq!(flat_form(&flat(50_000, 40, 600), None), Form::StreetVillage);
        assert_eq!(flat_form(&flat(50_000, 39, 600), None), Form::Neighbourhood);
        assert_eq!(flat_form(&flat(50_000, 40, 599), None), Form::Neighbourhood);
        let sv = Some(Form::StreetVillage);
        assert_eq!(flat_form(&flat(50_000, 32, 480), sv), Form::StreetVillage);
        assert_eq!(flat_form(&flat(50_000, 31, 480), sv), Form::Neighbourhood);
        assert_eq!(flat_form(&flat(50_000, 32, 479), sv), Form::Neighbourhood);
    }

    #[test]
    fn enters_the_first_form_with_a_margin_of_zero_on_a_cold_start() {
        assert_eq!(district_form(&district(600, 0), None, NONE), Form::Radial);
        assert_eq!(district_form(&district(450, 300), None, NONE), Form::Twin);
        assert_eq!(district_form(&district(449, 300), None, NONE), Form::Polycentric);
        assert_eq!(district_form(&district(600, 0), Some(Form::Hamlet), NONE), Form::Radial);
    }

    #[test]
    fn keeps_the_incumbent_and_switches_only_by_a_margin() {
        assert_eq!(district_form(&district(450, 0), Some(Form::Radial), NONE), Form::Radial);
        assert_eq!(
            district_form(&district(449, 0), Some(Form::Radial), NONE),
            Form::Polycentric
        );
        assert_eq!(district_form(&district(699, 290), Some(Form::Twin), NONE), Form::Twin);
        assert_eq!(district_form(&district(700, 290), Some(Form::Twin), NONE), Form::Radial);
        assert_eq!(
            district_form(&district(300, 140), Some(Form::Twin), NONE),
            Form::Polycentric
        );
    }

    fn own(s1: i64, f0: i64) -> Features {
        Features { f0, ..district(s1, 0) }
    }

    #[test]
    fn takes_a_corridor_first_when_its_toggle_is_on() {
        let on = &[Toggle::Corridor];
        assert_eq!(district_form(&own(900, 99), None, on), Form::Corridor);
        assert_eq!(district_form(&own(899, 0), None, on), Form::Radial);
        assert_eq!(district_form(&own(950, 100), None, on), Form::Radial);
        assert_eq!(district_form(&own(900, 0), None, NONE), Form::Radial);
        assert_eq!(district_form(&own(850, 0), Some(Form::Corridor), on), Form::Corridor);
        assert_eq!(district_form(&own(849, 0), Some(Form::Corridor), on), Form::Radial);
        assert_eq!(district_form(&own(919, 0), Some(Form::Radial), on), Form::Radial);
        assert_eq!(district_form(&own(920, 0), Some(Form::Radial), on), Form::Corridor);
        // A form whose toggle is off starts cold.
        assert_eq!(district_form(&own(950, 0), Some(Form::Corridor), NONE), Form::Radial);
    }

    #[test]
    fn takes_an_archipelago_for_three_packages_holding_half_the_mass() {
        let on = &[Toggle::Archipelago];
        let islands = |packages: i64, package_mille: i64| Features {
            packages,
            package_mille,
            ..district(300, 200)
        };
        let prev = Some(Form::Archipelago);
        assert_eq!(district_form(&islands(3, 500), None, on), Form::Archipelago);
        assert_eq!(district_form(&islands(2, 900), None, on), Form::Polycentric);
        assert_eq!(district_form(&islands(3, 499), None, on), Form::Polycentric);
        assert_eq!(district_form(&islands(3, 350), prev, on), Form::Archipelago);
        assert_eq!(district_form(&islands(3, 349), prev, on), Form::Polycentric);
        assert_eq!(district_form(&islands(3, 500), None, NONE), Form::Polycentric);
        let strong = Features {
            packages: 4,
            package_mille: 900,
            ..district(700, 0)
        };
        assert_eq!(district_form(&strong, None, on), Form::Archipelago);
    }

    #[test]
    fn takes_quarters_for_seven_effective_children_with_none_over_a_quarter() {
        let on = &[Toggle::Quarters];
        let fan = |neff_mille: i64, s1: i64| Features {
            neff_mille,
            ..district(s1, 0)
        };
        assert_eq!(district_form(&fan(7000, 250), None, on), Form::Quarters);
        assert_eq!(district_form(&fan(6999, 100), None, on), Form::Polycentric);
        assert_eq!(district_form(&fan(9000, 251), None, on), Form::Polycentric);
        assert_eq!(district_form(&fan(5950, 100), Some(Form::Quarters), on), Form::Quarters);
        assert_eq!(
            district_form(&fan(5943, 100), Some(Form::Quarters), on),
            Form::Polycentric
        );
        assert_eq!(
            district_form(&fan(7699, 100), Some(Form::Polycentric), on),
            Form::Polycentric
        );
        assert_eq!(
            district_form(&fan(7700, 100), Some(Form::Polycentric), on),
            Form::Quarters
        );
        assert_eq!(district_form(&fan(9000, 100), None, NONE), Form::Polycentric);
    }

    #[test]
    fn flattens_own_lots_then_children_by_age_and_path() {
        let mut late = node("a/late");
        late.first_seen = 5;
        late.lots = vec![seed("a/late/y", 0)];
        let mut early = node("a/early");
        early.first_seen = 1;
        early.lots = vec![seed("a/early/z", 0)];
        early.docs = 2;
        let mut tree = node("a");
        tree.lots = vec![seed("a/x", 0)];
        tree.docs = 1;
        tree.children = vec![late, early];
        let (lots, docs) = flatten(&tree);
        assert_eq!(
            lots.iter().map(|l| &*l.path).collect::<Vec<_>>(),
            ["a/x", "a/early/z", "a/late/y"]
        );
        assert_eq!(docs, 3);
    }

    #[test]
    fn classifies_with_the_flatten_hysteresis() {
        let classify = |node: &TreeNode, previous| classify_node(node, previous, NONE);
        assert_eq!(
            classify(&with("p", vec![], 1000, FLATTEN_LIMIT * 9), None),
            Form::Hamlet
        );
        assert_eq!(
            classify(&with("p", vec![child()], 1000, FLATTEN_LIMIT), None),
            Form::Hamlet
        );
        assert_eq!(
            classify(&with("p", vec![child()], 1000, FLATTEN_LIMIT + 1), None),
            Form::Radial
        );
        let hamlet = Some(Form::Hamlet);
        assert_eq!(
            classify(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 3 / 2), hamlet),
            Form::Hamlet
        );
        assert_eq!(
            classify(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 3 / 2 + 1), hamlet),
            Form::Radial
        );
        let radial = Some(Form::Radial);
        assert_eq!(
            classify(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 2 / 3 + 1), radial),
            Form::Radial
        );
        assert_eq!(
            classify(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 2 / 3), radial),
            Form::Hamlet
        );
        assert_eq!(classify(&with("p", vec![], 1000, 0), radial), Form::Hamlet);
        let mut street = with("p", vec![], 40_000, 1);
        street.lots = (0..40).map(|i| seed(&format!("p/f{i}"), 0)).collect();
        assert_eq!(classify(&street, None), Form::StreetVillage);
    }

    #[test]
    fn counts_as_packages_only_members_whose_mass_is_at_least_half_source() {
        let pkg = |path: &str, member: bool, source_mille: i64, mass_mille: i64| TreeNode {
            member,
            source_mille,
            ..with(path, vec![], mass_mille, FLATTEN_LIMIT)
        };
        let folder = |third: TreeNode| {
            with(
                "p",
                vec![pkg("p/a", true, 1000, 2000), pkg("p/b", true, 1000, 1000), third],
                4000,
                FLATTEN_LIMIT * 4,
            )
        };
        let on = &[Toggle::Archipelago];
        assert_eq!(
            classify_node(&folder(pkg("p/c", true, 500, 1000)), None, on),
            Form::Archipelago
        );
        assert_eq!(
            classify_node(&folder(pkg("p/c", true, 499, 1000)), None, on),
            Form::Polycentric
        );
        assert_eq!(
            classify_node(&folder(pkg("p/c", false, 1000, 1000)), None, on),
            Form::Polycentric
        );
    }

    #[test]
    fn measures_effective_children_only_for_quarters() {
        let children = (0..8).map(|i| with(&format!("p/{i}"), vec![], 1000, 10)).collect();
        let spread = with("p", children, 8000, FLATTEN_LIMIT * 2);
        assert_eq!(classify_node(&spread, None, &[Toggle::Quarters]), Form::Quarters);
        assert_eq!(classify_node(&spread, None, NONE), Form::Polycentric);
    }

    #[test]
    fn names_every_form() {
        let names: Vec<&str> = [Form::Corridor, Form::Archipelago, Form::Quarters]
            .iter()
            .map(|f| f.as_str())
            .collect();
        assert_eq!(names, ["corridor", "archipelago", "quarters"]);
    }
}
