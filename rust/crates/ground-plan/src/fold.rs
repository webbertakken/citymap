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
    use crate::region::separate::DEFAULT_SEPARATIONS;
    use crate::snapshot::FileEntry;
    use crate::toggles::{DEFAULT_TOGGLES, TOGGLES, Toggle};
    use crate::town::context::{Jog, Order};

    fn snapshots(value: &serde_json::Value) -> Vec<Snapshot> {
        value["snapshots"]
            .as_array()
            .expect("snapshots")
            .iter()
            .map(|s| Snapshot {
                manifests: None,
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
                submodules: None,
            })
            .collect()
    }

    /// The fold fixtures: every toggle off, the defaults, and all four.
    const FIXTURES: [(&str, &[Toggle]); 3] = [
        (include_str!("../../../fixtures/fold.json"), &[]),
        (include_str!("../../../fixtures/fold-defaults.json"), &DEFAULT_TOGGLES),
        (include_str!("../../../fixtures/fold-all.json"), &TOGGLES),
    ];

    fn fold(cache: bool) {
        for (text, toggles) in FIXTURES {
            fold_one(text, toggles, cache);
        }
    }

    fn fold_one(text: &str, toggles: &[Toggle], cache: bool) {
        let fixture: serde_json::Value = serde_json::from_str(text).expect("the fold fixture");
        let options = Options {
            density_pct: 50,
            land_uses: default_land_uses(),
            order: Order::CentreOut,
            jog: Jog::TopLevel,
            warp: true,
            loops: true,
            separate: DEFAULT_SEPARATIONS.to_vec(),
            toggles: toggles.to_vec(),
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

#[cfg(test)]
mod resume {
    use std::collections::HashMap;
    use std::sync::Arc;

    use indexmap::IndexMap;

    use super::*;
    use crate::fixed::compare_keys;
    use crate::json::canonical_json;
    use crate::land_use::default_land_uses;
    use crate::lock::{Lockfile, parse_lock, serialise_lock};
    use crate::plat::serialise_plat;
    use crate::region::compose::lay_city;
    use crate::region::separate::DEFAULT_SEPARATIONS;
    use crate::snapshot::FileEntry;
    use crate::toggles::DEFAULT_TOGGLES;
    use crate::town::context::{Jog, Order};

    /// The TypeScript test's deterministic history: files arrive in folders (new folders too) and some are deleted.
    fn history(commits: usize) -> Vec<Snapshot> {
        let mut seed: u32 = 12345;
        let mut next = || {
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
            f64::from(seed) / 4_294_967_296.0
        };
        let mut folders: Vec<String> = [
            "src/core",
            "src/ui",
            "lib",
            "docs",
            "tools",
            "src/ui/forms",
            "pkg/a",
            "pkg/b",
        ]
        .map(str::to_owned)
        .to_vec();
        let mut live: IndexMap<String, FileEntry> = IndexMap::new();
        let mut out = Vec::new();
        for c in 0..commits {
            if c % 15 == 14 {
                folders.push(format!("late/f{c}"));
            }
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let adds = (next() * 40.0).floor() as usize;
            for k in 0..adds {
                #[allow(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    clippy::cast_precision_loss
                )]
                let folder = folders[(next() * folders.len() as f64).floor() as usize].clone();
                let ext = if next() < 0.2 {
                    "json"
                } else if next() < 0.1 {
                    "md"
                } else {
                    "ts"
                };
                let path = format!("{folder}/m{c}-{k}.{ext}");
                let index = i64::try_from(c).expect("an index");
                live.insert(path.clone(), FileEntry::new(&path, &format!("{path}@{c}"), index));
            }
            if c % 7 == 6 {
                let gone: Vec<String> = live.keys().filter(|_| next() < 0.15).cloned().collect();
                for path in gone {
                    live.shift_remove(&path);
                }
            }
            let mut files: Vec<FileEntry> = live.values().cloned().collect();
            files.sort_by(|a, b| compare_keys(&a.path, &b.path));
            out.push(Snapshot {
                manifests: None,
                repository: "demo".into(),
                commit: "worktree".into(),
                index: i64::try_from(c).expect("an index"),
                files: Arc::new(files),
                folder_first_seen: Arc::new(HashMap::new()),
                workspaces: None,
                submodules: None,
            });
        }
        out
    }

    fn options() -> Options {
        Options {
            density_pct: 50,
            land_uses: default_land_uses(),
            order: Order::CentreOut,
            jog: Jog::TopLevel,
            warp: false,
            loops: true,
            separate: DEFAULT_SEPARATIONS.to_vec(),
            toggles: DEFAULT_TOGGLES.to_vec(),
        }
    }

    /// A lockfile of the plat at `index`, read back: the same records, in the lock's (sorted) key order.
    fn read_back(plat: &Plat, index: i64) -> Plat {
        let lock = Lockfile {
            commit: "0".repeat(40),
            index,
            plat: plat.clone(),
        };
        parse_lock(&serialise_lock(&lock).expect("json")).expect("a lock").plat
    }

    #[test]
    fn lays_the_lock_s_own_commit_again_into_the_same_city_from_a_plat_read_back_from_a_lockfile() {
        let options = options();
        let mut state = initial_state(&options, None, true);
        for snapshot in history(40) {
            let (city, _) = lay_city(&snapshot, &mut state, &options).expect("a lay");
            let mut resumed = initial_state(&options, Some(read_back(&state.plat, snapshot.index)), true);
            let (again, _) = lay_city(&snapshot, &mut resumed, &options).expect("a lay");
            assert_eq!(
                canonical_json(&again).expect("json"),
                canonical_json(&city).expect("json"),
                "commit {}",
                snapshot.index
            );
            assert_eq!(
                serialise_plat(&resumed.plat).expect("json"),
                serialise_plat(&state.plat).expect("json")
            );
        }
    }

    #[test]
    fn writes_the_same_lock_as_the_uninterrupted_fold_from_a_lock_saved_at_any_commit() {
        let options = options();
        let steps = history(30);
        let mut state = initial_state(&options, None, true);
        let mut plats = Vec::new();
        for snapshot in &steps {
            lay(snapshot, &mut state, &options).expect("a lay");
            plats.push(state.plat.clone());
        }
        let end = serialise_plat(&state.plat).expect("json");
        for saved in [3, 9, 16, 22, 27] {
            // As the CLI resumes: the lock's plat, its own commit laid again, then the rest of the history.
            let index = i64::try_from(saved).expect("an index");
            let mut resumed = initial_state(&options, Some(read_back(&plats[saved], index)), true);
            for snapshot in &steps[saved..] {
                lay(snapshot, &mut resumed, &options).expect("a lay");
            }
            assert_eq!(serialise_plat(&resumed.plat).expect("json"), end, "resumed at {saved}");
        }
    }

    #[test]
    fn holds_only_the_towns_the_last_lay_laid_so_a_re_laid_commit_rebuilds_them_exactly() {
        let options = options();
        let source = crate::testing::files("src", 12, 0, "ts", "f");
        let tests = crate::testing::files("test", 12, 0, "test.ts", "f");
        let mut state = initial_state(&options, None, true);
        let both: Vec<FileEntry> = source.iter().chain(&tests).cloned().collect();
        lay(&crate::testing::snapshot_of(&both), &mut state, &options).expect("a lay");
        assert_eq!(state.last.keys().collect::<Vec<_>>(), ["demo"]);
        // Only tests are left: they take no land, so the town has none and is not laid.
        let (city, _) = lay_city(&crate::testing::snapshot_of(&tests), &mut state, &options).expect("a lay");
        assert_eq!(city.towns.len(), 0);
        assert_eq!(state.last.len(), 0);
    }
}
