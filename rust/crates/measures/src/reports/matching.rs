//! Report paths matched to the repository's paths, three ways in order, and their lines joined across reports.
use std::collections::{HashMap, HashSet};
use std::hash::BuildHasher;

use citymap_ground_plan::fixed::compare_keys;
use citymap_ground_plan::snapshot::folder_of;
use citymap_ground_plan::workspace::is_manifest_name;

use super::report::Report;

/// Where coverage tools write their reports by default, looked for at the root and in every package folder.
pub const USUAL_REPORTS: [&str; 8] = [
    "coverage/lcov.info",
    "lcov.info",
    "coverage/coverage-final.json",
    "coverage/cobertura-coverage.xml",
    "coverage.xml",
    "cobertura.xml",
    "target/site/jacoco/jacoco.xml",
    "build/reports/jacoco/test/jacocoTestReport.xml",
];

/// A report larger than this is not read.
pub const MAX_REPORT_BYTES: usize = 256 * 1024 * 1024;

/// A report as found, and where it lies in the repository (none when it lies outside).
pub struct FoundReport {
    pub report: Report,
    pub at: Option<String>,
}

/// One file's coverage, joined over every report.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Coverage {
    pub covered: i64,
    pub executable: i64,
}

/// What matching found: each repository path's coverage, and per report how many files matched of how many.
#[derive(Debug, Default)]
pub struct Matched {
    pub files: HashMap<String, Coverage>,
    /// Per report: its files and how many matched.
    pub reports: Vec<(usize, usize)>,
}

/// The report paths to look for in a repository: the usual ones at the root and in every folder holding a manifest.
#[must_use]
pub fn report_candidates<'a>(paths: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut folders: Vec<&str> = vec![""];
    let mut seen: HashSet<&str> = HashSet::from([""]);
    for path in paths {
        let name = path.rsplit_once('/').map_or(path, |(_, n)| n);
        let folder = folder_of(path);
        if is_manifest_name(name) && seen.insert(folder) {
            folders.push(folder);
        }
    }
    folders.sort_by(|a, b| compare_keys(a, b));
    folders
        .iter()
        .flat_map(|folder| {
            USUAL_REPORTS.iter().map(move |r| {
                if folder.is_empty() {
                    (*r).to_owned()
                } else {
                    format!("{folder}/{r}")
                }
            })
        })
        .collect()
}

/// A path as segments: `\` as `/`, `file://` dropped, `.` dropped, `..` folding into its parent; and whether absolute.
fn segments_of(path: &str) -> (Vec<String>, bool) {
    let text = path.replace('\\', "/");
    let text = text.strip_prefix("file://").unwrap_or(&text);
    let bytes = text.as_bytes();
    let absolute = text.starts_with('/')
        || (bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/');
    let mut segments: Vec<String> = Vec::new();
    for segment in text.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            _ => segments.push(segment.to_owned()),
        }
    }
    (segments, absolute)
}

/// Every folder from `folder` up to the root, deepest first.
fn bases_of(folder: &str) -> Vec<String> {
    let mut bases = Vec::new();
    let mut f = folder;
    while !f.is_empty() {
        bases.push(f.to_owned());
        f = folder_of(f);
    }
    bases.push(String::new());
    bases
}

fn join(base: &str, rest: &str) -> String {
    if base.is_empty() {
        rest.to_owned()
    } else {
        format!("{base}/{rest}")
    }
}

/// Matches report paths to the repository's paths: joined to the report's folders, by ending, or as an ending.
struct Matcher<'a, S> {
    paths: &'a HashSet<String, S>,
    endings: Option<HashMap<String, Vec<&'a str>>>,
}

impl<'a, S: BuildHasher> Matcher<'a, S> {
    /// Repository paths by every ending of theirs, at segment boundaries; built when first asked.
    fn by_ending(&mut self) -> &HashMap<String, Vec<&'a str>> {
        let paths = self.paths;
        self.endings.get_or_insert_with(|| {
            let mut endings: HashMap<String, Vec<&'a str>> = HashMap::new();
            for path in paths {
                let segments: Vec<&str> = path.split('/').collect();
                for i in 1..segments.len() {
                    endings.entry(segments[i..].join("/")).or_default().push(path);
                }
            }
            endings
        })
    }

    fn matched(&mut self, written: &str, bases: &[String]) -> Option<String> {
        let (segments, absolute) = segments_of(written);
        if segments.is_empty() {
            return None;
        }
        let whole = segments.join("/");
        if !absolute {
            for base in bases {
                let joined = join(base, &whole);
                if self.paths.contains(&joined) {
                    return Some(joined);
                }
            }
        }
        for i in 0..segments.len() {
            let ending = segments[i..].join("/");
            if self.paths.contains(&ending) {
                return Some(ending);
            }
        }
        let ending: Vec<&str> = self.by_ending().get(&whole).cloned().unwrap_or_default();
        if ending.len() == 1 {
            return Some(ending[0].to_owned());
        }
        for base in bases {
            if base.is_empty() {
                break;
            }
            let prefix = format!("{base}/");
            let under: Vec<&&str> = ending.iter().filter(|p| p.starts_with(&prefix)).collect();
            match under.len() {
                1 => return Some((*under[0]).to_owned()),
                0 => {}
                _ => return None,
            }
        }
        None
    }
}

/// The repository paths' coverage from the reports: lines joined across reports, unmatched paths counted.
#[must_use]
pub fn match_reports<S: BuildHasher>(found: &[FoundReport], paths: &HashSet<String, S>) -> Matched {
    let mut matcher = Matcher { paths, endings: None };
    let mut lines: HashMap<String, HashMap<i64, i64>> = HashMap::new();
    let mut reports = Vec::new();
    for FoundReport { report, at } in found {
        let bases = at
            .as_deref()
            .map_or_else(|| vec![String::new()], |at| bases_of(folder_of(at)));
        let mut matched = 0;
        for file in &report.files {
            // Cobertura's files are relative to its roots: each root joined first, then the path as written.
            let written = report
                .roots
                .iter()
                .map(|root| join(root, &file.path))
                .chain(std::iter::once(file.path.clone()));
            let Some(path) = written.into_iter().find_map(|form| matcher.matched(&form, &bases)) else {
                continue;
            };
            matched += 1;
            let joined = lines.entry(path).or_default();
            for (line, hits) in &file.lines {
                let count = joined.entry(*line).or_insert(0);
                *count = (*count).max(*hits);
            }
        }
        reports.push((report.files.len(), matched));
    }
    let files = lines
        .into_iter()
        .map(|(path, joined)| {
            let covered = joined.values().filter(|h| **h > 0).count();
            let coverage = Coverage {
                covered: i64::try_from(covered).unwrap_or(i64::MAX),
                executable: i64::try_from(joined.len()).unwrap_or(i64::MAX),
            };
            (path, coverage)
        })
        .collect();
    Matched { files, reports }
}

#[cfg(test)]
mod tests {
    use super::super::report::{ReportFile, ReportFormat};
    use super::*;

    fn file(path: &str, hits: &[i64]) -> ReportFile {
        ReportFile {
            path: path.to_owned(),
            lines: hits
                .iter()
                .enumerate()
                .map(|(i, h)| (i64::try_from(i).unwrap() + 1, *h))
                .collect(),
        }
    }
    fn report(format: ReportFormat, roots: &[&str], files: Vec<ReportFile>) -> Report {
        Report {
            format,
            roots: roots.iter().map(|r| (*r).to_owned()).collect(),
            files,
        }
    }
    fn found(report: Report, at: Option<&str>) -> FoundReport {
        FoundReport {
            report,
            at: at.map(str::to_owned),
        }
    }
    fn paths() -> HashSet<String> {
        [
            "src/a.ts",
            "packages/x/src/index.ts",
            "packages/y/src/index.ts",
            "src/main/java/com/x/Foo.java",
            "pkg/b.py",
            "a.ts",
        ]
        .iter()
        .map(|p| (*p).to_owned())
        .collect()
    }
    fn keys(matched: &Matched) -> Vec<&str> {
        let mut keys: Vec<&str> = matched.files.keys().map(String::as_str).collect();
        keys.sort_unstable();
        keys
    }

    #[test]
    fn looks_at_the_root_and_in_every_folder_holding_a_manifest() {
        let candidates = report_candidates([
            "package.json",
            "packages/x/package.json",
            "packages/x/src/a.ts",
            "x/a.csproj",
        ]);
        assert_eq!(candidates.len(), 3 * USUAL_REPORTS.len());
        assert_eq!(&candidates[..2], &["coverage/lcov.info", "lcov.info"]);
        assert!(candidates.contains(&"packages/x/coverage/lcov.info".to_owned()));
        assert!(candidates.contains(&"x/build/reports/jacoco/test/jacocoTestReport.xml".to_owned()));
    }

    #[test]
    fn matches_relative_absolute_and_ending_paths() {
        let paths = paths();
        let relative = match_reports(
            &[found(
                report(ReportFormat::Lcov, &[], vec![file("src/index.ts", &[1, 0])]),
                Some("packages/x/coverage/lcov.info"),
            )],
            &paths,
        );
        assert_eq!(
            relative.files.get("packages/x/src/index.ts"),
            Some(&Coverage {
                covered: 1,
                executable: 2
            })
        );
        assert_eq!(relative.reports, vec![(1, 1)]);
        let absolute = match_reports(
            &[found(
                report(
                    ReportFormat::Lcov,
                    &[],
                    vec![
                        file("/home/ci/work/repo/src/a.ts", &[1]),
                        file("C:\\ci\\repo\\pkg\\.\\x\\..\\b.py", &[0]),
                        file("file:///ci/a.ts", &[2]),
                    ],
                ),
                None,
            )],
            &paths,
        );
        assert_eq!(keys(&absolute), vec!["a.ts", "pkg/b.py", "src/a.ts"]);
        let jacoco = report(
            ReportFormat::Jacoco,
            &[],
            vec![file("com/x/Foo.java", &[1]), file("x/Foo.java", &[1])],
        );
        assert_eq!(
            keys(&match_reports(
                &[found(jacoco, Some("target/site/jacoco/jacoco.xml"))],
                &paths
            )),
            vec!["src/main/java/com/x/Foo.java"]
        );
        let twice = || report(ReportFormat::Lcov, &[], vec![file("index.ts", &[1])]);
        assert!(match_reports(&[found(twice(), None)], &paths).files.is_empty());
        assert!(
            match_reports(&[found(twice(), Some("lcov.info"))], &paths)
                .files
                .is_empty()
        );
        assert!(
            match_reports(&[found(twice(), Some("zzz/lcov.info"))], &paths)
                .files
                .is_empty()
        );
        assert_eq!(
            keys(&match_reports(&[found(twice(), Some("packages/y/lcov.info"))], &paths)),
            vec!["packages/y/src/index.ts"]
        );
        let deeper: HashSet<String> = ["a/b/x/index.ts", "a/b/y/index.ts", "a/c/index.ts"]
            .iter()
            .map(|p| (*p).to_owned())
            .collect();
        assert!(
            match_reports(&[found(twice(), Some("a/lcov.info"))], &deeper)
                .files
                .is_empty()
        );
    }

    #[test]
    fn tries_cobertura_roots_first_and_joins_lines_across_reports() {
        let paths = paths();
        let cobertura = report(
            ReportFormat::Cobertura,
            &["/ci/repo/pkg", "."],
            vec![file("b.py", &[1]), file("a.ts", &[0])],
        );
        let matched = match_reports(&[found(cobertura, Some("coverage.xml"))], &paths);
        assert_eq!(
            matched.files.get("pkg/b.py"),
            Some(&Coverage {
                covered: 1,
                executable: 1
            })
        );
        assert_eq!(
            matched.files.get("a.ts"),
            Some(&Coverage {
                covered: 0,
                executable: 1
            })
        );
        let joined = match_reports(
            &[
                found(
                    report(
                        ReportFormat::Lcov,
                        &[],
                        vec![file("src/a.ts", &[0, 1, 0]), file("nowhere.ts", &[1]), file("", &[1])],
                    ),
                    None,
                ),
                found(
                    report(ReportFormat::Lcov, &[], vec![file("/x/src/a.ts", &[2, 0])]),
                    None,
                ),
            ],
            &paths,
        );
        assert_eq!(
            joined.files.get("src/a.ts"),
            Some(&Coverage {
                covered: 2,
                executable: 3
            })
        );
        assert_eq!(joined.reports, vec![(3, 1), (1, 1)]);
    }
}
