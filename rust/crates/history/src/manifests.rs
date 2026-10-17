//! Root workspace manifests: which file names are, what member patterns each declares, and the folders they match. The
//! patterns are read with ECMAScript regular expressions (`regress`), so they mean what they mean in TypeScript.
use std::sync::LazyLock;

use citymap_ground_plan::fixed::compare_keys;
use regress::Regex;
use serde_json::Value;

/// The patterns of one manifest: globs that include members, and globs that exclude them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Patterns {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}

const ROOT_MANIFESTS: [&str; 8] = [
    "package.json",
    "pnpm-workspace.yaml",
    "lerna.json",
    "Cargo.toml",
    "go.work",
    "pyproject.toml",
    "deno.json",
    "deno.jsonc",
];

/// True for a workspace manifest at the repository root.
#[must_use]
pub fn is_manifest(path: &str) -> bool {
    ROOT_MANIFESTS.contains(&path)
}

fn regex(pattern: &str, flags: &str) -> Regex {
    Regex::with_flags(pattern, flags).expect("a valid pattern")
}

static LEADING_DOT: LazyLock<Regex> = LazyLock::new(|| regex(r"^\.\/", ""));
static TRAILING_SLASHES: LazyLock<Regex> = LazyLock::new(|| regex(r"\/+$", ""));
static LINE_COMMENT_LINES: LazyLock<Regex> = LazyLock::new(|| regex(r"^\s*\/\/.*$", "gm"));
static SECTION_END: LazyLock<Regex> = LazyLock::new(|| regex(r"^\s*\[", "m"));
static HASH_COMMENTS: LazyLock<Regex> = LazyLock::new(|| regex(r"#.*$", "gm"));
static QUOTED: LazyLock<Regex> = LazyLock::new(|| regex(r#""([^"]*)"|'([^']*)'"#, "g"));
static PNPM_PACKAGES: LazyLock<Regex> = LazyLock::new(|| regex(r"^packages:\s*$", ""));
static PNPM_ITEM: LazyLock<Regex> = LazyLock::new(|| regex(r"^\s+-\s+(.+?)\s*$", ""));
static QUOTE_ENDS: LazyLock<Regex> = LazyLock::new(|| regex(r#"^['"]|['"]$"#, "g"));
static SLASH_COMMENTS: LazyLock<Regex> = LazyLock::new(|| regex(r"\/\/.*$", "gm"));
static GO_USE: LazyLock<Regex> = LazyLock::new(|| regex(r"^use\s*(?:\(([\s\S]*?)\)|(\S+))", "gm"));
static WHITESPACE: LazyLock<Regex> = LazyLock::new(|| regex(r"\s+", ""));

/// The characters `String.prototype.trim` removes: ECMAScript white space and line terminators.
pub(crate) fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

/// A pattern as a folder path: no leading `./`, no trailing `/`.
fn clean(pattern: &str) -> String {
    let trimmed = pattern.trim_matches(is_js_space);
    TRAILING_SLASHES.replace(&LEADING_DOT.replace(trimmed, ""), "")
}

/// Patterns from a list in which `!` marks an exclusion.
fn split(list: &[String], exclude: &[String]) -> Option<Patterns> {
    let include: Vec<String> = list.iter().filter(|p| !p.starts_with('!')).map(|p| clean(p)).collect();
    let mut excluded: Vec<String> = list.iter().filter_map(|p| p.strip_prefix('!')).map(clean).collect();
    excluded.extend(exclude.iter().map(|p| clean(p)));
    (!include.is_empty()).then_some(Patterns {
        include,
        exclude: excluded,
    })
}

fn strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect(),
        _ => vec![],
    }
}

/// JSON with comments (deno.jsonc): line comments go first.
fn json(text: &str) -> Option<Value> {
    serde_json::from_str(&LINE_COMMENT_LINES.replace_all(text, "")).ok()
}

/// A property of a parsed JSON value, if it is an object holding one.
fn field<'v>(value: Option<&'v Value>, name: &str) -> Option<&'v Value> {
    value?.as_object()?.get(name)
}

/// The quoted strings of a TOML array assigned to a key within a section (multi-line arrays and comments allowed).
fn toml_array(text: &str, section: &str, key: &str) -> Vec<String> {
    let header = format!("[{section}]");
    let Some(start) = text.find(&header) else { return vec![] };
    let body = &text[start + header.len()..];
    let block = SECTION_END.find(body).map_or(body, |m| &body[..m.start()]);
    let assignment = regex(
        &format!(r"^\s*{}\s*=\s*\[([\s\S]*?)\]", key.replacen('.', r"\.", 1)),
        "m",
    );
    let Some(found) = assignment.find(block) else {
        return vec![];
    };
    let inner = &block[found.group(1).expect("the array's body")];
    let uncommented = HASH_COMMENTS.replace_all(inner, "");
    QUOTED
        .find_iter(&uncommented)
        .map(|m| uncommented[m.group(1).or_else(|| m.group(2)).expect("one of the quotes")].to_owned())
        .collect()
}

/// The member patterns a root manifest declares, or none when it declares none (or cannot be read).
#[must_use]
pub fn patterns_of(file: &str, text: &str) -> Option<Patterns> {
    match file {
        "package.json" => {
            let parsed = json(text);
            let workspaces = field(parsed.as_ref(), "workspaces");
            let list = if matches!(workspaces, Some(Value::Array(_))) {
                strings(workspaces)
            } else {
                strings(field(workspaces, "packages"))
            };
            split(&list, &[])
        }
        "lerna.json" => split(&strings(field(json(text).as_ref(), "packages")), &[]),
        "deno.json" | "deno.jsonc" => split(&strings(field(json(text).as_ref(), "workspace")), &[]),
        "pnpm-workspace.yaml" => {
            // The list under the top-level `packages:` key, one `- item` per line.
            let lines: Vec<&str> = text.split('\n').collect();
            let at = lines.iter().position(|l| PNPM_PACKAGES.find(l).is_some())?;
            let mut items = Vec::new();
            for line in &lines[at + 1..] {
                let Some(item) = PNPM_ITEM.find(line) else { break };
                items.push(QUOTE_ENDS.replace_all(&line[item.group(1).expect("the item")], ""));
            }
            split(&items, &[])
        }
        "Cargo.toml" => split(
            &toml_array(text, "workspace", "members"),
            &toml_array(text, "workspace", "exclude"),
        ),
        "pyproject.toml" => split(
            &toml_array(text, "tool.uv.workspace", "members"),
            &toml_array(text, "tool.uv.workspace", "exclude"),
        ),
        _ => {
            // go.work: `use ./x`, or a `use ( … )` block, with // comments.
            let uncommented = SLASH_COMMENTS.replace_all(text, "");
            let uses: Vec<String> = GO_USE
                .find_iter(&uncommented)
                .flat_map(|m| {
                    let list = &uncommented[m.group(1).or_else(|| m.group(2)).expect("one of the forms")];
                    split_whitespace(list)
                })
                .collect();
            split(&uses, &[])
        }
    }
}

/// `text.split(/\s+/).filter(Boolean)`.
fn split_whitespace(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut last = 0;
    for m in WHITESPACE.find_iter(text) {
        out.push(text[last..m.start()].to_owned());
        last = m.end();
    }
    out.push(text[last..].to_owned());
    out.into_iter().filter(|s| !s.is_empty()).collect()
}

/// A glob as an ECMAScript regular expression over folder paths: `**` spans folders, `*` and `?` stay within one.
fn glob_to_regex(glob: &str) -> Regex {
    let chars: Vec<char> = glob.chars().collect();
    let mut source = String::from("^");
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '*' && chars.get(i + 1) == Some(&'*') {
            source.push_str(".*");
            i += 1;
            if chars.get(i + 1) == Some(&'/') {
                i += 1;
            }
        } else if c == '*' {
            source.push_str("[^/]*");
        } else if c == '?' {
            source.push_str("[^/]");
        } else {
            if ".+^${}()|[]\\".contains(c) {
                source.push('\\');
            }
            source.push(c);
        }
        i += 1;
    }
    source.push('$');
    // A pattern from a manifest that is no valid expression matches nothing, as a failed `new RegExp` matches nothing.
    Regex::new(&source).unwrap_or_else(|_| regex("(?!)", ""))
}

/// The folders the manifests declare as members: matched by any include and by no exclude, sorted.
#[must_use]
pub fn resolve_workspaces<'a>(manifests: &[Patterns], folders: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let include: Vec<Regex> = manifests
        .iter()
        .flat_map(|m| m.include.iter())
        .map(|g| glob_to_regex(g))
        .collect();
    let exclude: Vec<Regex> = manifests
        .iter()
        .flat_map(|m| m.exclude.iter())
        .map(|g| glob_to_regex(g))
        .collect();
    let mut out: Vec<String> = folders
        .into_iter()
        .filter(|f| include.iter().any(|r| r.find(f).is_some()) && !exclude.iter().any(|r| r.find(f).is_some()))
        .map(str::to_owned)
        .collect();
    out.sort_by(|a, b| compare_keys(a, b));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pattern(include: &[&str], exclude: &[&str]) -> Patterns {
        Patterns {
            include: include.iter().map(|s| (*s).to_owned()).collect(),
            exclude: exclude.iter().map(|s| (*s).to_owned()).collect(),
        }
    }

    #[expect(clippy::unnecessary_wraps, reason = "compared with what patterns_of returns")]
    fn patterns(include: &[&str], exclude: &[&str]) -> Option<Patterns> {
        Some(pattern(include, exclude))
    }

    #[test]
    fn knows_the_root_workspace_manifests() {
        for f in ROOT_MANIFESTS {
            assert!(is_manifest(f));
        }
        assert!(!is_manifest("apps/web/package.json"));
        assert!(!is_manifest("README.md"));
    }

    #[test]
    fn reads_npm_yarn_and_bun_workspaces_as_a_list_or_under_packages() {
        assert_eq!(
            patterns_of(
                "package.json",
                r#"{"workspaces":["apps/*","packages/*","!packages/old"]}"#
            ),
            patterns(&["apps/*", "packages/*"], &["packages/old"])
        );
        assert_eq!(
            patterns_of("package.json", r#"{"workspaces":{"packages":["libs/**"]}}"#),
            patterns(&["libs/**"], &[])
        );
        assert_eq!(patterns_of("package.json", r#"{"name":"x"}"#), None);
        assert_eq!(patterns_of("package.json", "{not json"), None);
    }

    #[test]
    fn reads_pnpm_and_lerna() {
        let yaml =
            "packages:\n  - 'apps/*'\n  - \"tools/x\"\n  - packages/**\n  - '!**/test/**'\ncatalog:\n  react: 19\n";
        assert_eq!(
            patterns_of("pnpm-workspace.yaml", yaml),
            patterns(&["apps/*", "tools/x", "packages/**"], &["**/test/**"])
        );
        assert_eq!(patterns_of("pnpm-workspace.yaml", "catalog:\n  a: 1\n"), None);
        assert_eq!(
            patterns_of("lerna.json", r#"{"packages":["modules/*"]}"#),
            patterns(&["modules/*"], &[])
        );
        assert_eq!(
            patterns_of("pnpm-workspace.yaml", "packages:\n  - libs/*"),
            patterns(&["libs/*"], &[])
        );
    }

    #[test]
    fn reads_cargo_uv_and_deno() {
        let cargo = "[package]\nname = \"x\"\n\n[workspace]\nmembers = [\n  \"crates/*\",\n  \"tools/cli\", # the cli\n]\nexclude = [\"crates/old\"]\n";
        assert_eq!(
            patterns_of("Cargo.toml", cargo),
            patterns(&["crates/*", "tools/cli"], &["crates/old"])
        );
        assert_eq!(patterns_of("Cargo.toml", "[package]\nname = \"x\"\n"), None);
        let uv = "[project]\nname = \"x\"\n[tool.uv.workspace]\nmembers = [\"packages/*\"]\n";
        assert_eq!(patterns_of("pyproject.toml", uv), patterns(&["packages/*"], &[]));
        let deno = "{\n  // members\n  \"workspace\": [\"./add\", \"./subtract\"]\n}";
        assert_eq!(patterns_of("deno.jsonc", deno), patterns(&["add", "subtract"], &[]));
        let sections = "[workspace]\nmembers = ['a', \"b\"]\n\n[profile.release]\nlto = true\n";
        assert_eq!(patterns_of("Cargo.toml", sections), patterns(&["a", "b"], &[]));
        assert_eq!(patterns_of("Cargo.toml", "[workspace]\nexclude = [\"x\"]\n"), None);
        assert_eq!(
            patterns_of("deno.json", r#"{"workspace":["./a"]}"#),
            patterns(&["a"], &[])
        );
    }

    #[test]
    fn reads_go_work_in_both_forms() {
        let go = "go 1.22\n\nuse (\n\t./api\n\t./web // site\n)\nuse ./tools\n";
        assert_eq!(patterns_of("go.work", go), patterns(&["api", "web", "tools"], &[]));
        assert_eq!(patterns_of("go.work", "go 1.22\n"), None);
    }

    #[test]
    fn matches_globs_against_folders_minus_exclusions() {
        let folders = [
            "apps",
            "apps/web",
            "apps/api",
            "packages",
            "packages/a",
            "packages/a/src",
            "packages/old",
            "docs",
        ];
        let p = pattern;
        assert_eq!(
            resolve_workspaces(&[p(&["apps/*", "packages/*"], &["packages/old"])], folders),
            ["apps/api", "apps/web", "packages/a"]
        );
        assert_eq!(
            resolve_workspaces(&[p(&["packages/**", "docs"], &[])], folders),
            ["docs", "packages/a", "packages/a/src", "packages/old"]
        );
        assert_eq!(
            resolve_workspaces(&[p(&["apps/web"], &[]), p(&["apps/api"], &[])], folders),
            ["apps/api", "apps/web"]
        );
        assert_eq!(
            resolve_workspaces(&[p(&["**/fixtures"], &[])], ["fixtures", "a/b/fixtures", "a/fixturesx"]),
            ["a/b/fixtures", "fixtures"]
        );
        assert_eq!(
            resolve_workspaces(&[p(&["pkg/v?"], &[])], ["pkg/v1", "pkg/v10", "pkg/v2"]),
            ["pkg/v1", "pkg/v2"]
        );
    }
}
