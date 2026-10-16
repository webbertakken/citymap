//! The fold: a history of snapshots, oldest first, laid one by one into the plat.
use crate::city::City;
use crate::error::Result;
use crate::plat::Plat;
use crate::region::compose::{FoldState, Options, current_city, lay, setting_key};
use crate::snapshot::Snapshot;
use crate::town::context::PlatEvent;

/// A fold's first state: an empty plat for the options' setting, or a lockfile's plat; with a locality cache.
#[must_use]
pub fn initial_state(options: &Options, plat: Option<Plat>, cache: bool) -> FoldState {
    FoldState::new(plat.unwrap_or_else(|| Plat::empty(&setting_key(options))), cache)
}

/// Folds a history of snapshots, oldest first, into the last city; events go to the listener.
pub fn fold_history(
    snapshots: impl IntoIterator<Item = Snapshot>,
    options: &Options,
    state: &mut FoldState,
    mut listen: impl FnMut(&Snapshot, &[PlatEvent]),
) -> Result<Option<City>> {
    let mut laid = false;
    for snapshot in snapshots {
        let events = lay(&snapshot, state, options)?;
        listen(&snapshot, &events);
        laid = true;
    }
    if laid {
        current_city(state, options).map(Some)
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod parity {
    use std::collections::HashMap;
    use std::sync::Arc;

    use super::*;
    use crate::json::canonical_json;
    use crate::land_use::default_land_uses;
    use crate::plat::serialise_plat;
    use crate::snapshot::FileEntry;
    use crate::town::context::{Jog, Order};

    fn snapshots(value: &serde_json::Value) -> Vec<Snapshot> {
        value["snapshots"]
            .as_array()
            .expect("snapshots")
            .iter()
            .map(|s| Snapshot {
                repository: s["repository"].as_str().expect("repository").to_owned(),
                commit: s["commit"].as_str().expect("commit").to_owned(),
                index: s["index"].as_i64().expect("index"),
                files: Arc::new(
                    s["files"]
                        .as_array()
                        .expect("files")
                        .iter()
                        .map(|f| {
                            FileEntry::new(
                                f["path"].as_str().expect("path"),
                                f["identity"].as_str().expect("identity"),
                                f["firstSeen"].as_i64().expect("firstSeen"),
                            )
                        })
                        .collect(),
                ),
                folder_first_seen: Arc::new(
                    s["folderFirstSeen"]
                        .as_object()
                        .expect("folders")
                        .iter()
                        .map(|(k, v)| (k.clone(), v.as_i64().expect("index")))
                        .collect::<HashMap<_, _>>(),
                ),
                workspaces: None,
            })
            .collect()
    }

    fn fold(cache: bool) {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/fold.json")).expect("the fold fixture");
        let options = Options {
            density_pct: 50,
            land_uses: default_land_uses(),
            order: Order::CentreOut,
            jog: Jog::TopLevel,
            warp: true,
            loops: true,
            split: vec!["apps".into()],
        };
        let mut state = initial_state(&options, None, cache);
        let expected: Vec<Vec<String>> = serde_json::from_value(fixture["events"].clone()).expect("events");
        let mut step = 0;
        let city = fold_history(snapshots(&fixture), &options, &mut state, |_, events| {
            let lines: Vec<String> = events.iter().map(PlatEvent::line).collect();
            assert_eq!(lines, expected[step], "events of snapshot {step}");
            step += 1;
        })
        .expect("the fold lays every snapshot")
        .expect("a city");
        assert_eq!(
            canonical_json(&city).expect("json"),
            fixture["city"].as_str().expect("city")
        );
        assert_eq!(
            serialise_plat(&state.plat).expect("json"),
            fixture["plat"].as_str().expect("plat")
        );
    }

    #[test]
    fn folds_a_history_as_the_typescript_engine_does() {
        fold(true);
    }

    #[test]
    fn folds_the_same_without_the_locality_cache() {
        fold(false);
    }
}
