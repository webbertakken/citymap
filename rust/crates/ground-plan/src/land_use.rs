//! Land use: the role of a file, from its path alone; earlier rules win.
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::fixed::{compare_keys, round_div};

/// The role of a file, from path rules.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LandUse {
    Vendored,
    Generated,
    Fixtures,
    Tests,
    Examples,
    Docs,
    Ci,
    Assets,
    Config,
    Source,
}

impl LandUse {
    /// Every land use, in rule order.
    pub const ALL: [Self; 10] = [
        Self::Vendored,
        Self::Generated,
        Self::Fixtures,
        Self::Tests,
        Self::Examples,
        Self::Docs,
        Self::Ci,
        Self::Assets,
        Self::Config,
        Self::Source,
    ];

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Vendored => "vendored",
            Self::Generated => "generated",
            Self::Fixtures => "fixtures",
            Self::Tests => "tests",
            Self::Examples => "examples",
            Self::Docs => "docs",
            Self::Ci => "ci",
            Self::Assets => "assets",
            Self::Config => "config",
            Self::Source => "source",
        }
    }

    /// Weight of one file in mass, in per mille.
    #[must_use]
    pub const fn weight_mille(self) -> i64 {
        match self {
            Self::Source => 1000,
            Self::Config | Self::Assets | Self::Ci | Self::Docs => 500,
            Self::Tests | Self::Examples => 300,
            Self::Fixtures | Self::Generated | Self::Vendored => 50,
        }
    }

    /// Files of one land use in one folder share a lot, round(1 / weight) per lot.
    #[must_use]
    pub fn lot_capacity(self) -> usize {
        usize::try_from(round_div(1000, self.weight_mille()).max(1)).expect("positive")
    }
}

impl fmt::Display for LandUse {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The land uses that take land by default: all but tests and fixtures.
#[must_use]
pub fn default_land_uses() -> Vec<LandUse> {
    LandUse::ALL
        .into_iter()
        .filter(|&u| u != LandUse::Tests && u != LandUse::Fixtures)
        .collect()
}

/// The key of a land setting: its uses, sorted. Each setting has its own plat.
#[must_use]
pub fn land_key(uses: &[LandUse]) -> String {
    let mut names: Vec<&str> = uses.iter().map(|u| u.as_str()).collect();
    names.sort_by(|a, b| compare_keys(a, b));
    names.join(",")
}

const VENDORED: &[&str] = &[
    "vendor",
    "vendored",
    "third_party",
    "third-party",
    "thirdparty",
    "node_modules",
    "external",
    "deps",
];
const FIXTURES: &[&str] = &[
    "fixtures",
    "__fixtures__",
    "fixture",
    "testdata",
    "test-data",
    "__snapshots__",
    "snapshots",
    "baselines",
    "golden",
    "goldens",
];
const TESTS: &[&str] = &[
    "test",
    "tests",
    "__tests__",
    "spec",
    "specs",
    "e2e",
    "integration-tests",
    "testing",
    "__mocks__",
];
const EXAMPLES: &[&str] = &[
    "examples",
    "example",
    "demo",
    "demos",
    "playground",
    "playgrounds",
    "samples",
    "sample",
];
const DOCS: &[&str] = &["docs", "doc", "documentation", "website", "site"];
const GENERATED_FOLDERS: &[&str] = &["dist", "generated", "__generated__"];
const CI: &[&str] = &[
    ".github",
    ".circleci",
    ".gitlab",
    "scripts",
    "script",
    "tools",
    "tooling",
    "hack",
    "ci",
    ".husky",
    ".devcontainer",
    ".vscode",
    ".changeset",
];
const ASSET_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "tif", "tiff", "woff", "woff2", "ttf", "otf",
    "eot", "mp3", "wav", "ogg", "mp4", "webm", "mov", "glb", "gltf", "fbx", "obj", "blend", "psd", "pdf", "zip",
];
const DOC_EXT: &[&str] = &["md", "mdx", "rst", "adoc", "txt"];
const CONFIG_EXT: &[&str] = &[
    "json",
    "jsonc",
    "yml",
    "yaml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "lock",
    "properties",
    "editorconfig",
    "env",
    "xml",
    "plist",
    "gradle",
];
const GENERATED_SUFFIXES: &[&str] = &[
    ".min.js",
    ".min.css",
    ".map",
    ".pb.go",
    "_pb2.py",
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "Cargo.lock",
    "bun.lock",
    "bun.lockb",
];
const SNAPSHOT_SUFFIXES: &[&str] = &[".snap", ".stderr", ".stdout", ".baseline"];
const TEST_SUFFIXES: &[&str] = &["_test.go", "_test.py", "_test.rs", "Test.java", "Test.cs", "Tests.cs"];

/// A lowercased folder name in a set: `toLowerCase` maps a few non-ASCII letters (the Kelvin sign) to ASCII ones.
fn named(folder: &str, names: &[&str]) -> bool {
    if folder.is_ascii() {
        names.iter().any(|name| folder.eq_ignore_ascii_case(name))
    } else {
        let lower = folder.to_lowercase();
        names.contains(&lower.as_str())
    }
}

/// `/\.(a|b|…)$/i`: the name ends with a dot and one of the extensions, ASCII case aside.
fn has_extension(file: &str, extensions: &[&str]) -> bool {
    let bytes = file.as_bytes();
    extensions.iter().any(|ext| {
        bytes.len() > ext.len()
            && bytes[bytes.len() - ext.len() - 1] == b'.'
            && bytes[bytes.len() - ext.len()..].eq_ignore_ascii_case(ext.as_bytes())
    })
}

fn ends_with_any(file: &str, suffixes: &[&str]) -> bool {
    suffixes.iter().any(|s| file.ends_with(s))
}

/// `/(\.generated\.|\.g\.|\.min\.(js|css)$|…)/`.
fn is_generated_file(file: &str) -> bool {
    file.contains(".generated.") || file.contains(".g.") || ends_with_any(file, GENERATED_SUFFIXES)
}

/// `/(\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rs)$|^test_.*\.py$|Test\.java$|Tests?\.cs$)/`.
fn is_test_file(file: &str) -> bool {
    if ends_with_any(file, TEST_SUFFIXES) {
        return true;
    }
    // `^test_.*\.py$`: `.` matches anything but the four line terminators.
    if let Some(middle) = file.strip_prefix("test_").and_then(|rest| rest.strip_suffix(".py"))
        && !middle.contains(['\n', '\r', '\u{2028}', '\u{2029}'])
    {
        return true;
    }
    // `\.(test|spec)\.[cm]?[jt]sx?$`
    let tail = file.strip_suffix('x').unwrap_or(file);
    let Some(tail) = tail.strip_suffix('s') else {
        return false;
    };
    let Some(tail) = tail.strip_suffix(['j', 't']) else {
        return false;
    };
    let tail = tail
        .strip_suffix(['c', 'm'])
        .map_or_else(|| [tail, tail], |shorter| [tail, shorter]);
    tail.iter().any(|t| t.ends_with(".test.") || t.ends_with(".spec."))
}

/// The land use of a path, from its folders and file name alone (binary files are assets by extension).
#[must_use]
pub fn classify_land_use(path: &str) -> LandUse {
    let (folders, file) = path.rsplit_once('/').map_or(("", path), |(f, n)| (f, n));
    let in_any = |names: &[&str]| !folders.is_empty() && folders.split('/').any(|f| named(f, names));
    if in_any(VENDORED) {
        return LandUse::Vendored;
    }
    if is_generated_file(file) || in_any(GENERATED_FOLDERS) {
        return LandUse::Generated;
    }
    if in_any(FIXTURES) || ends_with_any(file, SNAPSHOT_SUFFIXES) {
        return LandUse::Fixtures;
    }
    if in_any(TESTS) || is_test_file(file) {
        return LandUse::Tests;
    }
    if in_any(EXAMPLES) {
        return LandUse::Examples;
    }
    if in_any(DOCS) || has_extension(file, DOC_EXT) {
        return LandUse::Docs;
    }
    if in_any(CI) {
        return LandUse::Ci;
    }
    if has_extension(file, ASSET_EXT) {
        return LandUse::Assets;
    }
    if has_extension(file, CONFIG_EXT) || file.starts_with('.') {
        return LandUse::Config;
    }
    LandUse::Source
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weighs_and_shares_lots_by_land_use() {
        assert_eq!(LandUse::Source.lot_capacity(), 1);
        assert_eq!(LandUse::Config.lot_capacity(), 2);
        assert_eq!(LandUse::Tests.lot_capacity(), 3);
        assert_eq!(LandUse::Fixtures.lot_capacity(), 20);
        assert_eq!(
            land_key(&default_land_uses()),
            "assets,ci,config,docs,examples,generated,source,vendored"
        );
    }

    #[test]
    fn classifies_by_the_earliest_rule() {
        let cases = [
            ("node_modules/x/test/a.ts", LandUse::Vendored),
            ("src/a.generated.ts", LandUse::Generated),
            ("dist/a.js", LandUse::Generated),
            ("Cargo.lock", LandUse::Generated),
            ("src/__snapshots__/a.ts", LandUse::Fixtures),
            ("src/a.snap", LandUse::Fixtures),
            ("src/a.test.tsx", LandUse::Tests),
            ("src/a.spec.mjs", LandUse::Tests),
            ("src/a.test.jsx", LandUse::Tests),
            ("test_a.py", LandUse::Tests),
            ("test_a\nb.py", LandUse::Source),
            ("pkg/a_test.go", LandUse::Tests),
            ("FooTests.cs", LandUse::Tests),
            ("Tests/a.ts", LandUse::Tests),
            ("examples/a.ts", LandUse::Examples),
            ("README.MD", LandUse::Docs),
            ("docs/a.ts", LandUse::Docs),
            (".github/workflows/ci.yml", LandUse::Ci),
            ("hac\u{212a}/a.ts", LandUse::Ci),
            ("logo.PNG", LandUse::Assets),
            ("tsconfig.json", LandUse::Config),
            (".gitignore", LandUse::Config),
            ("src/main.rs", LandUse::Source),
            ("a.png.ts", LandUse::Source),
            (".png", LandUse::Assets),
            ("png", LandUse::Source),
        ];
        for (path, expected) in cases {
            assert_eq!(classify_land_use(path), expected, "{path:?}");
        }
    }
}

#[cfg(test)]
mod parity {
    use super::*;

    /// Every path the TypeScript engine classified (`scripts/parity-fixtures.ts`) takes the same land use here.
    #[test]
    fn classifies_as_the_typescript_engine_does() {
        let text = include_str!("../../../fixtures/land-use.tsv");
        let mut count = 0;
        for line in text.lines() {
            let (path, expected) = line.split_once('\t').expect("path, tab, land use");
            let path: String = serde_json::from_str(path).expect("a JSON string");
            assert_eq!(classify_land_use(&path).as_str(), expected, "{path:?}");
            count += 1;
        }
        assert!(count > 900);
    }
}
