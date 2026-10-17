//! Which files stand on which lot, read from the plat the lay left, and the measures section built from them.
use std::collections::{BTreeMap, HashMap};

use citymap_ground_plan::city::City;
use citymap_ground_plan::fixed::compare_keys;
use citymap_ground_plan::plat::Plat;
use citymap_ground_plan::snapshot::FileEntry;

use crate::section::{FileMeasures, LotMeasures, MEASURES_VERSION, Measures, available_for};

/// Each lot's live files, sorted, by town key and lot key; vacant lots have none. Towns and lots in the city's order.
pub type LotFiles = Vec<(String, Vec<(String, Vec<String>)>)>;

/// The members (identities) of every lot of a town, by lot key, as the plat records them.
fn members_of<'a>(plat: &'a Plat, town_key: &str, old: bool) -> HashMap<&'a str, &'a [String]> {
    let mut members: HashMap<&str, &[String]> = HashMap::new();
    if old {
        for list in plat.old.values() {
            for o in list.iter().filter(|o| o.town.key == town_key) {
                for (key, ids) in &o.members {
                    members.insert(key, ids);
                }
            }
        }
    }
    members
}

/// The lots' files: each lot's live members as paths, sorted, or its own path when the plat names none of them.
#[must_use]
pub fn lot_files(city: &City, plat: &Plat, files: &[FileEntry]) -> LotFiles {
    let path_of: HashMap<&str, &str> = files.iter().map(|f| (&*f.identity, &*f.path)).collect();
    city.towns
        .iter()
        .map(|town| {
            let old = members_of(plat, &town.key, town.old);
            let shares: HashMap<&str, Vec<&str>> = if town.old {
                HashMap::new()
            } else {
                plat.towns
                    .get(&town.key)
                    .map(|t| {
                        t.shares
                            .values()
                            .flatten()
                            .map(|lot| (&*lot.key, lot.members.iter().map(|m| &**m).collect()))
                            .collect()
                    })
                    .unwrap_or_default()
            };
            let lots = town
                .lots
                .iter()
                .filter(|lot| !lot.vacant)
                .map(|lot| {
                    let members: Vec<&str> = if town.old {
                        old.get(lot.key.as_str())
                            .map(|ids| ids.iter().map(String::as_str).collect())
                            .unwrap_or_default()
                    } else {
                        shares.get(lot.key.as_str()).cloned().unwrap_or_default()
                    };
                    let mut paths: Vec<String> = members
                        .iter()
                        .filter_map(|id| path_of.get(id).map(|p| (*p).to_owned()))
                        .collect();
                    if paths.is_empty() {
                        paths.push(lot.path.clone());
                    }
                    paths.sort_by(|a, b| compare_keys(a, b));
                    (lot.key.clone(), paths)
                })
                .collect();
            (town.key.clone(), lots)
        })
        .collect()
}

/// The people across a lot's files.
pub type AuthorsAcross<'a> = &'a dyn Fn(&[String]) -> i64;

/// What the section is built from.
pub struct MeasuresInput<'a> {
    pub source: &'static str,
    pub size: &'static str,
    /// Whether the history was read: recency, churn and authors are then available.
    pub history: bool,
    /// Whether contents were read: comments are then available.
    pub comments: bool,
    pub tested: &'static str,
    pub lots: &'a LotFiles,
    /// A file's values; its path is set by the builder.
    pub facts_of: &'a dyn Fn(&str) -> FileMeasures,
    /// The people across a lot's files, when the history was read.
    pub authors_across: Option<AuthorsAcross<'a>>,
}

/// The measures section: every lot's files and their values, keyed by town and lot.
#[must_use]
pub fn build_measures(input: &MeasuresInput) -> Measures {
    let mut lots: BTreeMap<String, BTreeMap<String, LotMeasures>> = BTreeMap::new();
    for (town, town_lots) in input.lots {
        let entries = lots.entry(town.clone()).or_default();
        for (key, paths) in town_lots {
            let files = paths
                .iter()
                .map(|path| FileMeasures {
                    path: path.clone(),
                    ..(input.facts_of)(path)
                })
                .collect();
            entries.insert(
                key.clone(),
                LotMeasures {
                    authors: input.authors_across.map(|across| across(paths)),
                    files,
                },
            );
        }
    }
    Measures {
        available: available_for(input.source, input.history, input.comments),
        lots,
        size: input.size,
        source: input.source,
        tested: input.tested,
        version: MEASURES_VERSION,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use citymap_ground_plan::city::{Lot, Town, TownStats};
    use citymap_ground_plan::land_use::LandUse;
    use citymap_ground_plan::plat::{OldTown, TownPlat};
    use citymap_ground_plan::tree::ShareRecord;

    use super::*;

    fn lot(key: &str, path: &str, vacant: bool) -> Lot {
        Lot {
            address: String::new(),
            district: 0,
            form: None,
            key: key.into(),
            path: path.into(),
            pts: vec![],
            land_use: LandUse::Source,
            vacant,
        }
    }
    fn town(key: &str, old: bool, lots: Vec<Lot>) -> Town {
        Town {
            blocks: vec![],
            canals: vec![],
            districts: vec![],
            form: citymap_ground_plan::archetype::Form::Polycentric,
            key: key.into(),
            lots,
            name: key.into(),
            old,
            outline: vec![],
            roads: vec![],
            stats: TownStats::default(),
            water: vec![],
        }
    }
    fn entry(path: &str) -> FileEntry {
        FileEntry {
            path: path.into(),
            identity: format!("{path}@0").into(),
            first_seen: 0,
        }
    }

    #[test]
    fn reads_an_old_towns_members_skips_vacant_lots_and_falls_back_to_a_lots_own_path() {
        let city = City {
            commit: "worktree".into(),
            highways: vec![],
            repository: "demo".into(),
            towns: vec![
                Arc::new(town(
                    "demo",
                    false,
                    vec![lot("a@0", "a", false), lot("gone@0", "", true), lot("b@0", "b", false)],
                )),
                Arc::new(town(
                    "demo old town",
                    true,
                    vec![lot("a@0", "old/a", false), lot("c@0", "c", false)],
                )),
                Arc::new(town("new", false, vec![lot("n@0", "n", false)])),
            ],
        };
        let mut plat = Plat::empty("x");
        let mut shares = citymap_ground_plan::tree::Shares::new();
        shares.insert(
            "|source".into(),
            vec![ShareRecord {
                key: "a@0".into(),
                members: vec!["a@0".into(), "dead@1".into()],
            }],
        );
        plat.towns.insert(
            "demo".into(),
            TownPlat {
                shares: Arc::new(shares),
                ..TownPlat::default()
            },
        );
        plat.old.insert(
            "demo".into(),
            vec![
                OldTown {
                    members: BTreeMap::new(),
                    town: town("demo old town 2", true, vec![]),
                },
                OldTown {
                    members: BTreeMap::from([("a@0".to_owned(), vec!["old/a@0".to_owned()])]),
                    town: (*city.towns[1]).clone(),
                },
            ],
        );
        let lots = lot_files(&city, &plat, &[entry("a"), entry("old/a")]);
        let strings = |v: &[&str]| v.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
        assert_eq!(
            lots,
            vec![
                (
                    "demo".to_owned(),
                    vec![("a@0".to_owned(), strings(&["a"])), ("b@0".to_owned(), strings(&["b"]))]
                ),
                (
                    "demo old town".to_owned(),
                    vec![
                        ("a@0".to_owned(), strings(&["old/a"])),
                        ("c@0".to_owned(), strings(&["c"]))
                    ]
                ),
                ("new".to_owned(), vec![("n@0".to_owned(), strings(&["n"]))]),
            ]
        );
        let facts = |path: &str| FileMeasures {
            lines: (path == "a").then_some(3),
            ..FileMeasures::default()
        };
        let across = |paths: &[String]| i64::try_from(paths.len()).unwrap();
        let measures = build_measures(&MeasuresInput {
            source: "cli",
            size: "lines",
            history: true,
            comments: true,
            tested: "coverage",
            lots: &lots,
            facts_of: &facts,
            authors_across: Some(&across),
        });
        assert_eq!(measures.lots["demo"]["a@0"].files[0].lines, Some(3));
        assert_eq!(measures.lots["demo"]["a@0"].authors, Some(1));
        assert_eq!(measures.available.len(), 7);
    }
}
