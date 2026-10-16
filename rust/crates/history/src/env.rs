//! The environment git runs in: no repository overrides, no hooks, and never a fetch.
use std::path::Path;
use std::process::Command;

/// Variables that point git at a repository. A git hook sets them, and they would override `git -C <dir>`.
const REPOSITORY_VARIABLES: [&str; 8] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_PREFIX",
    "GIT_NAMESPACE",
];

/// A git command on a named folder: without repository overrides, and never fetching blobs. Arguments are passed as
/// an array, never through a shell.
#[must_use]
pub fn git_command(dir: &Path, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    command.arg("-C").arg(dir).args(args).env("GIT_NO_LAZY_FETCH", "1");
    for name in REPOSITORY_VARIABLES {
        command.env_remove(name);
    }
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clears_repository_overrides_and_forbids_lazy_fetches() {
        let command = git_command(Path::new("/tmp"), &["status"]);
        let envs: Vec<(String, Option<String>)> = command
            .get_envs()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().into_owned(),
                    v.map(|v| v.to_string_lossy().into_owned()),
                )
            })
            .collect();
        assert!(envs.contains(&("GIT_NO_LAZY_FETCH".to_owned(), Some("1".to_owned()))));
        assert!(envs.contains(&("GIT_DIR".to_owned(), None)));
        let args: Vec<_> = command.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args, ["-C", "/tmp", "status"]);
    }
}
