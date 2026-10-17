//! Measures of a city's files: sizes and comments from contents, tests by name, coverage reports, and the city file's
//! section beside the layout. The Rust implementation of `packages/measures` (what the CLI writes).
pub mod by_name;
pub mod coverage;
pub mod language;
pub mod lots;
pub mod section;
pub mod text;

pub use by_name::{TestNames, named_by, test_names};
pub use coverage::matching::{
    Coverage, FoundReport, MAX_REPORT_BYTES, Matched, USUAL_REPORTS, match_reports, report_candidates,
};
pub use coverage::report::{Report, ReportFile, ReportFormat, parse_report};
pub use lots::{LotFiles, MeasuresInput, build_measures, lot_files};
pub use section::{FileMeasures, LotMeasures, MEASURES, Measures, available_for, serialise_city_file};
pub use text::{TextFacts, count_text};
