//! The CLI on real, temporary repositories, with the outside world in memory.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command as Git;
use std::sync::atomic::{AtomicUsize, Ordering};

use citymap_ground_plan::Result;
use citymap_ground_plan::city::parse_city;
use citymap_history::{FOLD_STRIDES, Strides};

use super::main_with;
use crate::args::{Command, LayCommand, parse_command_line};
use crate::run::{Io, LOCKFILE, run_lay};

static NEXT: AtomicUsize = AtomicUsize::new(0);

struct Repo(PathBuf);

impl Drop for Repo {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Git::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_owned()
}

/// A repository of `commits` commits, each adding a folder of twelve source files.
fn repo(commits: usize) -> Repo {
    let n = NEXT.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("citymap-cli-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a folder");
    git(&dir, &["init", "-q", "-b", "main"]);
    for c in 0..commits {
        std::fs::create_dir_all(dir.join(format!("src/m{c}"))).expect("folders");
        for i in 0..12 {
            std::fs::write(dir.join(format!("src/m{c}/f{i}.ts")), format!("{c}-{i}")).expect("a file");
        }
        git(&dir, &["add", "-A"]);
        git(
            &dir,
            &[
                "-c",
                "user.email=t@t",
                "-c",
                "user.name=t",
                "commit",
                "-q",
                "-m",
                &format!("c{c}"),
            ],
        );
    }
    Repo(dir)
}

#[derive(Default)]
struct Memory {
    files: HashMap<PathBuf, String>,
    writes: Vec<(PathBuf, String)>,
    lines: Vec<String>,
    clock: std::cell::Cell<f64>,
}

impl Io for Memory {
    fn read_file(&self, path: &Path) -> Option<String> {
        self.files.get(path).cloned()
    }

    fn write_file(&mut self, path: &Path, text: &str) -> Result<()> {
        self.files.insert(path.to_path_buf(), text.to_owned());
        self.writes.push((path.to_path_buf(), text.to_owned()));
        Ok(())
    }

    fn log(&mut self, line: &str) {
        self.lines.push(line.to_owned());
    }

    fn now(&self) -> f64 {
        self.clock.set(self.clock.get() + 5.0);
        self.clock.get()
    }
}

fn command(dir: &Path, flags: &[&str]) -> LayCommand {
    let mut argv = vec![dir.display().to_string()];
    argv.extend(flags.iter().map(|f| (*f).to_owned()));
    match parse_command_line(&argv).expect("a command") {
        Command::Lay(command) => *command,
        Command::Help => panic!("expected a lay command"),
    }
}

#[test]
fn writes_the_city_as_json_and_svg_and_logs_a_summary() {
    let repo = repo(3);
    let mut io = Memory::default();
    let flags = [
        "--out=city.json",
        "--svg=map.svg",
        "--theme=night-atlas",
        "--verbose",
        "--voronoi",
    ];
    let city = run_lay(&command(&repo.0, &flags), &mut io, 1000, FOLD_STRIDES).expect("a city");
    assert_eq!(parse_city(&io.files[Path::new("city.json")]).expect("json"), city);
    assert!(io.files[Path::new("map.svg")].contains("<svg "));
    assert!(io.files[Path::new("map.svg")].contains(r#"class="region""#));
    let last = io.lines.last().expect("a summary");
    assert!(
        last.starts_with("fold/done repository=citymap-cli-")
            && last.contains(" commits=3 laid=3 lots=36 overflow=0 ms="),
        "{last}"
    );
    assert!(io.lines.iter().any(|l| l.starts_with("plat/grow")));
    assert_eq!(io.lines[0], "history/schedule commits=3 coarse=0 tail=0 from=0 laid=3");
}

#[test]
fn writes_a_lockfile_and_resumes_from_it_laying_the_same_city() {
    let repo = repo(3);
    let mut first = Memory::default();
    let city = run_lay(&command(&repo.0, &["--lock"]), &mut first, 1000, FOLD_STRIDES).expect("a city");
    let lock = first.files[&repo.0.join(LOCKFILE)].clone();
    assert!(lock.contains(r#""index":2"#));
    let mut second = Memory::default();
    second.files.insert(repo.0.join(LOCKFILE), lock);
    let again = run_lay(&command(&repo.0, &[]), &mut second, 1000, FOLD_STRIDES).expect("a city");
    let head = git(&repo.0, &["rev-parse", "HEAD"]);
    assert!(second.lines.contains(&format!("lock/resume commit={head} index=2")));
    assert!(second.lines.last().expect("a summary").contains(" commits=1 laid=1 "));
    assert_eq!(again, city);
}

#[test]
fn folds_in_windows_on_the_strides_it_is_given_and_resumes_on_the_same_schedule() {
    let repo = repo(5);
    let strides = Strides {
        tail: 1,
        window: 2,
        coarse_after: 1,
        coarse_window: 2,
        grain: 2,
    };
    let mut saved = Memory::default();
    let city = run_lay(&command(&repo.0, &["--lock"]), &mut saved, 2, strides).expect("a city");
    let shas: Vec<String> = git(&repo.0, &["rev-list", "--reverse", "HEAD"])
        .lines()
        .map(str::to_owned)
        .collect();
    assert_eq!(
        saved.lines[0],
        "history/schedule commits=5 coarse=4 tail=4 from=0 laid=3"
    );
    let saves: Vec<&String> = saved.lines.iter().filter(|l| l.starts_with("lock/saved")).collect();
    assert_eq!(
        saves,
        [
            &format!("lock/saved commit={} index=3", shas[3]),
            &format!("lock/saved commit={} index=4", shas[4])
        ]
    );
    assert!(
        saved
            .lines
            .last()
            .expect("a summary")
            .contains(" commits=5 laid=3 lots=60 ")
    );
    // Every file is laid at the end, though the fold laid three of the five commits.
    assert_eq!(city.towns.iter().map(|t| t.stats.lots).sum::<i64>(), 60);
    // Resumed from the lock saved along the way, the fold lays that commit again, then the rest of the schedule.
    let mut resumed = Memory::default();
    resumed.files.insert(repo.0.join(LOCKFILE), saved.writes[0].1.clone());
    assert_eq!(
        run_lay(&command(&repo.0, &[]), &mut resumed, 2, strides).expect("a city"),
        city
    );
    assert!(
        resumed
            .lines
            .contains(&"history/schedule commits=5 coarse=4 tail=4 from=3 laid=2".to_owned())
    );
    assert!(resumed.lines.last().expect("a summary").contains(" commits=2 laid=2 "));
}

#[test]
fn saves_the_lock_along_the_way_so_a_fold_cut_short_resumes_where_it_was() {
    let repo = repo(5);
    let mut saved = Memory::default();
    let city = run_lay(&command(&repo.0, &["--lock"]), &mut saved, 2, FOLD_STRIDES).expect("a city");
    let shas: Vec<String> = git(&repo.0, &["rev-list", "--reverse", "HEAD"])
        .lines()
        .map(str::to_owned)
        .collect();
    let saves: Vec<&String> = saved.lines.iter().filter(|l| l.starts_with("lock/saved")).collect();
    assert_eq!(
        saves,
        [
            &format!("lock/saved commit={} index=1", shas[1]),
            &format!("lock/saved commit={} index=3", shas[3]),
            &format!("lock/saved commit={} index=4", shas[4])
        ]
    );
    let mut resumed = Memory::default();
    resumed.files.insert(repo.0.join(LOCKFILE), saved.writes[1].1.clone());
    assert_eq!(
        run_lay(&command(&repo.0, &[]), &mut resumed, 1000, FOLD_STRIDES).expect("a city"),
        city
    );
    assert!(
        resumed
            .lines
            .contains(&format!("lock/resume commit={} index=3", shas[3]))
    );
}

#[test]
fn ignores_a_lockfile_for_another_land_setting_or_off_the_history() {
    let repo = repo(2);
    let mut first = Memory::default();
    run_lay(&command(&repo.0, &["--lock"]), &mut first, 1000, FOLD_STRIDES).expect("a city");
    let lock = first.files[&repo.0.join(LOCKFILE)].clone();
    let mut tests = Memory::default();
    tests.files.insert(repo.0.join(LOCKFILE), lock.clone());
    run_lay(&command(&repo.0, &["--tests"]), &mut tests, 1000, FOLD_STRIDES).expect("a city");
    assert!(tests.lines.iter().any(|l| l.starts_with("lock/ignored reason=setting")));
    // A lock folded under other toggles is set aside too: the history folds afresh, never continued.
    let setting = String::from(
        lock.split("\"setting\":\"")
            .nth(1)
            .and_then(|rest| rest.split('"').next())
            .expect("a setting"),
    );
    assert!(setting.ends_with("|toggles:corridor,tiers"));
    let mut untoggled = Memory::default();
    untoggled.files.insert(repo.0.join(LOCKFILE), lock.clone());
    run_lay(&command(&repo.0, &["--toggles="]), &mut untoggled, 1000, FOLD_STRIDES).expect("a city");
    assert!(
        untoggled
            .lines
            .contains(&format!("lock/ignored reason=setting lock={setting}"))
    );
    git(&repo.0, &["checkout", "-q", "-b", "other", "HEAD~1"]);
    std::fs::write(repo.0.join("x.ts"), "x").expect("a file");
    git(&repo.0, &["add", "-A"]);
    git(
        &repo.0,
        &[
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-q",
            "-m",
            "other",
        ],
    );
    let mut off = Memory::default();
    off.files.insert(repo.0.join(LOCKFILE), lock);
    run_lay(&command(&repo.0, &[]), &mut off, 1000, FOLD_STRIDES).expect("a city");
    assert!(
        off.lines
            .iter()
            .any(|l| l.starts_with("lock/ignored reason=not-an-ancestor"))
    );
}

#[test]
fn lays_one_state_without_its_history_every_file_at_once() {
    let repo = repo(3);
    let mut io = Memory::default();
    let city = run_lay(
        &command(&repo.0, &["--no-history", "--out=city.json"]),
        &mut io,
        1000,
        FOLD_STRIDES,
    )
    .expect("a city");
    assert!(
        io.lines
            .last()
            .expect("a summary")
            .contains(" commits=1 laid=1 lots=36 overflow=0 ms=")
    );
    assert_eq!(parse_city(&io.files[Path::new("city.json")]).expect("json"), city);
    let first = git(&repo.0, &["rev-list", "--reverse", "HEAD"])
        .lines()
        .next()
        .expect("a commit")
        .to_owned();
    let earlier = run_lay(
        &command(&repo.0, &["--no-history", &format!("--to={first}")]),
        &mut Memory::default(),
        1000,
        FOLD_STRIDES,
    )
    .expect("a city");
    assert_eq!(earlier.towns.iter().map(|t| t.stats.lots).sum::<i64>(), 12);
    assert!(!io.files.contains_key(&repo.0.join(LOCKFILE)));
}

#[test]
fn exits_with_the_usage_code_and_names_every_failure() {
    let mut errors = Vec::new();
    let mut io = Memory::default();
    assert_eq!(
        main_with(&["--help".to_owned()], &mut io, &mut |l| errors.push(l.to_owned())),
        0
    );
    assert!(io.lines[0].contains("Usage: citymap"));
    assert_eq!(main_with(&[], &mut io, &mut |l| errors.push(l.to_owned())), 2);
    assert_eq!(errors[0], "error cli/usage: name one repository");
    errors.clear();
    assert_eq!(
        main_with(&["/no/such/repository".to_owned()], &mut io, &mut |l| errors
            .push(l.to_owned())),
        1
    );
    assert!(errors[0].starts_with("error history/git-failed"), "{}", errors[0]);
}
