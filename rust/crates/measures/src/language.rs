//! A file's language, from its extension or its name, and the comment syntax its lines are read with.

/// How a language marks comments: line markers and block pairs; `None` knows there are none.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Syntax {
    C,
    Css,
    Hash,
    Php,
    Dash,
    Markup,
    Semicolon,
    Percent,
    None,
}

/// A syntax's line markers and its block pair, if any.
pub struct Markers {
    pub line: &'static [&'static str],
    pub block: Option<(&'static str, &'static str)>,
}

impl Syntax {
    #[must_use]
    pub const fn markers(self) -> Markers {
        match self {
            Self::C => Markers {
                line: &["//"],
                block: Some(("/*", "*/")),
            },
            Self::Css => Markers {
                line: &[],
                block: Some(("/*", "*/")),
            },
            Self::Hash => Markers {
                line: &["#"],
                block: None,
            },
            Self::Php => Markers {
                line: &["//", "#"],
                block: Some(("/*", "*/")),
            },
            Self::Dash => Markers {
                line: &["--"],
                block: None,
            },
            Self::Markup => Markers {
                line: &[],
                block: Some(("<!--", "-->")),
            },
            Self::Semicolon => Markers {
                line: &[";"],
                block: None,
            },
            Self::Percent => Markers {
                line: &["%"],
                block: None,
            },
            Self::None => Markers { line: &[], block: None },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Language {
    pub name: &'static str,
    pub syntax: Syntax,
}

const TABLE: &[(&str, Syntax, &[&str])] = &[
    ("TypeScript", Syntax::C, &["ts", "tsx", "mts", "cts"]),
    ("JavaScript", Syntax::C, &["js", "jsx", "mjs", "cjs"]),
    ("Java", Syntax::C, &["java"]),
    ("Kotlin", Syntax::C, &["kt", "kts"]),
    ("Scala", Syntax::C, &["scala"]),
    ("Groovy", Syntax::C, &["groovy", "gradle"]),
    ("C", Syntax::C, &["c", "h"]),
    ("C++", Syntax::C, &["cc", "cpp", "cxx", "hh", "hpp", "hxx"]),
    ("C#", Syntax::C, &["cs"]),
    ("Go", Syntax::C, &["go"]),
    ("Rust", Syntax::C, &["rs"]),
    ("Swift", Syntax::C, &["swift"]),
    ("Dart", Syntax::C, &["dart"]),
    ("Objective-C", Syntax::C, &["m", "mm"]),
    ("Protocol Buffers", Syntax::C, &["proto"]),
    ("Zig", Syntax::C, &["zig"]),
    ("Sass", Syntax::C, &["scss"]),
    ("Less", Syntax::C, &["less"]),
    ("CSS", Syntax::Css, &["css"]),
    ("Python", Syntax::Hash, &["py"]),
    ("Ruby", Syntax::Hash, &["rb"]),
    ("Shell", Syntax::Hash, &["sh", "bash", "zsh", "fish"]),
    ("Perl", Syntax::Hash, &["pl", "pm"]),
    ("R", Syntax::Hash, &["r"]),
    ("Elixir", Syntax::Hash, &["ex", "exs"]),
    ("YAML", Syntax::Hash, &["yaml", "yml"]),
    ("TOML", Syntax::Hash, &["toml"]),
    ("CMake", Syntax::Hash, &["cmake"]),
    ("Makefile", Syntax::Hash, &["mk"]),
    ("Nix", Syntax::Hash, &["nix"]),
    ("Terraform", Syntax::Hash, &["tf"]),
    ("PowerShell", Syntax::Hash, &["ps1"]),
    ("PHP", Syntax::Php, &["php"]),
    ("SQL", Syntax::Dash, &["sql"]),
    ("Lua", Syntax::Dash, &["lua"]),
    ("Haskell", Syntax::Dash, &["hs"]),
    ("Elm", Syntax::Dash, &["elm"]),
    ("HTML", Syntax::Markup, &["html", "htm"]),
    ("XML", Syntax::Markup, &["xml", "xsd", "xsl"]),
    ("SVG", Syntax::Markup, &["svg"]),
    ("Vue", Syntax::Markup, &["vue"]),
    ("Svelte", Syntax::Markup, &["svelte"]),
    ("Markdown", Syntax::Markup, &["md", "mdx"]),
    ("INI", Syntax::Semicolon, &["ini"]),
    ("Clojure", Syntax::Semicolon, &["clj", "cljs"]),
    ("Lisp", Syntax::Semicolon, &["lisp", "el"]),
    ("Erlang", Syntax::Percent, &["erl"]),
    ("TeX", Syntax::Percent, &["tex"]),
    ("JSON", Syntax::None, &["json"]),
];

const BY_NAME: &[(&str, &str, Syntax)] = &[
    ("Dockerfile", "Dockerfile", Syntax::Hash),
    ("Makefile", "Makefile", Syntax::Hash),
    ("CMakeLists.txt", "CMake", Syntax::Hash),
    ("Jenkinsfile", "Groovy", Syntax::C),
    ("Gemfile", "Ruby", Syntax::Hash),
    ("Rakefile", "Ruby", Syntax::Hash),
];

/// A path's file name, its stem and its extension; no extension for a name without a dot or with only a first one.
#[must_use]
pub fn name_parts(path: &str) -> (&str, &str, &str) {
    let file = path.rsplit_once('/').map_or(path, |(_, name)| name);
    match file.rfind('.') {
        Some(dot) if dot > 0 => (file, &file[..dot], &file[dot + 1..]),
        _ => (file, file, ""),
    }
}

/// The language of a path, by its file name, else its extension (ASCII case-insensitive); none when neither is known.
#[must_use]
pub fn language_of(path: &str) -> Option<Language> {
    let (file, _, ext) = name_parts(path);
    if let Some(&(_, name, syntax)) = BY_NAME.iter().find(|(n, _, _)| *n == file) {
        return Some(Language { name, syntax });
    }
    let ext = ext.to_ascii_lowercase();
    TABLE
        .iter()
        .find(|(_, _, extensions)| extensions.contains(&ext.as_str()))
        .map(|&(name, syntax, _)| Language { name, syntax })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knows_a_language_by_its_extension_in_any_case_or_by_its_file_name() {
        assert_eq!(
            language_of("src/a.TS"),
            Some(Language {
                name: "TypeScript",
                syntax: Syntax::C
            })
        );
        assert_eq!(language_of("Dockerfile").map(|l| l.name), Some("Dockerfile"));
        assert_eq!(language_of("cmake/CMakeLists.txt").map(|l| l.name), Some("CMake"));
        assert_eq!(language_of("data.json").map(|l| l.syntax), Some(Syntax::None));
        assert_eq!(language_of("notes.txt"), None);
        assert_eq!(language_of(".bashrc"), None);
        assert_eq!(language_of("LICENSE"), None);
    }

    #[test]
    fn splits_a_name_at_its_last_dot_unless_that_dot_starts_it() {
        assert_eq!(name_parts("a/b/foo.test.ts"), ("foo.test.ts", "foo.test", "ts"));
        assert_eq!(name_parts(".env"), (".env", ".env", ""));
        assert_eq!(name_parts("Makefile"), ("Makefile", "Makefile", ""));
    }
}
