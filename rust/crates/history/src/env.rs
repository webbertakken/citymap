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
    command.arg("-C").arg(dir);
    with_environment(command, args)
}

/// A git command on a repository's git data itself (`--git-dir=<data>`), in the same environment as `git_command`. Its
/// working tree is named as the git data itself: git would otherwise change into the configured `core.worktree`, and
/// fail where that folder is gone (a submodule deinitialised, moved or removed).
#[must_use]
pub fn git_data_command(git_dir: &Path, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    for name in ["--git-dir=", "--work-tree="] {
        let mut flag = std::ffi::OsString::from(name);
        flag.push(git_dir);
        command.arg(flag);
    }
    with_environment(command, args)
}

fn with_environment(mut command: Command, args: &[&str]) -> Command {
    command.args(args).env("GIT_NO_LAZY_FETCH", "1");
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

    #[test]
    fn points_git_at_git_data_as_its_own_working_tree() {
        let command = git_data_command(Path::new("/r/.git/modules/x"), &["ls-tree"]);
        let args: Vec<_> = command.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(
            args,
            [
                "--git-dir=/r/.git/modules/x",
                "--work-tree=/r/.git/modules/x",
                "ls-tree"
            ]
        );
        assert!(command.get_envs().any(|(k, v)| k == "GIT_DIR" && v.is_none()));
    }
}
