//! Who an author is, as the laid commit's `.mailmap` says: read from the commit, never from the working tree or git's
//! mailmap settings, so the same history always counts the same people. Lines are read as git's `mailmap.c` reads them.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::blobs::BlobReader;
use crate::env::git_command;
use crate::read::HistoryEvent;

/// A commit's author as written (`%an`, `%ae`), never mapped by git.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Author {
    pub name: String,
    pub email: String,
}

/// What a mailmap says of one commit email: the email it gives (or none), and the emails it gives by author name.
#[derive(Debug, Default)]
struct Entry {
    email: Option<String>,
    by_name: HashMap<String, String>,
}

/// The emails a `.mailmap` maps, keyed by the commit email folded in ASCII.
#[derive(Debug, Default)]
pub struct Mailmap {
    entries: HashMap<String, Entry>,
}

/// What reading a commit's `.mailmap` found.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MailmapStatus {
    Read,
    Fetched,
    Absent,
    NotAFile,
    Unfetchable,
}

impl MailmapStatus {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Fetched => "fetched",
            Self::Absent => "absent",
            Self::NotAFile => "not-a-file",
            Self::Unfetchable => "unfetchable",
        }
    }
}

/// Git's `isspace`: space, tab, line feed and carriage return.
fn trimmed(text: &str) -> &str {
    text.trim_matches([' ', '\t', '\n', '\r'])
}

/// One `Name <email>` pair from the start of a text.
struct Pair<'a> {
    name: Option<&'a str>,
    email: &'a str,
    /// What follows the pair's `>`; none when nothing does.
    rest: Option<&'a str>,
}

/// One pair from the start of `text`, as git's `parse_name_and_email`; none when there is none.
fn pair_of(text: &str, allow_empty_email: bool) -> Option<Pair<'_>> {
    let left = text.find('<')?;
    let right = left + 1 + text[left + 1..].find('>')?;
    if !allow_empty_email && right == left + 1 {
        return None;
    }
    let name = trimmed(&text[..left]);
    let rest = &text[right + 1..];
    Some(Pair {
        name: (!name.is_empty()).then_some(name),
        email: &text[left + 1..right],
        rest: (!rest.is_empty()).then_some(rest),
    })
}

impl Mailmap {
    /// A `.mailmap`'s text, read as git reads a mailmap blob.
    #[must_use]
    pub fn parse(text: &str) -> Self {
        let mut mailmap = Self::default();
        let text = text.split('\0').next().unwrap_or("");
        for line in text.split('\n') {
            if line.starts_with('#') {
                continue;
            }
            let Some(proper) = pair_of(line, false) else {
                continue;
            };
            let commit = proper.rest.and_then(|rest| pair_of(rest, true));
            mailmap.add(&proper, commit.as_ref());
        }
        mailmap
    }

    /// Adds one line's mapping, as git's `add_mapping`: a later line for the same key wins.
    fn add(&mut self, proper: &Pair<'_>, commit: Option<&Pair<'_>>) {
        let key = commit.map_or(proper.email, |c| c.email).to_ascii_lowercase();
        let entry = self.entries.entry(key).or_default();
        match commit {
            Some(Pair { name: Some(name), .. }) => {
                entry.by_name.insert(name.to_ascii_lowercase(), proper.email.to_owned());
            }
            Some(_) => entry.email = Some(proper.email.to_owned()),
            None => {}
        }
    }

    /// The email an author's commits count under: the entry for their name, else for their email, else their own.
    #[must_use]
    pub fn email_of<'a>(&'a self, author: &'a Author) -> &'a str {
        let Some(entry) = self.entries.get(&author.email.to_ascii_lowercase()) else {
            return &author.email;
        };
        entry
            .by_name
            .get(&author.name.to_ascii_lowercase())
            .or(entry.email.as_ref())
            .map_or(&author.email, String::as_str)
    }

    /// How many commit emails it has lines for.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

fn outcome(status: MailmapStatus, mailmap: Mailmap) -> (Mailmap, HistoryEvent) {
    let entries = i64::try_from(mailmap.len()).unwrap_or(i64::MAX);
    let event = HistoryEvent::Mailmap {
        status,
        entries,
        reason: None,
        error: None,
    };
    (mailmap, event)
}

/// How long fetching the one `.mailmap` blob may take before it is given up: a prompt or a stalled network.
pub const MAILMAP_FETCH_TIMEOUT: Duration = Duration::from_secs(30);
/// How often a bounded run is looked at.
const POLL: Duration = Duration::from_millis(10);

/// How a bounded run ended.
#[derive(Debug, PartialEq, Eq)]
pub enum Ended {
    /// It ended by itself: its exit code (none when it could not start, or was killed), output and complaint.
    Ran {
        code: Option<i32>,
        stdout: Vec<u8>,
        stderr: String,
    },
    /// It did not end in time, and was killed.
    Timeout,
}

/// Runs a command, killed after `timeout`; answers at once on a timeout. A process git starts in turn may hold the pipes
/// open after git is killed: they are let go, not waited for.
#[must_use]
pub fn run_within(command: Command, timeout: Duration) -> Ended {
    run_feeding(command, timeout, &[])
}

/// Runs a command as `run_within` does, `input` on its standard input.
#[must_use]
pub fn run_feeding(mut command: Command, timeout: Duration, input: &[u8]) -> Ended {
    command
        .stdin(if input.is_empty() {
            Stdio::null()
        } else {
            Stdio::piped()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            return Ended::Ran {
                code: None,
                stdout: vec![],
                stderr: e.to_string(),
            };
        }
    };
    if let Some(mut stdin) = child.stdin.take() {
        let input = input.to_vec();
        // A process that ends before it reads its input fails the write; its exit says why.
        std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
        });
    }
    let drain = |mut pipe: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            bytes
        })
    };
    let out = drain(Box::new(child.stdout.take().expect("piped")));
    let err = drain(Box::new(child.stderr.take().expect("piped")));
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Ended::Ran {
                    code: status.code(),
                    stdout: out.join().unwrap_or_default(),
                    stderr: String::from_utf8_lossy(&err.join().unwrap_or_default()).into_owned(),
                };
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(POLL),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Ended::Timeout;
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Ended::Ran {
                    code: None,
                    stdout: vec![],
                    stderr: e.to_string(),
                };
            }
        }
    }
}

/// A fetched blob's text, or why it could not be fetched: `timeout`, or `exit-<code>` with git's first line.
#[derive(Debug, PartialEq, Eq)]
pub enum Fetched {
    Text(String),
    Failed { reason: String, error: Option<String> },
}

/// Fetches one blob a partial clone does not hold, and nothing else, and reads it: git's own lazy fetch, allowed for
/// this one call, asks the clone's promisor remotes for that object alone (`fetch.negotiationAlgorithm=noop`,
/// `--filter=blob:none`). Never prompts; given up after `timeout`.
#[must_use]
pub fn fetch_blob(dir: &Path, blob: &str, timeout: Duration) -> Fetched {
    let mut command = git_command(dir, &["cat-file", "blob", blob]);
    command.env_remove("GIT_NO_LAZY_FETCH").env("GIT_TERMINAL_PROMPT", "0");
    match run_within(command, timeout) {
        Ended::Timeout => Fetched::Failed {
            reason: "timeout".to_owned(),
            error: None,
        },
        Ended::Ran {
            code: Some(0), stdout, ..
        } => Fetched::Text(String::from_utf8_lossy(&stdout).into_owned()),
        Ended::Ran { code, stderr, .. } => Fetched::Failed {
            reason: format!("exit-{}", code.map_or_else(|| "null".to_owned(), |c| c.to_string())),
            error: Some(stderr.split('\n').next().unwrap_or("").to_owned()),
        },
    }
}

/// The `.mailmap` at the root of `commit`, read through `blobs`, and what was found. A blob a partial clone does not
/// hold is fetched, alone (`fetch_blob`); one that cannot be is `unfetchable`, and the authors are then unknown.
pub fn read_mailmap(dir: &Path, commit: &str, blobs: &mut BlobReader) -> Result<(Mailmap, HistoryEvent)> {
    // The root's entry, whichever folder of the repository `dir` names.
    let out = git_command(dir, &["ls-tree", "-z", "--full-tree", commit, "--", ".mailmap"])
        .output()
        .map_err(|e| CitymapError::new(ErrorCode::HistoryGitFailed, format!("git ls-tree could not start: {e}")))?;
    if !out.status.success() {
        let code = out.status.code().map_or_else(|| "null".to_owned(), |c| c.to_string());
        let stderr = String::from_utf8_lossy(&out.stderr);
        let first = stderr.split('\n').next().unwrap_or("");
        return Err(CitymapError::new(
            ErrorCode::HistoryGitFailed,
            format!("git ls-tree exited with {code}: {first}"),
        )
        .with("commit", &commit));
    }
    let listing = String::from_utf8_lossy(&out.stdout);
    if listing.is_empty() {
        return Ok(outcome(MailmapStatus::Absent, Mailmap::default()));
    }
    // "<mode> <type> <hash>\t.mailmap"
    let meta = listing.split('\t').next().unwrap_or("");
    let mut fields = meta.split(' ');
    let (mode, blob) = (fields.next().unwrap_or(""), fields.nth(1).unwrap_or(""));
    if mode != "100644" && mode != "100755" {
        return Ok(outcome(MailmapStatus::NotAFile, Mailmap::default()));
    }
    let blob = blob.to_owned();
    if let Some(text) = blobs.read_all(std::slice::from_ref(&blob))?.remove(&blob).flatten() {
        return Ok(outcome(MailmapStatus::Read, Mailmap::parse(&text)));
    }
    Ok(match fetch_blob(dir, &blob, MAILMAP_FETCH_TIMEOUT) {
        Fetched::Text(text) => outcome(MailmapStatus::Fetched, Mailmap::parse(&text)),
        Fetched::Failed { reason, error } => (
            Mailmap::default(),
            HistoryEvent::Mailmap {
                status: MailmapStatus::Unfetchable,
                entries: 0,
                reason: Some(reason),
                error,
            },
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(text: &str, name: &str, email: &str) -> String {
        let author = Author {
            name: name.to_owned(),
            email: email.to_owned(),
        };
        Mailmap::parse(text).email_of(&author).to_owned()
    }

    #[test]
    fn reads_gits_four_forms() {
        assert_eq!(map("Proper Name <commit@x>", "Any", "commit@x"), "commit@x");
        assert_eq!(map("<proper@x> <commit@x>", "Any", "commit@x"), "proper@x");
        assert_eq!(map("Proper Name <proper@x> <commit@x>", "Any", "commit@x"), "proper@x");
        let named = "Proper Name <proper@x> Commit Name <commit@x>";
        assert_eq!(map(named, "Commit Name", "commit@x"), "proper@x");
        assert_eq!(map(named, "Someone Else", "commit@x"), "commit@x");
    }

    #[test]
    fn leaves_an_author_no_line_names_as_they_are() {
        assert_eq!(map("<proper@x> <commit@x>", "Any", "other@x"), "other@x");
        assert_eq!(map("", "", ""), "");
    }

    #[test]
    fn compares_emails_and_names_in_ascii_without_case_and_nothing_else() {
        assert_eq!(map("<proper@x> <Commit@X>", "Any", "cOMMIT@x"), "proper@x");
        assert_eq!(
            map("<proper@x> commit NAME <commit@x>", "Commit Name", "commit@x"),
            "proper@x"
        );
        assert_eq!(map("<proper@x> <ÖLA@x>", "Any", "öla@x"), "öla@x");
        assert_eq!(map("<proper@x> ünal <unal@x>", "Ünal", "unal@x"), "unal@x");
    }

    #[test]
    fn falls_back_from_a_name_it_does_not_know_to_the_simple_entry_of_the_email() {
        let text = "<named@x> Old Name <commit@x>\n<simple@x> <commit@x>";
        assert_eq!(map(text, "Old Name", "commit@x"), "named@x");
        assert_eq!(map(text, "New Name", "commit@x"), "simple@x");
    }

    #[test]
    fn lets_a_later_line_win_but_a_line_without_an_email_keeps_the_email_an_earlier_one_gave() {
        assert_eq!(
            map("<first@x> <commit@x>\n<second@x> <commit@x>", "Any", "commit@x"),
            "second@x"
        );
        assert_eq!(
            map("<first@x> <commit@x>\nProper <commit@x>", "Any", "commit@x"),
            "first@x"
        );
        assert_eq!(
            map("<one@x> Name <commit@x>\n<two@x> NAME <commit@x>", "name", "commit@x"),
            "two@x"
        );
    }

    #[test]
    fn skips_comments_malformed_lines_and_anything_after_a_nul() {
        assert_eq!(map("# <proper@x> <commit@x>", "Any", "commit@x"), "commit@x");
        assert_eq!(map("  # <proper@x> <commit@x>", "Any", "commit@x"), "proper@x");
        assert_eq!(map("<> <commit@x>", "Any", "commit@x"), "commit@x");
        assert_eq!(map("<proper@x <commit@x", "Any", "commit@x"), "commit@x");
        assert_eq!(map("proper@x commit@x", "Any", "commit@x"), "commit@x");
        assert_eq!(
            map("<a@x> <b@x>\0\n<proper@x> <commit@x>", "Any", "commit@x"),
            "commit@x"
        );
        assert_eq!(map("<a@x> <b@x>\0", "Any", "b@x"), "a@x");
    }

    #[test]
    fn keeps_emails_as_written_trims_names_reads_crlf_lines_and_ignores_text_after_the_second_pair() {
        assert_eq!(map("<proper@x> < commit@x >", "Any", "commit@x"), "commit@x");
        assert_eq!(map("<proper@x> < commit@x >", "Any", " commit@x "), "proper@x");
        assert_eq!(
            map("<proper@x> \t Commit Name \t <commit@x>\r", "Commit Name", "commit@x"),
            "proper@x"
        );
        assert_eq!(
            map("<proper@x><commit@x> trailing <x@y>", "Any", "commit@x"),
            "proper@x"
        );
        assert_eq!(map("<proper@x> <commit@x>\r\n", "Any", "commit@x"), "proper@x");
        assert_eq!(map("<proper@x> <>", "Any", ""), "proper@x");
        assert_eq!(map("<proper@x>  only a name", "Any", "proper@x"), "proper@x");
    }

    #[test]
    fn counts_the_emails_it_maps() {
        let mailmap = Mailmap::parse("<a@x> <b@x>\n<c@x> Name <B@x>\nName <d@x>\n# <e@x> <f@x>");
        assert_eq!((mailmap.len(), mailmap.is_empty()), (2, false));
        assert!(Mailmap::default().is_empty());
    }

    #[test]
    fn names_each_status() {
        let names = [
            MailmapStatus::Read,
            MailmapStatus::Fetched,
            MailmapStatus::Absent,
            MailmapStatus::NotAFile,
            MailmapStatus::Unfetchable,
        ]
        .map(MailmapStatus::as_str);
        assert_eq!(names, ["read", "fetched", "absent", "not-a-file", "unfetchable"]);
    }
}
