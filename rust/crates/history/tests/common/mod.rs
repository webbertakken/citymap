//! Real git repositories in a temporary folder, for the readers' tests.
#![allow(dead_code)]
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT: AtomicUsize = AtomicUsize::new(0);

/// A temporary repository on branch main, removed when dropped.
pub struct Repo(pub PathBuf);

impl Drop for Repo {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Runs git in a folder, as the TypeScript tests do: file transport allowed, no repository overrides.
pub fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["-c", "protocol.file.allow=always"])
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_owned()
}

impl Repo {
    /// An empty repository.
    pub fn new() -> Self {
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("citymap-repo-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("a temporary folder");
        let repo = Self(dir);
        repo.git(&["init", "-q", "-b", "main"]);
        repo
    }

    /// A repository holding the given files, committed once.
    pub fn with(files: &[(&str, &str)]) -> Self {
        let repo = Self::new();
        for (path, text) in files {
            repo.write(path, text);
        }
        repo.commit("start");
        repo
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// The repository's folder as text, for git arguments.
    pub fn url(&self) -> String {
        self.0.display().to_string()
    }

    pub fn git(&self, args: &[&str]) -> String {
        git(&self.0, args)
    }

    pub fn write(&self, path: &str, text: &str) {
        let full = self.0.join(path);
        std::fs::create_dir_all(full.parent().expect("a parent")).expect("folders");
        std::fs::write(full, text).expect("a file");
    }

    /// Stages everything and commits; the new commit's id.
    pub fn commit(&self, message: &str) -> String {
        self.git(&["add", "-A"]);
        self.commit_index(message)
    }

    /// Commits the index as staged (for gitlinks staged by hand); the commit's id.
    pub fn commit_index(&self, message: &str) -> String {
        self.git(&[
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            message,
        ]);
        self.git(&["rev-parse", "HEAD"])
    }
}
