//! Which commit a ref names, and whether one commit is in another's history.
use std::path::Path;

use citymap_ground_plan::{CitymapError, ErrorCode, Result};

use crate::env::git_command;

struct Run {
    code: i32,
    stdout: String,
    stderr: String,
}

/// Runs git with an argument list; resolves its exit code and output. A git that could not start is code −1.
fn git(dir: &Path, args: &[&str]) -> Run {
    let mut all = vec!["-c", "core.hooksPath=/dev/null"];
    all.extend_from_slice(args);
    match git_command(dir, &all).output() {
        Ok(out) => Run {
            code: out.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        },
        Err(e) => Run {
            code: -1,
            stdout: String::new(),
            stderr: e.to_string(),
        },
    }
}

fn failed(args: &[&str], run: &Run) -> CitymapError {
    let first = run.stderr.split('\n').next().unwrap_or("");
    CitymapError::new(
        ErrorCode::HistoryGitFailed,
        format!("git {} exited with {}: {first}", args[0], run.code),
    )
    .with("code", &run.code)
}

/// True when `ancestor` is in the history of `commit` (or is it).
pub fn is_ancestor(dir: &Path, ancestor: &str, commit: &str) -> Result<bool> {
    let args = ["merge-base", "--is-ancestor", ancestor, commit];
    let run = git(dir, &args);
    match run.code {
        0 => Ok(true),
        1 => Ok(false),
        _ => Err(failed(&args, &run)),
    }
}

/// The commit id a ref names.
pub fn resolve_commit(dir: &Path, reference: &str) -> Result<String> {
    let spec = format!("{reference}^{{commit}}");
    let args = ["rev-parse", "--verify", "--quiet", spec.as_str()];
    let run = git(dir, &args);
    if run.code == 0 {
        Ok(run.stdout.trim().to_owned())
    } else {
        Err(failed(&args, &run))
    }
}
