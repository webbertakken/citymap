//! The city's measures as the CLI reads them: the laid commit's contents, its history, and coverage reports, joined to
//! the lots the fold left. The layout is laid before and never read back, so it is the same with or without them.
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

use citymap_ground_plan::city::City;
use citymap_ground_plan::plat::Plat;
use citymap_ground_plan::snapshot::Snapshot;
use citymap_ground_plan::{CitymapError, ErrorCode, Result};
use citymap_history::{FileHistory, list_tree, read_blobs};
use citymap_measures::{
    FileMeasures, FoundReport, MAX_REPORT_BYTES, Measures, MeasuresInput, TestNames, TextFacts, build_measures,
    count_text, lot_files, match_reports, named_by, parse_report, report_candidates, test_names,
};

use crate::run::Io;

/// A report named on the command line or found at a usual path: what to call it in logs, and the report.
pub struct NamedReport {
    pub name: String,
    pub found: FoundReport,
}

/// A path made absolute and normalised lexically, `..` folding into its parent, as Node's `path.resolve` does.
fn resolved(path: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for component in std::path::absolute(path).ok()?.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other),
        }
    }
    Some(out)
}

/// Where a file named on the command line lies in the repository, or none when outside it.
fn inside(repo: &Path, file: &str) -> Option<String> {
    let absolute = resolved(Path::new(file))?;
    let relative = absolute.strip_prefix(resolved(repo)?).ok()?;
    if relative.as_os_str().is_empty() || relative.components().any(|c| !matches!(c, Component::Normal(_))) {
        return None;
    }
    Some(relative.to_string_lossy().replace('\\', "/"))
}

/// Reads the reports `--coverage` names: a missing one is `coverage/missing`, an unreadable one `coverage/unreadable`.
pub fn read_named_reports(repo: &Path, files: &[String], io: &dyn Io) -> Result<Vec<NamedReport>> {
    files
        .iter()
        .map(|name| {
            let Some(text) = io.read_file(Path::new(name)) else {
                return Err(
                    CitymapError::new(ErrorCode::CoverageMissing, format!("{name} does not exist")).with("name", name),
                );
            };
            if text.len() > MAX_REPORT_BYTES {
                return Err(CitymapError::new(
                    ErrorCode::CoverageUnreadable,
                    format!("{name} is larger than {MAX_REPORT_BYTES} bytes"),
                )
                .with("name", name));
            }
            Ok(NamedReport {
                name: name.clone(),
                found: FoundReport {
                    report: parse_report(&text, name)?,
                    at: inside(repo, name),
                },
            })
        })
        .collect()
}

/// The reports at the usual paths of the working tree; one that cannot be read is skipped, and said so.
fn usual_reports(repo: &Path, paths: &[String], io: &mut dyn Io) -> Vec<NamedReport> {
    let mut found = Vec::new();
    for candidate in report_candidates(paths.iter().map(String::as_str)) {
        let Some(text) = io.read_file(&repo.join(&candidate)) else {
            continue;
        };
        if text.len() > MAX_REPORT_BYTES {
            io.log(&format!("measures/report-skipped path={candidate} reason=too-large"));
            continue;
        }
        match parse_report(&text, &candidate) {
            Ok(report) => found.push(NamedReport {
                name: candidate.clone(),
                found: FoundReport {
                    report,
                    at: Some(candidate),
                },
            }),
            Err(_) => io.log(&format!("measures/report-skipped path={candidate} reason=unreadable")),
        }
    }
    found
}

/// What the measures are read from.
pub struct MeasureInput<'a> {
    pub repo: &'a Path,
    pub target: &'a str,
    pub city: &'a City,
    pub plat: &'a Plat,
    /// The last snapshot laid: the target's files, by identity.
    pub snapshot: &'a Snapshot,
    /// The history read by the fold; none for a single state.
    pub history: Option<&'a FileHistory>,
    /// Reports named by `--coverage`; empty to look at the usual paths.
    pub named: Vec<NamedReport>,
}

/// The city's measures: contents, tests by name or coverage, history, per lot.
pub fn measure_city(input: MeasureInput, io: &mut dyn Io) -> Result<Measures> {
    let MeasureInput {
        repo,
        target,
        city,
        plat,
        snapshot,
        history,
        named,
    } = input;
    let tree = list_tree(repo, target)?;
    let paths: Vec<String> = tree.iter().map(|f| f.path.clone()).collect();
    let mut by_blob: HashMap<&str, Vec<&str>> = HashMap::new();
    for file in &tree {
        by_blob.entry(&file.blob).or_default().push(&file.path);
    }
    let mut text: HashMap<String, TextFacts> = HashMap::new();
    read_blobs(repo, &tree, &mut |blob, bytes| {
        if let Some(bytes) = bytes {
            for path in &by_blob[blob] {
                text.insert((*path).to_owned(), count_text(bytes, path));
            }
        }
    })?;

    let reports = if named.is_empty() {
        usual_reports(repo, &paths, io)
    } else {
        named
    };
    let found: Vec<FoundReport> = reports
        .iter()
        .map(|r| FoundReport {
            report: r.found.report.clone(),
            at: r.found.at.clone(),
        })
        .collect();
    let path_set: HashSet<String> = paths.iter().cloned().collect();
    let matched = match_reports(&found, &path_set);
    for (report, (files, hits)) in reports.iter().zip(&matched.reports) {
        io.log(&format!(
            "measures/report path={} format={} files={files} matched={hits}",
            report.name,
            report.found.report.format.as_str()
        ));
    }
    let tested = if matched.files.is_empty() { "name" } else { "coverage" };
    let names: Option<TestNames> = (tested == "name").then(|| test_names(paths.iter().map(String::as_str)));
    let identity_of: HashMap<&str, &str> = snapshot.files.iter().map(|f| (&*f.path, &*f.identity)).collect();
    let lots = lot_files(city, plat, &snapshot.files);

    // Every lot's file is one of the last snapshot's, so its identity is known.
    let facts_of = |path: &str| {
        let own = text.get(path).copied().unwrap_or_default();
        let coverage = matched.files.get(path);
        let changes = history.and_then(|h| h.of(identity_of[path]));
        FileMeasures {
            bytes: text.get(path).map(|t| t.bytes),
            lines: own.lines,
            comments: own.comments,
            todos: own.todos,
            covered: coverage.map(|c| c.covered),
            executable: coverage.map(|c| c.executable),
            named: names.as_ref().and_then(|n| named_by(n, path)),
            changed: changes.map(|c| c.changed),
            commits: changes.map(|c| c.commits),
            authors: changes.and_then(|c| c.authors),
            ..FileMeasures::default()
        }
    };
    // The people, when the history was read and its laid commit's .mailmap could be.
    let people = history.filter(|h| h.authors_known());
    let across =
        |files: &[String]| people.and_then(|h| h.authors_across(files.iter().map(|p| identity_of[p.as_str()])));
    let measures = build_measures(&MeasuresInput {
        source: "cli",
        size: "lines",
        history: history.is_some(),
        authors: people.is_some(),
        comments: true,
        tested,
        lots: &lots,
        facts_of: &facts_of,
        authors_across: people.is_some().then_some(&across as &dyn Fn(&[String]) -> Option<i64>),
        submodules: snapshot.submodules.as_deref().map_or(&[], Vec::as_slice),
    });
    // What the section holds: an old town's repeated lot key counts once, as it is written once.
    let (lot_count, files) = measures.counts();
    io.log(&format!(
        "measures/done source=cli size=lines tested={tested} lots={lot_count} files={files} read={} unread={}",
        text.len(),
        tree.len() - text.len()
    ));
    Ok(measures)
}
