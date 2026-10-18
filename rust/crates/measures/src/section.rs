//! The city file's measures: a section beside the layout, keyed by town and lot, holding each lot's files and their
//! values. A missing value is unknown, never zero.
use std::collections::BTreeMap;
use std::sync::Arc;

use citymap_ground_plan::Result;
use citymap_ground_plan::city::{City, Road, Town};
use citymap_ground_plan::json::canonical_json;
use citymap_ground_plan::region::separate::Separation;
use serde::Serialize;

/// Every measure, in its order.
pub const MEASURES: [&str; 7] = ["size", "tested", "kind", "recency", "churn", "authors", "comments"];
pub const MEASURES_VERSION: u32 = 1;

/// One file's values; a field left out is unknown. Fields in byte order of their JSON names.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct FileMeasures {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authors: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comments: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commits: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub covered: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub named: Option<bool>,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub todos: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LotMeasures {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authors: Option<i64>,
    /// The lot's live files, sorted by path.
    pub files: Vec<FileMeasures>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Measures {
    /// The measures the source gives, in `MEASURES` order.
    pub available: Vec<&'static str>,
    /// Town key, then lot key.
    pub lots: BTreeMap<String, BTreeMap<String, LotMeasures>>,
    /// How size is counted: `lines` or `bytes`.
    pub size: &'static str,
    /// `cli`, `github` or `folder`.
    pub source: &'static str,
    /// The submodule folders the city's files lie in, sorted; left out when there are none. Their files carry no history.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub submodules: Vec<String>,
    /// How tested is known: `coverage` or `name`.
    pub tested: &'static str,
    pub version: u32,
}

impl Measures {
    /// The lots the section holds and the files on them, for the log.
    #[must_use]
    pub fn counts(&self) -> (usize, usize) {
        let lots = self.lots.values().map(BTreeMap::len).sum();
        let files = self
            .lots
            .values()
            .flat_map(BTreeMap::values)
            .map(|lot| lot.files.len())
            .sum();
        (lots, files)
    }
}

/// What a source can give, in `MEASURES` order.
#[must_use]
pub fn available_for(source: &str, history: bool, comments: bool) -> Vec<&'static str> {
    MEASURES
        .into_iter()
        .filter(|m| match *m {
            "recency" | "churn" | "authors" => source == "cli" && history,
            "comments" => comments,
            _ => true,
        })
        .collect()
}

/// A city file's fields, in byte order of their names: the city's, with the measures between highways and repository.
#[derive(Serialize)]
struct CityFile<'a> {
    commit: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    declared: Option<bool>,
    highways: &'a [Road],
    #[serde(skip_serializing_if = "Option::is_none")]
    measures: Option<&'a Measures>,
    repository: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    separable: Option<&'a [Separation]>,
    towns: &'a [Arc<Town>],
}

/// A city file as canonical JSON: the city's own bytes, with the `measures` key beside it when there are measures.
pub fn serialise_city_file(city: &City, measures: Option<&Measures>) -> Result<String> {
    canonical_json(&CityFile {
        commit: &city.commit,
        declared: city.declared,
        highways: &city.highways,
        measures,
        repository: &city.repository,
        separable: city.separable.as_deref(),
        towns: &city.towns,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use citymap_ground_plan::city::serialise_city;

    #[test]
    fn gives_historys_measures_to_a_folded_cli_city_only() {
        assert_eq!(available_for("cli", true, true), MEASURES.to_vec());
        assert_eq!(
            available_for("cli", false, true),
            vec!["size", "tested", "kind", "comments"]
        );
        assert_eq!(available_for("github", false, false), vec!["size", "tested", "kind"]);
    }

    #[test]
    fn keeps_what_a_city_records_of_its_separations() {
        let city = City {
            commit: "worktree".into(),
            declared: Some(true),
            highways: vec![],
            repository: "demo".into(),
            separable: Some(vec![Separation::Workspaces, Separation::Packages]),
            towns: vec![],
        };
        let written = serialise_city_file(&city, None).unwrap();
        assert_eq!(written, serialise_city(&city).unwrap());
        assert!(written.contains(r#""declared":true"#));
        assert!(written.contains(r#""separable":["workspaces","packages"]"#));
    }

    #[test]
    fn writes_a_city_without_measures_as_the_city_alone_and_with_them_beside_it() {
        let city = City {
            commit: "worktree".into(),
            declared: None,
            highways: vec![],
            repository: "demo".into(),
            separable: None,
            towns: vec![],
        };
        assert_eq!(
            serialise_city_file(&city, None).unwrap(),
            serialise_city(&city).unwrap()
        );
        let measures = Measures {
            available: available_for("cli", true, true),
            lots: BTreeMap::from([(
                "demo".to_owned(),
                BTreeMap::from([(
                    "a@0".to_owned(),
                    LotMeasures {
                        authors: Some(2),
                        files: vec![FileMeasures {
                            path: "a".into(),
                            lines: Some(3),
                            named: Some(true),
                            ..FileMeasures::default()
                        }],
                    },
                )]),
            )]),
            size: "lines",
            source: "cli",
            submodules: vec![],
            tested: "name",
            version: MEASURES_VERSION,
        };
        let within = Measures {
            submodules: vec!["vendor/a".into(), "vendor/b".into()],
            ..measures.clone()
        };
        assert!(
            serialise_city_file(&city, Some(&within))
                .unwrap()
                .contains(r#""source":"cli","submodules":["vendor/a","vendor/b"],"tested":"name""#)
        );
        assert_eq!(
            serialise_city_file(&city, Some(&measures)).unwrap(),
            "{\"commit\":\"worktree\",\"highways\":[],\"measures\":{\"available\":[\"size\",\"tested\",\"kind\",\"recency\",\"churn\",\"authors\",\"comments\"],\"lots\":{\"demo\":{\"a@0\":{\"authors\":2,\"files\":[{\"lines\":3,\"named\":true,\"path\":\"a\"}]}}},\"size\":\"lines\",\"source\":\"cli\",\"tested\":\"name\",\"version\":1},\"repository\":\"demo\",\"towns\":[]}\n"
        );
    }
}
