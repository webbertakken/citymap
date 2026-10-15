//! The command line, parsed as `node:util` `parseArgs` parses it in strict mode, with the same options and messages.
use citymap_ground_plan::town::context::Jog;
use citymap_ground_plan::{CitymapError, ErrorCode, Result};
use citymap_svg::Camera;
use citymap_themes::ThemeName;

/// Lay a repository's city.
#[expect(
    clippy::struct_excessive_bools,
    reason = "one field per flag, as the TypeScript command has"
)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LayCommand {
    pub repo: String,
    pub to: String,
    pub out: Option<String>,
    pub svg: Option<String>,
    pub theme: ThemeName,
    pub camera: Camera,
    pub lock: bool,
    pub verbose: bool,
    pub tests: bool,
    pub density_pct: i64,
    pub jog: Jog,
    pub warp: bool,
    pub loops: bool,
    pub voronoi: bool,
    /// Fold the history (true), or lay the tree at `to` once, as if every file arrived together (false).
    pub history: bool,
    /// Workspace groups whose members each become a town.
    pub split: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    Lay(Box<LayCommand>),
    Help,
}

pub const USAGE: &str = "Usage: citymap <repository> [options]

Folds the repository's first-parent history into its ground plan and writes the city.

  --to=<ref>          commit to lay (default HEAD)
  --out=<file>        write the city as JSON
  --svg=<file>        write the city as SVG
  --theme=<name>      paper-atlas, night-atlas, beck, nolli, dracula (default paper-atlas)
  --camera=<view>     plan or dimetric (default plan)
  --lock              write citymap.lock.json at the repository root, and resume from it next time
  --tests             give tests land (the land dimension; default: tests and fixtures take none)
  --density=<pct>     share of land covered by lots, 20 to 80 (default 50)
  --jog=<cuts>        off, top-level or all (default top-level)
  --split=<groups>    workspace groups whose members each become a town, comma-separated (default apps;
                      --split=apps,packages splits packages too; --split= splits none)
  --no-warp           draw the plan without its organic warp
  --no-loops          leave dead ends unjoined (default: nearby dead ends are joined by lanes)
  --no-history        lay the tree at --to once, every file at once, without folding its history (no --lock)
  --voronoi           fill each folder's region, the land nearer its lots than any other's, in the SVG
  --verbose           log every plan decision
  --help              show this help";

const STRINGS: [&str; 8] = ["to", "out", "svg", "theme", "camera", "density", "jog", "split"];
const BOOLEANS: [&str; 9] = [
    "lock",
    "verbose",
    "tests",
    "no-warp",
    "no-loops",
    "voronoi",
    "no-history",
    "help",
    "",
];

fn usage(message: impl Into<String>) -> CitymapError {
    CitymapError::new(ErrorCode::CliUsage, message)
}

/// The options and positionals, as `parseArgs` sees them.
#[derive(Default)]
struct Parsed {
    strings: std::collections::HashMap<&'static str, String>,
    booleans: std::collections::HashSet<&'static str>,
    positionals: Vec<String>,
}

fn parse(argv: &[String]) -> std::result::Result<Parsed, String> {
    let mut parsed = Parsed::default();
    let mut i = 0;
    while i < argv.len() {
        let arg = &argv[i];
        i += 1;
        if arg == "--" {
            parsed.positionals.extend(argv[i..].iter().cloned());
            break;
        }
        let Some(option) = arg.strip_prefix("--") else {
            if arg.starts_with('-') && arg.len() > 1 {
                return Err(format!(
                    "TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '{}'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"{arg}\"",
                    &arg[..2.min(arg.len())]
                ));
            }
            parsed.positionals.push(arg.clone());
            continue;
        };
        let (name, inline) = option
            .split_once('=')
            .map_or((option, None), |(n, v)| (n, Some(v.to_owned())));
        if let Some(&known) = STRINGS.iter().find(|&&s| s == name) {
            let value = if let Some(value) = inline {
                value
            } else {
                let Some(next) = argv.get(i) else {
                    return Err(format!(
                        "TypeError [ERR_PARSE_ARGS_INVALID_OPTION_VALUE]: Option '--{name} <value>' argument missing"
                    ));
                };
                if next.starts_with('-') {
                    return Err(format!(
                        "TypeError [ERR_PARSE_ARGS_INVALID_OPTION_VALUE]: Option '--{name}' argument is ambiguous.\nDid you forget to specify the option argument for '--{name}'?\nTo specify an option argument starting with a dash use '--{name}=-XYZ'."
                    ));
                }
                i += 1;
                next.clone()
            };
            parsed.strings.insert(known, value);
        } else if let Some(&known) = BOOLEANS.iter().find(|&&b| b == name && !b.is_empty()) {
            if inline.is_some() {
                return Err(format!(
                    "TypeError [ERR_PARSE_ARGS_INVALID_OPTION_VALUE]: Option '--{name}' does not take an argument"
                ));
            }
            parsed.booleans.insert(known);
        } else {
            return Err(format!(
                "TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '--{name}'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--{name}\"'"
            ));
        }
    }
    Ok(parsed)
}

fn one_of<T: Copy>(name: &str, value: &str, options: &[(&str, T)]) -> Result<T> {
    options
        .iter()
        .find(|(n, _)| *n == value)
        .map(|(_, v)| *v)
        .ok_or_else(|| {
            let names: Vec<&str> = options.iter().map(|(n, _)| *n).collect();
            usage(format!("--{name} is one of {}, not {value}", names.join(", ")))
        })
}

/// `Number(text)` is an integer: what the TypeScript CLI accepts as a density.
fn integer(text: &str) -> Option<i64> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Some(0);
    }
    let radix = |prefix: [&str; 2], base: u32| {
        prefix
            .iter()
            .find_map(|p| trimmed.strip_prefix(p))
            .map(|digits| i64::from_str_radix(digits, base).ok())
    };
    if let Some(value) = radix(["0x", "0X"], 16)
        .or_else(|| radix(["0o", "0O"], 8))
        .or_else(|| radix(["0b", "0B"], 2))
    {
        return value;
    }
    let value: f64 = trimmed.parse().ok()?;
    #[allow(clippy::cast_possible_truncation)]
    (value.is_finite() && value.fract() == 0.0 && value.abs() < 1e15).then_some(value as i64)
}

/// The command a command line asks for, or a named rejection.
pub fn parse_command_line(argv: &[String]) -> Result<Command> {
    let parsed = parse(argv).map_err(usage)?;
    let flag = |name: &str| parsed.booleans.contains(name);
    let text = |name: &str, default: &str| parsed.strings.get(name).cloned().unwrap_or_else(|| default.to_owned());
    if flag("help") {
        return Ok(Command::Help);
    }
    if parsed.positionals.len() != 1 {
        return Err(usage("name one repository"));
    }
    if flag("no-history") && flag("lock") {
        return Err(usage("--lock folds history; it cannot go with --no-history"));
    }
    let density_text = text("density", "50");
    let density = integer(&density_text).filter(|d| (20..=80).contains(d));
    let Some(density_pct) = density else {
        return Err(usage(format!(
            "--density is an integer from 20 to 80, not {density_text}"
        )));
    };
    let themes: Vec<(&str, ThemeName)> = ThemeName::ALL.iter().map(|t| (t.as_str(), *t)).collect();
    Ok(Command::Lay(Box::new(LayCommand {
        repo: parsed.positionals[0].clone(),
        to: text("to", "HEAD"),
        out: parsed.strings.get("out").cloned(),
        svg: parsed.strings.get("svg").cloned(),
        theme: one_of("theme", &text("theme", "paper-atlas"), &themes)?,
        camera: one_of(
            "camera",
            &text("camera", "plan"),
            &[("plan", Camera::Plan), ("dimetric", Camera::Dimetric)],
        )?,
        lock: flag("lock"),
        verbose: flag("verbose"),
        tests: flag("tests"),
        density_pct,
        jog: one_of(
            "jog",
            &text("jog", "top-level"),
            &[("off", Jog::Off), ("top-level", Jog::TopLevel), ("all", Jog::All)],
        )?,
        warp: !flag("no-warp"),
        loops: !flag("no-loops"),
        voronoi: flag("voronoi"),
        history: !flag("no-history"),
        split: text("split", "apps")
            .split(',')
            .filter(|g| !g.is_empty())
            .map(str::to_owned)
            .collect(),
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    fn lay(list: &[&str]) -> LayCommand {
        match parse_command_line(&args(list)).expect("a command") {
            Command::Lay(command) => *command,
            Command::Help => panic!("expected a lay command"),
        }
    }

    #[test]
    fn defaults_to_a_plan_view_city_of_the_repository_at_head() {
        assert_eq!(
            lay(&["./repo"]),
            LayCommand {
                repo: "./repo".into(),
                to: "HEAD".into(),
                out: None,
                svg: None,
                theme: ThemeName::PaperAtlas,
                camera: Camera::Plan,
                lock: false,
                verbose: false,
                tests: false,
                density_pct: 50,
                jog: Jog::TopLevel,
                warp: true,
                loops: true,
                voronoi: false,
                history: true,
                split: vec!["apps".into()],
            }
        );
    }

    #[test]
    fn reads_every_option() {
        let command = lay(&[
            "repo",
            "--to=main",
            "--out=city.json",
            "--svg",
            "map.svg",
            "--theme=dracula",
            "--camera=dimetric",
            "--lock",
            "--verbose",
            "--tests",
            "--density=70",
            "--jog=all",
            "--no-warp",
            "--no-loops",
            "--voronoi",
            "--split=apps,packages",
        ]);
        assert_eq!(
            (command.to.as_str(), command.out.as_deref(), command.svg.as_deref()),
            ("main", Some("city.json"), Some("map.svg"))
        );
        assert_eq!((command.theme, command.camera), (ThemeName::Dracula, Camera::Dimetric));
        assert!(command.lock && command.verbose && command.tests && command.voronoi);
        assert!(!command.warp && !command.loops);
        assert_eq!((command.density_pct, command.jog), (70, Jog::All));
        assert_eq!(command.split, ["apps", "packages"]);
        assert_eq!(lay(&["repo", "--split="]).split, Vec::<String>::new());
        assert!(!lay(&["repo", "--no-history"]).history);
    }

    #[test]
    fn answers_help_with_the_usage() {
        assert_eq!(parse_command_line(&args(&["--help"])).expect("help"), Command::Help);
        assert_eq!(USAGE, include_str!("../../../fixtures/usage.txt"));
    }

    #[test]
    fn rejects_bad_command_lines_by_name() {
        let cases: [(&[&str], &str); 10] = [
            (&[], "cli/usage: name one repository"),
            (&["a", "b"], "cli/usage: name one repository"),
            (&["a", "--theme=neon"], "cli/usage: --theme"),
            (&["a", "--camera=fish"], "cli/usage: --camera"),
            (&["a", "--density=90"], "cli/usage: --density"),
            (&["a", "--density=x"], "cli/usage: --density"),
            (&["a", "--jog=some"], "cli/usage: --jog"),
            (&["a", "--bogus"], "cli/usage:"),
            (&["a", "--lock=yes"], "cli/usage:"),
            (&["a", "--no-history", "--lock"], "cli/usage: --lock folds history"),
        ];
        for (argv, message) in cases {
            let error = parse_command_line(&args(argv)).expect_err("a rejection");
            assert!(error.to_string().starts_with(message), "{argv:?}: {error}");
        }
    }
}
