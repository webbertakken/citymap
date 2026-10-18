//! Tested by name: a source file counts as tested when a test file's name says it tests it, by the conventions of its
//! language. A proxy, found from paths alone; tests inside a file are not knowable this way.
use std::collections::{HashMap, HashSet};

use citymap_ground_plan::land_use::{LandUse, classify_land_use};
use citymap_ground_plan::snapshot::folder_of;

use crate::language::name_parts;

/// A family's markers: suffixes for any land use, prefixes for tests only.
struct Family {
    name: &'static str,
    extensions: &'static [&'static str],
    suffixes: &'static [&'static str],
    prefixes: &'static [&'static str],
}

const FAMILIES: &[Family] = &[
    Family {
        name: "js",
        extensions: &["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "vue", "svelte"],
        suffixes: &[
            ".test", ".spec", ".tests", ".e2e", ".unit", "-test", "-spec", "_test", "_spec",
        ],
        prefixes: &[],
    },
    Family {
        name: "py",
        extensions: &["py"],
        suffixes: &["_test", "_tests"],
        prefixes: &["test_"],
    },
    Family {
        name: "go",
        extensions: &["go"],
        suffixes: &["_test"],
        prefixes: &[],
    },
    Family {
        name: "jvm",
        extensions: &["java", "kt", "kts", "scala", "groovy"],
        suffixes: &["Test", "Tests", "IT", "Spec"],
        prefixes: &["Test"],
    },
    Family {
        name: "rs",
        extensions: &["rs"],
        suffixes: &["_test", "_tests"],
        prefixes: &[],
    },
    Family {
        name: "rb",
        extensions: &["rb"],
        suffixes: &["_spec", "_test"],
        prefixes: &["test_"],
    },
    Family {
        name: "cs",
        extensions: &["cs"],
        suffixes: &["Test", "Tests"],
        prefixes: &[],
    },
    Family {
        name: "php",
        extensions: &["php"],
        suffixes: &["Test"],
        prefixes: &[],
    },
    Family {
        name: "c",
        extensions: &["c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx", "m", "mm"],
        suffixes: &["_test", "_unittest", "_tests"],
        prefixes: &["test_"],
    },
    Family {
        name: "swift",
        extensions: &["swift"],
        suffixes: &["Test", "Tests"],
        prefixes: &[],
    },
    Family {
        name: "dart",
        extensions: &["dart"],
        suffixes: &["_test"],
        prefixes: &[],
    },
    Family {
        name: "ex",
        extensions: &["ex", "exs"],
        suffixes: &["_test"],
        prefixes: &[],
    },
];

/// Folders that hold tests: a test file inside one names its own stem.
const TEST_FOLDERS: &[&str] = &["test", "tests", "__tests__", "__test__", "spec", "specs", "testing"];
/// Folders left out when a test's folder is compared with a source's, besides the test folders.
const SOURCE_FOLDERS: &[&str] = &["src", "lib", "main", "source", "unit", "integration"];

fn family_of(path: &str) -> Option<&'static Family> {
    let ext = name_parts(path).2.to_ascii_lowercase();
    FAMILIES.iter().find(|f| f.extensions.contains(&ext.as_str()))
}

fn is_test_folder(segment: &str) -> bool {
    TEST_FOLDERS.contains(&segment.to_ascii_lowercase().as_str())
}

/// A folder with its source and test folders left out.
fn reduced(folder: &str) -> String {
    folder
        .split('/')
        .filter(|s| {
            let lower = s.to_ascii_lowercase();
            !s.is_empty() && !TEST_FOLDERS.contains(&lower.as_str()) && !SOURCE_FOLDERS.contains(&lower.as_str())
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// A folder's endings at segment boundaries, itself and the empty one included.
fn endings_of(folder: &str) -> Vec<String> {
    let segments: Vec<&str> = if folder.is_empty() {
        vec![]
    } else {
        folder.split('/').collect()
    };
    let mut out: Vec<String> = (0..segments.len()).map(|i| segments[i..].join("/")).collect();
    out.push(String::new());
    out
}

/// The stems a test file names: its markers stripped, and its own stem inside a test folder.
fn stems_named(path: &str, family: &Family) -> Vec<String> {
    let stem = name_parts(path).1;
    let mut stems = Vec::new();
    for suffix in family.suffixes {
        if stem != *suffix
            && let Some(rest) = stem.strip_suffix(suffix)
        {
            stems.push(rest.to_owned());
        }
    }
    if classify_land_use(path) == LandUse::Tests {
        for prefix in family.prefixes {
            if stem != *prefix
                && let Some(rest) = stem.strip_prefix(prefix)
            {
                stems.push(rest.to_owned());
            }
        }
        if folder_of(path).split('/').any(is_test_folder) {
            stems.push(stem.to_owned());
        }
    }
    stems
}

/// What test files name: per family and stem, the folders that name it, and every ending of those folders.
#[derive(Debug, Default)]
pub struct TestNames {
    folders: HashMap<String, HashSet<String>>,
    endings: HashMap<String, HashSet<String>>,
}

/// Every stem the test files among the paths name, with the folders that name it.
pub fn test_names<'a>(paths: impl IntoIterator<Item = &'a str>) -> TestNames {
    let mut names = TestNames::default();
    for path in paths {
        let Some(family) = family_of(path) else { continue };
        if matches!(
            classify_land_use(path),
            LandUse::Vendored | LandUse::Generated | LandUse::Fixtures
        ) {
            continue;
        }
        let folder = reduced(folder_of(path));
        for stem in stems_named(path, family) {
            let key = format!("{}|{stem}", family.name);
            names.folders.entry(key.clone()).or_default().insert(folder.clone());
            names.endings.entry(key).or_default().extend(endings_of(&folder));
        }
    }
    names
}

/// Whether a test names a source file: the same family and stem, and either folder (source and test folders left out)
/// ends the other. None for a path that is not a source file of a known family: it is not judged.
#[must_use]
pub fn named_by(names: &TestNames, path: &str) -> Option<bool> {
    let family = family_of(path)?;
    if classify_land_use(path) != LandUse::Source {
        return None;
    }
    let key = format!("{}|{}", family.name, name_parts(path).1);
    let folder = reduced(folder_of(path));
    if let Some(named) = names.folders.get(&key)
        && endings_of(&folder).iter().any(|e| named.contains(e))
    {
        return Some(true);
    }
    Some(names.endings.get(&key).is_some_and(|e| e.contains(&folder)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn verdicts(paths: &[&str], sources: &[&str]) -> Vec<Option<bool>> {
        let names = test_names(paths.iter().copied());
        sources.iter().map(|s| named_by(&names, s)).collect()
    }

    #[test]
    fn finds_tests_beside_a_file_in_tests_folders_and_by_each_languages_markers() {
        let paths = [
            "src/a.test.ts",
            "src/a.spec.ts",
            "src/b.spec.tsx",
            "src/__tests__/c.ts",
            "lib/d-test.js",
            "pkg/test_e.py",
            "pkg/f_test.py",
            "cmd/g_test.go",
            "src/main/java/x/HTest.java",
            "src/test/java/x/TestI.java",
            "tests/j.rs",
            "spec/k_spec.rb",
            "Tests/LTests.cs",
            "tests/MTest.php",
            "src/n_unittest.cc",
            "Tests/OTests.swift",
            "test/p_test.dart",
            "test/q_test.exs",
        ];
        let sources = [
            "src/a.ts",
            "src/b.tsx",
            "src/c.ts",
            "lib/d.js",
            "pkg/e.py",
            "pkg/f.py",
            "cmd/g.go",
            "src/main/java/x/H.java",
            "src/main/java/x/I.java",
            "src/j.rs",
            "lib/k.rb",
            "L.cs",
            "src/M.php",
            "src/n.cc",
            "Sources/O.swift",
            "lib/p.dart",
            "lib/q.ex",
        ];
        assert!(verdicts(&paths, &sources).iter().all(|v| *v == Some(true)));
    }

    #[test]
    fn finds_mirrored_and_flat_test_trees() {
        let paths = [
            "tests/components/x/test_sensor.py",
            "tests/test_util.py",
            "test/utils/fmt.spec.ts",
        ];
        assert_eq!(
            verdicts(
                &paths,
                &[
                    "homeassistant/components/x/sensor.py",
                    "homeassistant/components/y/sensor.py",
                    "any/where/util.py",
                    "src/utils/fmt.ts",
                    "src/other/fmt.ts",
                ]
            ),
            vec![Some(true), Some(false), Some(true), Some(true), Some(false)]
        );
        assert_eq!(verdicts(&["tests/deep/x/a_test.go"], &["x/a.go"]), vec![Some(true)]);
    }

    #[test]
    fn keeps_markers_to_their_family_and_prefixes_to_tests() {
        let paths = [
            "src/a.test.py",
            "src/TestUtils.java",
            "src/b_test.go",
            "test/Test.java",
            "src/c.test.ts",
        ];
        assert_eq!(
            verdicts(
                &paths,
                &["src/a.py", "src/Utils.java", "src/b.ts", "src/.java", "src/c.js"]
            ),
            vec![Some(false), Some(false), Some(false), None, Some(true)]
        );
    }

    #[test]
    fn ignores_fixtures_vendored_and_generated_files_and_judges_only_sources() {
        let paths = ["tests/fixtures/a.ts", "vendor/b.test.ts", "dist/c.test.ts"];
        assert_eq!(
            verdicts(&paths, &["src/a.ts", "src/b.ts", "src/c.ts"]),
            vec![Some(false); 3]
        );
        assert_eq!(
            verdicts(
                &["README.test.md"],
                &["README.md", "config.json", "src/a.test.ts", "Makefile"]
            ),
            vec![None; 4]
        );
    }
}
