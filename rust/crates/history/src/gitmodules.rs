//! `.gitmodules`: where a repository's submodules live and what they are called. Read with ECMAScript regular
//! expressions (`regress`), so its patterns mean what they mean in TypeScript.
use std::sync::LazyLock;

use indexmap::IndexMap;
use regress::Regex;

use crate::manifests::is_js_space;

/// A submodule as `.gitmodules` names it: its name (its git data's folder) and where it is fetched from.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModuleEntry {
    pub name: String,
    pub url: String,
}

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("a valid pattern")
}

static QUOTED: LazyLock<Regex> = LazyLock::new(|| regex(r#"^"((?:[^"\\]|\\.)*)""#));
static ESCAPED: LazyLock<Regex> = LazyLock::new(|| Regex::with_flags(r"\\(.)", "g").expect("a valid pattern"));
static COMMENT: LazyLock<Regex> = LazyLock::new(|| regex(r"\s[#;].*$"));
static SECTION: LazyLock<Regex> = LazyLock::new(|| regex(r#"^\[\s*([A-Za-z.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]"#));
static PAIR: LazyLock<Regex> = LazyLock::new(|| regex(r"^([A-Za-z][A-Za-z0-9-]*)\s*=(.*)$"));
static TRAILING_SLASHES: LazyLock<Regex> = LazyLock::new(|| regex(r"\/+$"));

/// `String.prototype.trim`.
fn trim(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

/// A value: quoted, or bare up to a comment; surrounding space trimmed.
fn value_of(raw: &str) -> String {
    let text = trim(raw);
    if let Some(quoted) = QUOTED.find(text) {
        let inner = &text[quoted.group(1).expect("the quoted text")];
        return ESCAPED.replace_all(inner, "$1");
    }
    trim(&COMMENT.replace(text, "")).to_owned()
}

/// A section being read: its name, and the path and url it has given so far.
struct Section {
    name: String,
    path: Option<String>,
    url: String,
}

/// The submodules `.gitmodules` declares, by path (trailing slashes dropped), in file order; the first claim wins.
#[must_use]
pub fn parse_gitmodules(text: &str) -> IndexMap<String, ModuleEntry> {
    let mut modules: IndexMap<String, ModuleEntry> = IndexMap::new();
    let mut current: Option<Section> = None;
    let close = |current: Option<Section>, modules: &mut IndexMap<String, ModuleEntry>| {
        if let Some(Section {
            name,
            path: Some(path),
            url,
        }) = current
            && !path.is_empty()
        {
            modules.entry(path).or_insert(ModuleEntry { name, url });
        }
    };
    // `split(/\r?\n/)` then `trim`: a line's trailing `\r` is trimmed with its other space.
    for line in text.split('\n') {
        let trimmed = trim(line);
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        if let Some(section) = SECTION.find(trimmed) {
            close(current.take(), &mut modules);
            let kind = &trimmed[section.group(1).expect("the section's kind")];
            let name = section.group(2).map(|r| &trimmed[r]).filter(|n| !n.is_empty());
            current = match name {
                Some(name) if kind.eq_ignore_ascii_case("submodule") => Some(Section {
                    name: name.to_owned(),
                    path: None,
                    url: String::new(),
                }),
                _ => None,
            };
            continue;
        }
        let (Some(pair), Some(section)) = (PAIR.find(trimmed), current.as_mut()) else {
            continue;
        };
        let key = trimmed[pair.group(1).expect("the key")].to_ascii_lowercase();
        let value = &trimmed[pair.group(2).expect("the value")];
        if key == "path" {
            section.path = Some(TRAILING_SLASHES.replace(&value_of(value), ""));
        } else if key == "url" {
            section.url = value_of(value);
        }
    }
    close(current, &mut modules);
    modules
}

/// True for a relative path of plain segments: no `..`, `.`, empty segment, backslash or NUL (as git demands).
#[must_use]
pub fn is_safe_module_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && !path.contains('\0')
        && path
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(text: &str) -> Vec<(String, String, String)> {
        parse_gitmodules(text)
            .into_iter()
            .map(|(path, m)| (path, m.name, m.url))
            .collect()
    }

    fn entry(path: &str, name: &str, url: &str) -> (String, String, String) {
        (path.to_owned(), name.to_owned(), url.to_owned())
    }

    #[test]
    fn reads_each_submodule_s_path_name_and_url() {
        let text = "[submodule \"cargo\"]\n\tpath = src/tools/cargo\n\turl = https://github.com/rust-lang/cargo.git\n[submodule \"library/stdarch\"]\n  path = \"library/stdarch\"\n  url = https://github.com/rust-lang/stdarch.git ; a comment\n  branch = main\n";
        assert_eq!(
            entries(text),
            [
                entry("src/tools/cargo", "cargo", "https://github.com/rust-lang/cargo.git"),
                entry(
                    "library/stdarch",
                    "library/stdarch",
                    "https://github.com/rust-lang/stdarch.git"
                )
            ]
        );
    }

    #[test]
    fn passes_over_comments_other_sections_keys_in_any_case_and_sections_without_a_path() {
        let text = "# top\n[core]\n  path = nope\n[submodule \"a\"]\n  URL = git@github.com:o/a.git\n  Path = vendor/a/\n[submodule \"no-path\"]\n  url = x\n";
        assert_eq!(entries(text), [entry("vendor/a", "a", "git@github.com:o/a.git")]);
    }

    #[test]
    fn keeps_the_first_section_naming_a_path_and_an_empty_url_when_none_is_given() {
        let text = "[submodule \"one\"]\n path = x\n[submodule \"two\"]\n path = x\n url = u\n";
        assert_eq!(entries(text), [entry("x", "one", "")]);
    }

    #[test]
    fn reads_nothing_from_text_that_is_not_a_gitmodules_file() {
        assert!(parse_gitmodules("").is_empty());
        assert!(parse_gitmodules("\u{0}\u{1} binary").is_empty());
    }

    #[test]
    fn unescapes_quoted_values_and_reads_crlf_lines() {
        let text = "[submodule \"q\"]\r\n  path = \"a\\\"b\" # kept whole\r\n  url = u # c\r\n";
        assert_eq!(entries(text), [entry("a\"b", "q", "u")]);
    }

    #[test]
    fn takes_relative_paths_of_plain_segments_only() {
        assert!(is_safe_module_path("src/tools/cargo"));
        for bad in ["", "/abs", "a/../b", "..", "a\\b", "a\u{0}b", "a//b", "./a", "a/"] {
            assert!(!is_safe_module_path(bad), "{bad:?}");
        }
    }
}
