//! Archetypes: a folder's form, chosen from continuous features with a Schmitt trigger round the incumbent.
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::constants::{FLATTEN_HYSTERESIS_PCT, FLATTEN_LIMIT};
use crate::fixed::compare_keys;
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
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Features {
    pub mass_mille: i64,
    /// Shares of the heaviest and second-heaviest child folder.
    pub s1: i64,
    pub s2: i64,
    /// Share in the folder's own files.
    pub f0: i64,
    /// Lots the folder holds when flattened.
    pub lots: i64,
}

fn share(part: i64, whole: i64) -> i64 {
    if whole > 0 { part * 1000 / whole } else { 0 }
}

#[must_use]
pub fn features(mass_mille: i64, child_masses: &[i64], lots: i64) -> Features {
    let mut sorted = child_masses.to_vec();
    sorted.sort_by(|a, b| b.cmp(a));
    let own = (mass_mille - child_masses.iter().sum::<i64>()).max(0);
    Features {
        mass_mille,
        s1: share(sorted.first().copied().unwrap_or(0), mass_mille),
        s2: share(sorted.get(1).copied().unwrap_or(0), mass_mille),
        f0: share(own, mass_mille),
        lots,
    }
}

/// A district form and its margin, in per mille.
type Rule = (Form, fn(&Features) -> i64);

// District forms in priority order, each with its margin in per mille; polycentric is the fallback, always open.
const RULES: [Rule; 2] = [
    (Form::Radial, |f| f.s1 - 600),
    (Form::Twin, |f| (f.s2 - 300).min(f.s1 + f.s2 - 750)),
];
/// The incumbent holds down to this margin; a challenger needs this one.
const STAY: i64 = 150;
const CHALLENGE: i64 = 100;

/// The district form: a Schmitt trigger round the incumbent.
#[must_use]
pub fn district_form(f: &Features, previous: Option<Form>) -> Form {
    let challenger = |rules: &[Rule], at: i64| rules.iter().find(|(_, margin)| margin(f) >= at).map(|r| r.0);
    let Some(previous) = previous.filter(|p| !p.is_flat()) else {
        return challenger(&RULES, 0).unwrap_or(Form::Polycentric);
    };
    // Polycentric ranks after every rule and never falls out of its band.
    let i = RULES.iter().position(|r| r.0 == previous).unwrap_or(RULES.len());
    if let Some(earlier) = challenger(&RULES[..i], CHALLENGE) {
        return earlier;
    }
    if previous == Form::Polycentric || RULES[i].1(f) >= -STAY {
        return previous;
    }
    challenger(&RULES[i + 1..], CHALLENGE).unwrap_or(Form::Polycentric)
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

/// A folder's form given the form it had: flat (one neighbourhood) or a district form, each with hysteresis.
#[must_use]
pub fn classify_node(node: &TreeNode, previous: Option<Form>) -> Form {
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
    let f = features(node.mass_mille, &masses, lots);
    if flat {
        flat_form(&f, previous)
    } else {
        district_form(&f, previous)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::land_use::LandUse;

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
            s1: 0,
            s2: 0,
            f0,
            lots,
        }
    }

    fn district(s1: i64, s2: i64) -> Features {
        Features {
            mass_mille: 1,
            s1,
            s2,
            f0: 0,
            lots: 0,
        }
    }

    #[test]
    fn measures_the_heaviest_children_and_own_files_in_per_mille() {
        assert_eq!(
            features(10_000, &[6000, 3000], 7),
            Features {
                mass_mille: 10_000,
                s1: 600,
                s2: 300,
                f0: 100,
                lots: 7
            }
        );
        assert_eq!(
            features(0, &[], 0),
            Features {
                mass_mille: 0,
                s1: 0,
                s2: 0,
                f0: 0,
                lots: 0
            }
        );
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
        assert_eq!(district_form(&district(600, 0), None), Form::Radial);
        assert_eq!(district_form(&district(450, 300), None), Form::Twin);
        assert_eq!(district_form(&district(449, 300), None), Form::Polycentric);
        assert_eq!(district_form(&district(600, 0), Some(Form::Hamlet)), Form::Radial);
    }

    #[test]
    fn keeps_the_incumbent_and_switches_only_by_a_margin() {
        assert_eq!(district_form(&district(450, 0), Some(Form::Radial)), Form::Radial);
        assert_eq!(district_form(&district(449, 0), Some(Form::Radial)), Form::Polycentric);
        assert_eq!(district_form(&district(699, 290), Some(Form::Twin)), Form::Twin);
        assert_eq!(district_form(&district(700, 290), Some(Form::Twin)), Form::Radial);
        assert_eq!(district_form(&district(300, 140), Some(Form::Twin)), Form::Polycentric);
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
        assert_eq!(
            classify_node(&with("p", vec![], 1000, FLATTEN_LIMIT * 9), None),
            Form::Hamlet
        );
        assert_eq!(
            classify_node(&with("p", vec![child()], 1000, FLATTEN_LIMIT), None),
            Form::Hamlet
        );
        assert_eq!(
            classify_node(&with("p", vec![child()], 1000, FLATTEN_LIMIT + 1), None),
            Form::Radial
        );
        let hamlet = Some(Form::Hamlet);
        assert_eq!(
            classify_node(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 3 / 2), hamlet),
            Form::Hamlet
        );
        assert_eq!(
            classify_node(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 3 / 2 + 1), hamlet),
            Form::Radial
        );
        let radial = Some(Form::Radial);
        assert_eq!(
            classify_node(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 2 / 3 + 1), radial),
            Form::Radial
        );
        assert_eq!(
            classify_node(&with("p", vec![child()], 1000, FLATTEN_LIMIT * 2 / 3), radial),
            Form::Hamlet
        );
        assert_eq!(classify_node(&with("p", vec![], 1000, 0), radial), Form::Hamlet);
        let mut street = with("p", vec![], 40_000, 1);
        street.lots = (0..40).map(|i| seed(&format!("p/f{i}"), 0)).collect();
        assert_eq!(classify_node(&street, None), Form::StreetVillage);
    }
}
