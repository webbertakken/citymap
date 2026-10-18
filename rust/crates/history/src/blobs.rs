//! Reads blobs by hash through a long-lived `git cat-file --batch`. A blob the repository does not hold reads as none:
//! git reports it missing, or (before 2.44) exits on the fetch it may not make, and the blobs after it are asked of a
//! fresh process. In a partial clone, where asking for a missing blob costs git seconds, only the blobs the clone holds
//! are asked for.
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Stdio};

use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::env::{git_command, git_data_command};

const PARTIAL_CLONE: &str = "^(extensions\\.partialclone|remote\\..*\\.promisor)$";

struct Batch {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl Drop for Batch {
    fn drop(&mut self) {
        // Closing stdin ends the batch; the process is then reaped.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Which blobs a repository holds, once known.
enum Held {
    Unknown,
    /// A full clone holds them all.
    All,
    /// A partial clone holds these.
    Only(HashSet<String>),
}

/// One answer of the batch process.
enum Answer {
    Bytes(Vec<u8>),
    Missing,
    /// The output ended first: the process is gone.
    Ended,
}

pub struct BlobReader {
    dir: PathBuf,
    /// Whether `dir` is git data itself (a submodule's), not a repository's folder.
    git_data: bool,
    batch: Option<Batch>,
    held: Held,
}

/// A git command for blob reads: no protocol is allowed, so a blob-less clone never fetches, whichever git.
fn blob_git(dir: &Path, git_data: bool, args: &[&str]) -> std::process::Command {
    let mut command = if git_data {
        git_data_command(dir, args)
    } else {
        git_command(dir, args)
    };
    command.env("GIT_ALLOW_PROTOCOL", "none");
    command
}

/// The blobs a partial clone holds, or none when the repository is not one (or git cannot say).
fn held_blobs(dir: &Path, git_data: bool) -> Result<Held> {
    let config = blob_git(dir, git_data, &["config", "--get-regexp", PARTIAL_CLONE]).output();
    if !config.is_ok_and(|out| out.status.success()) {
        // No such setting, or no repository: not a partial clone; the batch reports whatever is missing.
        return Ok(Held::All);
    }
    let listing = blob_git(
        dir,
        git_data,
        &[
            "cat-file",
            "--batch-check=%(objecttype) %(objectname)",
            "--batch-all-objects",
            "--unordered",
        ],
    )
    .output()
    .map_err(|e| {
        CitymapError::new(
            ErrorCode::HistoryGitFailed,
            format!("git cat-file could not start: {e}"),
        )
    })?;
    if !listing.status.success() {
        let stderr = String::from_utf8_lossy(&listing.stderr);
        return Err(CitymapError::new(
            ErrorCode::HistoryGitFailed,
            format!(
                "git cat-file exited with {}: {}",
                listing.status.code().unwrap_or(-1),
                stderr.split('\n').next().unwrap_or("")
            ),
        ));
    }
    Ok(Held::Only(
        String::from_utf8_lossy(&listing.stdout)
            .split('\n')
            .filter_map(|line| line.strip_prefix("blob "))
            .map(str::to_owned)
            .collect(),
    ))
}

fn start(dir: &Path, git_data: bool) -> Option<Batch> {
    let mut child = blob_git(dir, git_data, &["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let stdin = child.stdin.take()?;
    let stdout = BufReader::new(child.stdout.take()?);
    Some(Batch { child, stdin, stdout })
}

/// One answer: `<hash> missing`, or `<hash> blob <size>`, the content and a newline. None when the output ends first.
fn answer(batch: &mut Batch) -> Answer {
    let mut header = Vec::new();
    if batch.stdout.read_until(b'\n', &mut header).unwrap_or(0) == 0 || header.last() != Some(&b'\n') {
        return Answer::Ended;
    }
    let header = String::from_utf8_lossy(&header[..header.len() - 1]).into_owned();
    let mut words = header.split(' ');
    let (_, kind, size) = (words.next(), words.next(), words.next());
    let size = match (kind, size, words.next()) {
        (Some("blob"), Some(size), None) => size.parse::<usize>().ok(),
        _ => None,
    };
    let Some(size) = size else { return Answer::Missing };
    let mut content = vec![0; size + 1];
    if batch.stdout.read_exact(&mut content).is_err() {
        return Answer::Ended;
    }
    content.pop();
    Answer::Bytes(content)
}

impl BlobReader {
    /// A reader of the repository in `dir`.
    #[must_use]
    pub fn new(dir: &Path) -> Self {
        Self {
            dir: dir.to_path_buf(),
            git_data: false,
            batch: None,
            held: Held::Unknown,
        }
    }

    /// A reader of the git data at `dir` (a submodule's).
    #[must_use]
    pub fn on_git_data(dir: &Path) -> Self {
        Self {
            git_data: true,
            ..Self::new(dir)
        }
    }

    /// Each blob's text, or none when the repository does not hold it.
    pub fn read_all(&mut self, blobs: &[String]) -> Result<HashMap<String, Option<String>>> {
        let mut texts = HashMap::new();
        self.read_bytes(blobs, &mut |blob, bytes| {
            texts.insert(blob.to_owned(), bytes.map(|b| String::from_utf8_lossy(b).into_owned()));
        })?;
        Ok(texts)
    }

    /// Hands each blob's bytes to `on_blob` as it arrives (none when the repository does not hold it), keeping none.
    pub fn read_bytes(&mut self, blobs: &[String], on_blob: &mut dyn FnMut(&str, Option<&[u8]>)) -> Result<()> {
        if blobs.is_empty() {
            return Ok(());
        }
        if matches!(self.held, Held::Unknown) {
            self.held = held_blobs(&self.dir, self.git_data)?;
        }
        let held = match &self.held {
            Held::Only(blobs) => Some(blobs),
            Held::Unknown | Held::All => None,
        };
        let mut ask = Vec::new();
        for blob in blobs {
            if held.is_some_and(|h| !h.contains(blob)) {
                on_blob(blob, None);
            } else {
                ask.push(blob.clone());
            }
        }
        for blob in ask {
            let bytes = self.ask(&blob);
            on_blob(&blob, bytes.as_deref());
        }
        Ok(())
    }

    /// One blob, asked of the batch process; a process that ended at this blob is replaced for the next one.
    fn ask(&mut self, blob: &str) -> Option<Vec<u8>> {
        if self.batch.is_none() {
            self.batch = start(&self.dir, self.git_data);
        }
        let batch = self.batch.as_mut()?;
        let asked = batch
            .stdin
            .write_all(format!("{blob}\n").as_bytes())
            .and_then(|()| batch.stdin.flush());
        match asked.map_or(Answer::Ended, |()| answer(batch)) {
            Answer::Bytes(bytes) => Some(bytes),
            Answer::Missing => None,
            Answer::Ended => {
                self.batch = None;
                None
            }
        }
    }
}
