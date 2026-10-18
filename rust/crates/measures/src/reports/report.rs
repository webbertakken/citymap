//! Coverage reports already on the machine, read into the same shape whatever wrote them: each file's executable lines
//! and how often each ran. The format is told by the content, not the name.
use std::collections::HashMap;

use citymap_ground_plan::{CitymapError, ErrorCode, Result};
use serde_json::Value;

use super::xml::{XmlToken, scan_xml, trim_xml};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReportFormat {
    Lcov,
    Istanbul,
    Cobertura,
    Jacoco,
}

impl ReportFormat {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Lcov => "lcov",
            Self::Istanbul => "istanbul",
            Self::Cobertura => "cobertura",
            Self::Jacoco => "jacoco",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReportFile {
    /// The path as the report writes it.
    pub path: String,
    /// Line number to hits, for every executable line.
    pub lines: HashMap<i64, i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Report {
    pub format: ReportFormat,
    /// Cobertura's `<source>` folders, in order; empty for the other formats.
    pub roots: Vec<String>,
    pub files: Vec<ReportFile>,
}

/// The largest safe integer of a JavaScript number, the bound every count shares with the reference.
const MAX_SAFE: i64 = (1 << 53) - 1;

/// A report's files, joined by path in first-seen order, each line keeping its largest count.
#[derive(Default)]
struct Files {
    order: Vec<String>,
    by_path: HashMap<String, HashMap<i64, i64>>,
}

impl Files {
    fn add(&mut self, path: &str, line: i64, hits: i64) {
        if line < 1 {
            return;
        }
        if !self.by_path.contains_key(path) {
            self.order.push(path.to_owned());
        }
        let lines = self.by_path.entry(path.to_owned()).or_default();
        let count = lines.entry(line).or_insert(0);
        *count = (*count).max(hits);
    }

    fn done(mut self) -> Vec<ReportFile> {
        self.order
            .into_iter()
            .filter_map(|path| {
                let lines = self.by_path.remove(&path)?;
                (!lines.is_empty()).then_some(ReportFile { path, lines })
            })
            .collect()
    }
}

/// A count as written: a non-negative integer up to the largest safe one, else 0.
fn hits_of(text: Option<&str>) -> i64 {
    match text {
        Some(t) if !t.is_empty() && t.bytes().all(|b| b.is_ascii_digit()) => t
            .parse::<u64>()
            .ok()
            .and_then(|n| i64::try_from(n).ok())
            .filter(|n| *n <= MAX_SAFE)
            .unwrap_or(0),
        _ => 0,
    }
}

/// A JSON count: a non-negative safe integer, else 0.
fn count_of(value: Option<&Value>) -> i64 {
    value.and_then(safe_integer).filter(|n| *n >= 0).unwrap_or(0)
}

/// A JSON number that is a safe integer, as JavaScript reads it.
#[allow(clippy::cast_possible_truncation, clippy::cast_precision_loss)]
fn safe_integer(value: &Value) -> Option<i64> {
    let n = value.as_f64()?;
    (n.fract() == 0.0 && n.abs() <= MAX_SAFE as f64).then_some(n as i64)
}

fn unreadable(name: &str, reason: &str) -> CitymapError {
    CitymapError::new(
        ErrorCode::CoverageUnreadable,
        format!("{name} is not a coverage report this reads ({reason})"),
    )
    .with("name", &name)
    .with("reason", &reason)
}

fn lcov(text: &str) -> Report {
    let mut files = Files::default();
    let mut path: Option<&str> = None;
    for raw in text.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if let Some(sf) = line.strip_prefix("SF:") {
            path = Some(sf);
        } else if line == "end_of_record" {
            path = None;
        } else if let (Some(p), Some(da)) = (path, line.strip_prefix("DA:")) {
            let mut fields = da.split(',');
            let number = hits_of(fields.next());
            files.add(p, number, hits_of(fields.next()));
        }
    }
    Report {
        format: ReportFormat::Lcov,
        roots: vec![],
        files: files.done(),
    }
}

fn istanbul(text: &str, name: &str) -> Result<Report> {
    let parsed: Value = serde_json::from_str(text).map_err(|_| unreadable(name, "not JSON"))?;
    let object = parsed
        .as_object()
        .ok_or_else(|| unreadable(name, "not an object of files"))?;
    let mut files = Files::default();
    for (key, value) in object {
        let file = value.get("data").filter(|d| d.is_object()).unwrap_or(value);
        let path = file.get("path").and_then(Value::as_str).unwrap_or(key);
        let (Some(statements), Some(counts)) = (
            file.get("statementMap").and_then(Value::as_object),
            file.get("s").filter(|s| s.is_object()),
        ) else {
            continue;
        };
        for (id, statement) in statements {
            let Some(line) = statement
                .get("start")
                .and_then(|s| s.get("line"))
                .filter(|l| l.is_number())
            else {
                continue;
            };
            files.add(path, safe_integer(line).unwrap_or(0), count_of(counts.get(id)));
        }
    }
    Ok(Report {
        format: ReportFormat::Istanbul,
        roots: vec![],
        files: files.done(),
    })
}

fn attribute<'a>(attributes: &'a HashMap<String, String>, name: &str) -> Option<&'a str> {
    attributes.get(name).map(String::as_str)
}

fn cobertura(text: &str) -> Report {
    let mut files = Files::default();
    let mut roots = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut source: Option<String> = None;
    let mut file: Option<String> = None;
    for token in scan_xml(text) {
        match token {
            XmlToken::Text { text } => {
                if let Some(source) = source.as_mut() {
                    source.push_str(&text);
                }
            }
            XmlToken::Close { name } => {
                if name == "source"
                    && let Some(text) = source.take()
                {
                    roots.push(trim_xml(&text).to_owned());
                }
                if name == "class" {
                    file = None;
                }
                stack.pop();
            }
            XmlToken::Open {
                name,
                attributes,
                empty,
            } => {
                if name == "source" {
                    source = Some(String::new());
                }
                if name == "class" {
                    file = attribute(&attributes, "filename").map(str::to_owned);
                }
                // Lines directly in a class's <lines>, not those its methods repeat.
                let depth = stack.len();
                if name == "line"
                    && depth >= 2
                    && stack[depth - 1] == "lines"
                    && stack[depth - 2] == "class"
                    && let Some(path) = file.as_deref()
                {
                    files.add(
                        path,
                        hits_of(attribute(&attributes, "number")),
                        hits_of(attribute(&attributes, "hits")),
                    );
                }
                if !empty {
                    stack.push(name);
                } else if name == "class" {
                    file = None;
                }
            }
        }
    }
    Report {
        format: ReportFormat::Cobertura,
        roots,
        files: files.done(),
    }
}

fn jacoco(text: &str) -> Report {
    let mut files = Files::default();
    let mut pack = String::new();
    let mut file: Option<String> = None;
    for token in scan_xml(text) {
        match token {
            XmlToken::Text { .. } => {}
            XmlToken::Close { name } => {
                if name == "sourcefile" {
                    file = None;
                }
                if name == "package" {
                    pack.clear();
                }
            }
            XmlToken::Open {
                name,
                attributes,
                empty,
            } => {
                if name == "package" {
                    attribute(&attributes, "name").unwrap_or("").clone_into(&mut pack);
                }
                if name == "sourcefile" {
                    let own = attribute(&attributes, "name").unwrap_or("");
                    file = (!empty).then(|| {
                        if pack.is_empty() {
                            own.to_owned()
                        } else {
                            format!("{pack}/{own}")
                        }
                    });
                }
                if name == "line"
                    && let Some(path) = file.as_deref()
                {
                    let missed = hits_of(attribute(&attributes, "mi"));
                    let covered = hits_of(attribute(&attributes, "ci"));
                    if missed + covered > 0 {
                        files.add(path, hits_of(attribute(&attributes, "nr")), covered);
                    }
                }
            }
        }
    }
    Report {
        format: ReportFormat::Jacoco,
        roots: vec![],
        files: files.done(),
    }
}

/// The name of a document's first element, after its declaration, comments and doctype; none when none comes.
fn root_element(text: &str) -> Option<String> {
    for token in scan_xml(text) {
        match token {
            XmlToken::Open { name, .. } => return Some(name),
            XmlToken::Close { .. } => return None,
            XmlToken::Text { text } if !trim_xml(&text).is_empty() => return None,
            XmlToken::Text { .. } => {}
        }
    }
    None
}

/// A report read from its text, its format told by its content; `coverage/unreadable` when it is none of the four.
pub fn parse_report(text: &str, name: &str) -> Result<Report> {
    let body = text.strip_prefix('\u{feff}').unwrap_or(text);
    match trim_xml(body).bytes().next() {
        Some(b'{' | b'[') => return istanbul(body, name),
        Some(b'<') => {
            return match root_element(body).as_deref() {
                Some("coverage") => Ok(cobertura(body)),
                Some("report") => Ok(jacoco(body)),
                root => Err(unreadable(
                    name,
                    &format!("an XML document of <{}>", root.unwrap_or("nothing")),
                )),
            };
        }
        _ => {}
    }
    if body.starts_with("SF:") || body.contains("\nSF:") {
        return Ok(lcov(body));
    }
    Err(unreadable(name, "no format found"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines_of(report: &Report) -> Vec<(String, Vec<(i64, i64)>)> {
        report
            .files
            .iter()
            .map(|f| {
                let mut lines: Vec<(i64, i64)> = f.lines.iter().map(|(l, h)| (*l, *h)).collect();
                lines.sort_unstable();
                (f.path.clone(), lines)
            })
            .collect()
    }

    #[test]
    fn reads_lcov_records_joining_repeated_files_and_lines() {
        let text = "TN:\nSF:/ci/repo/src/a.ts\nDA:1,3\nDA:2,0\nDA:2,4,checksum\nDA:3,-1\nDA:x,1\nend_of_record\nSF:src/empty.ts\r\nend_of_record\nDA:9,9\nSF:/ci/repo/src/a.ts\nDA:4,1.5\nDA:5,99999999999999999999\nend_of_record";
        let report = parse_report(text, "lcov.info").expect("lcov");
        assert_eq!(report.format, ReportFormat::Lcov);
        assert_eq!(
            lines_of(&report),
            vec![("/ci/repo/src/a.ts".into(), vec![(1, 3), (2, 4), (3, 0), (4, 0), (5, 0)])]
        );
    }

    #[test]
    fn reads_istanbul_json_by_each_statements_first_line() {
        let text = r#"{"/ci/a.js":{"path":"/ci/a.js","statementMap":{"0":{"start":{"line":1}},"1":{"start":{"line":1}},"2":{"start":{"line":2}}},"s":{"0":0,"1":5,"2":-1}},"/ci/b.js":{"data":{"statementMap":{"0":{"start":{"line":3}},"1":{"start":{}}},"s":{"0":1.5}}},"/ci/c.js":{"path":"/ci/c.js","statementMap":{},"s":{}},"/ci/d.js":{"statementMap":null}}"#;
        let report = parse_report(&format!("\u{feff} {text}"), "coverage-final.json").expect("json");
        assert_eq!(report.format, ReportFormat::Istanbul);
        assert_eq!(
            lines_of(&report),
            vec![
                ("/ci/a.js".into(), vec![(1, 5), (2, 0)]),
                ("/ci/b.js".into(), vec![(3, 0)])
            ]
        );
        assert!(parse_report("{", "x.json").unwrap_err().message.contains("(not JSON)"));
        assert!(
            parse_report("[]", "x.json")
                .unwrap_err()
                .message
                .contains("(not an object of files)")
        );
        assert_eq!(parse_report("{}", "x.json").expect("empty").files, vec![]);
    }

    #[test]
    fn reads_cobertura_classes_own_lines_and_jacoco_source_files() {
        let cobertura = r#"<?xml version="1.0" ?>
<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">
<coverage line-rate="0.5"><sources><source>/ci/repo</source><source> src </source></sources>
<packages><package name="p"><classes>
  <class name="A" filename="pkg/a.py"><methods><method name="m"><lines><line number="9" hits="7"/></lines></method></methods>
    <lines><line number="1" hits="1"/><line number="2" hits="0" branch="true"><conditions><condition/></conditions></line></lines>
  </class>
  <class name="A$Inner" filename="pkg/a.py"><lines><line number="2" hits="3"/></lines></class>
  <class name="Empty" filename="pkg/b.py"/>
  <class name="Nameless"><lines><line number="1" hits="1"/></lines></class>
</classes></package></packages></coverage>"#;
        let report = parse_report(cobertura, "coverage.xml").expect("cobertura");
        assert_eq!(report.roots, vec!["/ci/repo".to_owned(), "src".to_owned()]);
        assert_eq!(lines_of(&report), vec![("pkg/a.py".into(), vec![(1, 1), (2, 3)])]);
        let jacoco = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">
<report name="x"><package name="com/x"><class name="com/x/Foo"><method name="a" line="3"/></class>
<sourcefile name="Foo.java"><line nr="3" mi="0" ci="4" mb="0" cb="0"/><line nr="4" mi="2" ci="0"/><line nr="5" mi="0" ci="0"/></sourcefile>
<sourcefile name="Empty.java"/><sourcefile><line nr="1" mi="0" ci="1"/></sourcefile></package>
<package><sourcefile name="Top.java"><line nr="1" mi="1" ci="1"/></sourcefile></package></report>"#;
        let report = parse_report(jacoco, "jacoco.xml").expect("jacoco");
        assert_eq!(
            lines_of(&report),
            vec![
                ("com/x/Foo.java".into(), vec![(3, 4), (4, 0)]),
                ("com/x/".into(), vec![(1, 1)]),
                ("Top.java".into(), vec![(1, 1)])
            ]
        );
    }

    #[test]
    fn rejects_other_xml_and_text_of_no_format() {
        let reason = |text: &str| parse_report(text, "a.xml").unwrap_err().message;
        assert!(reason("<svg/>").contains("an XML document of <svg>"));
        assert!(reason("<!-- only -->").contains("of <nothing>"));
        assert!(reason("<>").contains("an XML document of <>)"));
        assert!(reason("< x").contains("of <nothing>"));
        assert!(reason("<!-- a --> text <x/>").contains("of <nothing>"));
        assert!(reason("</x>").contains("of <nothing>"));
        let error = parse_report("mode: set\n", "coverage.out").unwrap_err();
        assert_eq!(error.code, ErrorCode::CoverageUnreadable);
    }
}
