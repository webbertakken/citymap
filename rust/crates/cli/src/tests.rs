//! The CLI on real, temporary repositories, with the outside world in memory.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command as Git;
use std::sync::atomic::{AtomicUsize, Ordering};

use citymap_ground_plan::Result;
use citymap_ground_plan::city::{City, parse_city};
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

/// The city of a city file, its measures set aside.
fn layout_of(text: &str) -> City {
    let mut value: serde_json::Value = serde_json::from_str(text).expect("JSON");
    value.as_object_mut().expect("an object").remove("measures");
    parse_city(&value.to_string()).expect("a city")
}

/// The measures of a file of a city file, by its path.
fn file_of(text: &str, path: &str) -> serde_json::Value {
    let value: serde_json::Value = serde_json::from_str(text).expect("JSON");
    value["measures"]["lots"]
        .as_object()
        .expect("towns")
        .values()
        .flat_map(|town| town.as_object().expect("lots").values())
        .flat_map(|lot| lot["files"].as_array().expect("files").iter())
        .find(|file| file["path"] == path)
        .cloned()
        .unwrap_or_default()
}

/// A repository of sources, a test that names one, a manifest and an image, by two people.
fn measured() -> Repo {
    let n = NEXT.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("citymap-cli-measures-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("src")).expect("a folder");
    git(&dir, &["init", "-q", "-b", "main"]);
    let commit_as = |email: &str| {
        git(&dir, &["add", "-A"]);
        git(
            &dir,
            &[
                "-c",
                &format!("user.email={email}"),
                "-c",
                "user.name=x",
                "commit",
                "-q",
                "-m",
                email,
            ],
        );
    };
    std::fs::write(dir.join("src/a.ts"), "// TODO: a\nexport const a = 1;\n").expect("a file");
    std::fs::write(dir.join("src/b.ts"), "export const b = 2;\n").expect("a file");
    std::fs::write(dir.join("src/copy.ts"), "export const b = 2;\n").expect("a file");
    std::fs::write(dir.join("src/a.test.ts"), "test();\n").expect("a file");
    std::fs::write(dir.join("package.json"), "{}\n").expect("a file");
    commit_as("ann@x.org");
    std::fs::write(
        dir.join("src/a.ts"),
        "// TODO: a\nexport const a = 1;\nexport const c = 3;\n",
    )
    .expect("a file");
    std::fs::write(dir.join("logo.png"), [0x89, 0, 1, 2]).expect("a file");
    commit_as("bob@x.org");
    Repo(dir)
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
    assert_eq!(layout_of(&io.files[Path::new("city.json")]), city);
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
    assert_eq!(layout_of(&io.files[Path::new("city.json")]), city);
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

#[test]
fn writes_sizes_comments_tests_by_name_and_history_beside_the_layout() {
    let repo = measured();
    let mut io = Memory::default();
    let city = run_lay(&command(&repo.0, &["--out=city.json"]), &mut io, 1000, FOLD_STRIDES).expect("a city");
    let text = io.files[Path::new("city.json")].clone();
    assert_eq!(layout_of(&text), city);
    let a = file_of(&text, "src/a.ts");
    assert_eq!(
        (
            &a["bytes"],
            &a["lines"],
            &a["comments"],
            &a["todos"],
            &a["named"],
            &a["commits"],
            &a["authors"]
        ),
        (
            &51.into(),
            &3.into(),
            &1.into(),
            &1.into(),
            &true.into(),
            &2.into(),
            &2.into()
        )
    );
    assert_eq!(file_of(&text, "src/b.ts")["named"], false);
    assert_eq!(file_of(&text, "logo.png")["bytes"], 4);
    assert_eq!(file_of(&text, "logo.png")["lines"], serde_json::Value::Null);
    assert_eq!(
        io.lines[io.lines.len() - 2],
        "measures/done source=cli size=lines tested=name lots=5 files=5 read=6 unread=0"
    );
    let mut bare = Memory::default();
    run_lay(
        &command(&repo.0, &["--out=city.json", "--no-measures"]),
        &mut bare,
        1000,
        FOLD_STRIDES,
    )
    .expect("a city");
    let without = bare.files[Path::new("city.json")].clone();
    assert!(!without.contains("\"measures\""));
    assert_eq!(layout_of(&without), city);
}

#[test]
fn reads_coverage_named_or_at_the_usual_paths_and_says_which_it_skipped() {
    let repo = measured();
    let lcov = "SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\nSF:gone.ts\nDA:1,1\nend_of_record\n";
    let report = repo.0.join("report.info");
    let mut named = Memory::default();
    named.files.insert(report.clone(), lcov.to_owned());
    let flag = format!("--coverage={}", report.display());
    run_lay(
        &command(&repo.0, &["--out=city.json", &flag]),
        &mut named,
        1000,
        FOLD_STRIDES,
    )
    .expect("a city");
    let text = named.files[Path::new("city.json")].clone();
    assert_eq!(
        (
            file_of(&text, "src/a.ts")["covered"].clone(),
            file_of(&text, "src/a.ts")["executable"].clone()
        ),
        (1.into(), 2.into())
    );
    assert_eq!(file_of(&text, "src/b.ts")["named"], serde_json::Value::Null);
    assert!(named.lines.contains(&format!(
        "measures/report path={} format=lcov files=2 matched=1",
        report.display()
    )));
    let mut usual = Memory::default();
    usual.files.insert(repo.0.join("coverage/lcov.info"), lcov.to_owned());
    usual.files.insert(repo.0.join("coverage.xml"), "<html/>".to_owned());
    usual
        .files
        .insert(repo.0.join("lcov.info"), "x".repeat(300 * 1024 * 1024));
    run_lay(
        &command(&repo.0, &["--out=city.json", "--no-history"]),
        &mut usual,
        1000,
        FOLD_STRIDES,
    )
    .expect("a city");
    assert!(
        usual
            .lines
            .contains(&"measures/report-skipped path=lcov.info reason=too-large".to_owned())
    );
    assert!(
        usual
            .lines
            .contains(&"measures/report-skipped path=coverage.xml reason=unreadable".to_owned())
    );
    assert!(
        usual
            .lines
            .contains(&"measures/report path=coverage/lcov.info format=lcov files=2 matched=1".to_owned())
    );
    let text = usual.files[Path::new("city.json")].clone();
    assert!(text.contains("\"available\":[\"size\",\"tested\",\"kind\",\"comments\"]"));
}

#[test]
fn rejects_a_named_report_that_is_missing_unreadable_or_too_large() {
    let repo = measured();
    let code = |files: &[(&str, String)], flag: &str| {
        let mut io = Memory::default();
        for (path, text) in files {
            io.files.insert(PathBuf::from(path), text.clone());
        }
        run_lay(&command(&repo.0, &["--out=c.json", flag]), &mut io, 1000, FOLD_STRIDES)
            .expect_err("a rejection")
            .to_string()
    };
    assert!(code(&[], "--coverage=/nowhere").starts_with("coverage/missing"));
    assert!(code(&[("r.xml", "<x/>".into())], "--coverage=r.xml").starts_with("coverage/unreadable"));
    assert!(
        code(&[("r", "x".repeat(300 * 1024 * 1024))], "--coverage=r")
            .starts_with("coverage/unreadable: r is larger than")
    );
}

#[test]
fn measures_a_partial_clone_without_fetching() {
    let source = measured();
    git(&source.0, &["config", "uploadpack.allowFilter", "true"]);
    let n = NEXT.fetch_add(1, Ordering::SeqCst);
    let clone = Repo(std::env::temp_dir().join(format!("citymap-cli-partial-{}-{n}", std::process::id())));
    let _ = std::fs::remove_dir_all(&clone.0);
    let url = format!("file://{}", source.0.display());
    let out = Git::new("git")
        .args(["clone", "-q", "--no-checkout", "--filter=blob:none", &url])
        .arg(&clone.0)
        .output()
        .expect("git runs");
    assert!(out.status.success());
    let mut io = Memory::default();
    run_lay(&command(&clone.0, &["--out=city.json"]), &mut io, 1000, FOLD_STRIDES).expect("a city");
    assert_eq!(
        io.lines[io.lines.len() - 2],
        "measures/done source=cli size=lines tested=name lots=5 files=5 read=0 unread=6"
    );
    let a = file_of(&io.files[Path::new("city.json")], "src/a.ts");
    assert_eq!(
        (a["bytes"].clone(), a["named"].clone(), a["commits"].clone()),
        (serde_json::Value::Null, true.into(), 2.into())
    );
}

/// A fresh folder named `fixture`, so every copy lays under the same repository name.
fn fixture_folder() -> (Repo, PathBuf) {
    let n = NEXT.fetch_add(1, Ordering::SeqCst);
    let parent = std::env::temp_dir().join(format!("citymap-cli-mailmap-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&parent);
    std::fs::create_dir_all(&parent).expect("a folder");
    let dir = parent.join("fixture");
    (Repo(parent), dir)
}

/// Ann under two addresses and Bob; the last commit's .mailmap makes Ann one person, an earlier one knew nobody.
fn mailmapped() -> (Repo, PathBuf) {
    let (parent, dir) = fixture_folder();
    std::fs::create_dir_all(dir.join("src")).expect("a folder");
    git(&dir, &["init", "-q", "-b", "main"]);
    let commit_as = |name: &str, email: &str| {
        git(&dir, &["add", "-A"]);
        let (email_flag, name_flag) = (format!("user.email={email}"), format!("user.name={name}"));
        git(
            &dir,
            &["-c", &email_flag, "-c", &name_flag, "commit", "-q", "-m", email],
        );
    };
    std::fs::write(dir.join("src/a.ts"), "1\n").expect("a file");
    commit_as("Ann", "ann@old.org");
    std::fs::write(dir.join("src/a.ts"), "2\n").expect("a file");
    std::fs::write(dir.join(".mailmap"), "# nobody yet\n").expect("a file");
    commit_as("Ann", "ann@new.org");
    std::fs::write(dir.join("src/a.ts"), "3\n").expect("a file");
    commit_as("Bob", "bob@x.org");
    std::fs::write(dir.join(".mailmap"), "Ann <ann@new.org> <ann@old.org>\n").expect("a file");
    commit_as("Bob", "bob@x.org");
    (parent, dir)
}

/// The city file a fold writes, and its log without timings.
fn lay_city(dir: &Path, flags: &[&str]) -> (String, Vec<String>) {
    let mut io = Memory::default();
    let mut all = vec!["--out=city.json"];
    all.extend_from_slice(flags);
    run_lay(&command(dir, &all), &mut io, 1000, FOLD_STRIDES).expect("a city");
    let lines = io
        .lines
        .iter()
        .map(|l| l.split(" ms=").next().unwrap_or(l).to_owned())
        .collect();
    (io.files[Path::new("city.json")].clone(), lines)
}

#[test]
fn lays_the_same_city_with_and_without_a_checkout_whatever_the_working_trees_mailmap_and_gits_settings() {
    let (_source, source) = mailmapped();
    let (_bare, bare) = fixture_folder();
    git(
        &source,
        &[
            "clone",
            "-q",
            "--no-checkout",
            &source.display().to_string(),
            &bare.display().to_string(),
        ],
    );
    let (_checked, checked) = fixture_folder();
    git(
        &source,
        &[
            "clone",
            "-q",
            &source.display().to_string(),
            &checked.display().to_string(),
        ],
    );
    let without = lay_city(&bare, &[]);
    let a = file_of(&without.0, "src/a.ts");
    assert_eq!((&a["commits"], &a["authors"]), (&3.into(), &2.into()));
    assert!(without.1.contains(&"history/mailmap status=read entries=1".to_owned()));
    assert_eq!(lay_city(&checked, &[]), without);
    // A working tree .mailmap and settings that would make everyone one person change nothing.
    let everyone = "One <one@x> <ann@old.org>\nOne <one@x> <ann@new.org>\nOne <one@x> <bob@x.org>\n";
    std::fs::write(checked.join(".mailmap"), everyone).expect("a file");
    let elsewhere = checked.with_file_name("everyone");
    std::fs::write(&elsewhere, everyone).expect("a file");
    git(&checked, &["config", "mailmap.file", &elsewhere.display().to_string()]);
    git(&checked, &["config", "mailmap.blob", "HEAD:.mailmap"]);
    assert_eq!(lay_city(&checked, &[]), without);
}

#[test]
fn maps_authors_by_the_mailmap_of_the_commit_it_lays_and_resumes_to_the_same_city() {
    let (_parent, dir) = mailmapped();
    let earlier = lay_city(&dir, &["--to=HEAD~1"]);
    let a = file_of(&earlier.0, "src/a.ts");
    assert_eq!((&a["commits"], &a["authors"]), (&3.into(), &3.into()));
    assert!(earlier.1.contains(&"history/mailmap status=read entries=0".to_owned()));
    let mut lock_at = Memory::default();
    run_lay(
        &command(&dir, &["--to=HEAD~1", "--lock"]),
        &mut lock_at,
        1000,
        FOLD_STRIDES,
    )
    .expect("a city");
    let lock = lock_at.files[&dir.join(LOCKFILE)].clone();
    let mut resumed = Memory::default();
    resumed.files.insert(dir.join(LOCKFILE), lock);
    run_lay(
        &command(&dir, &["--out=city.json", "--lock"]),
        &mut resumed,
        1000,
        FOLD_STRIDES,
    )
    .expect("a city");
    let saved = git(&dir, &["rev-parse", "HEAD~1"]);
    assert!(resumed.lines.contains(&format!("lock/resume commit={saved} index=2")));
    assert_eq!(resumed.files[Path::new("city.json")], lay_city(&dir, &[]).0);
}
