//! The only error the engine returns: a stable code, a message, and structured detail for logs.
use std::fmt;

/// Every rejection citymap makes, by its stable code.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ErrorCode {
    FixedBadDivisor,
    FixedOverflow,
    FixedNegativeSqrt,
    FixedZeroDirection,
    FixedWarpFolds,
    SnapshotBadShape,
    SnapshotNotSorted,
    SnapshotDuplicatePath,
    SnapshotBadPath,
    SnapshotTooLarge,
    SnapshotBadIndex,
    PlatBadJson,
    PlatBadVersion,
    PlatTooNew,
    PlatBadShape,
    CityBadJson,
    CityBadShape,
    CityTooLarge,
    PlatSettingMismatch,
    HistoryNotARepo,
    HistoryGitFailed,
    HistoryParse,
    CliUsage,
    LockBadJson,
    LockBadShape,
    GithubBadName,
    GithubNotFound,
    GithubRateLimited,
    GithubFailed,
    GithubOffline,
    EngineInvariant,
    /// A failure outside the engine (an I/O error the CLI meets).
    EngineUnexpected,
}

impl ErrorCode {
    /// Every code, in the order the TypeScript union lists them, then the CLI's own.
    pub const ALL: [Self; 32] = [
        Self::FixedBadDivisor,
        Self::FixedOverflow,
        Self::FixedNegativeSqrt,
        Self::FixedZeroDirection,
        Self::FixedWarpFolds,
        Self::SnapshotBadShape,
        Self::SnapshotNotSorted,
        Self::SnapshotDuplicatePath,
        Self::SnapshotBadPath,
        Self::SnapshotTooLarge,
        Self::SnapshotBadIndex,
        Self::PlatBadJson,
        Self::PlatBadVersion,
        Self::PlatTooNew,
        Self::PlatBadShape,
        Self::CityBadJson,
        Self::CityBadShape,
        Self::CityTooLarge,
        Self::PlatSettingMismatch,
        Self::HistoryNotARepo,
        Self::HistoryGitFailed,
        Self::HistoryParse,
        Self::CliUsage,
        Self::LockBadJson,
        Self::LockBadShape,
        Self::GithubBadName,
        Self::GithubNotFound,
        Self::GithubRateLimited,
        Self::GithubFailed,
        Self::GithubOffline,
        Self::EngineInvariant,
        Self::EngineUnexpected,
    ];

    /// The code as written in logs: `fixed/bad-divisor` and so on.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::FixedBadDivisor => "fixed/bad-divisor",
            Self::FixedOverflow => "fixed/overflow",
            Self::FixedNegativeSqrt => "fixed/negative-sqrt",
            Self::FixedZeroDirection => "fixed/zero-direction",
            Self::FixedWarpFolds => "fixed/warp-folds",
            Self::SnapshotBadShape => "snapshot/bad-shape",
            Self::SnapshotNotSorted => "snapshot/not-sorted",
            Self::SnapshotDuplicatePath => "snapshot/duplicate-path",
            Self::SnapshotBadPath => "snapshot/bad-path",
            Self::SnapshotTooLarge => "snapshot/too-large",
            Self::SnapshotBadIndex => "snapshot/bad-index",
            Self::PlatBadJson => "plat/bad-json",
            Self::PlatBadVersion => "plat/bad-version",
            Self::PlatTooNew => "plat/too-new",
            Self::PlatBadShape => "plat/bad-shape",
            Self::CityBadJson => "city/bad-json",
            Self::CityBadShape => "city/bad-shape",
            Self::CityTooLarge => "city/too-large",
            Self::PlatSettingMismatch => "plat/setting-mismatch",
            Self::HistoryNotARepo => "history/not-a-repo",
            Self::HistoryGitFailed => "history/git-failed",
            Self::HistoryParse => "history/parse",
            Self::CliUsage => "cli/usage",
            Self::LockBadJson => "lock/bad-json",
            Self::LockBadShape => "lock/bad-shape",
            Self::GithubBadName => "github/bad-name",
            Self::GithubNotFound => "github/not-found",
            Self::GithubRateLimited => "github/rate-limited",
            Self::GithubFailed => "github/failed",
            Self::GithubOffline => "github/offline",
            Self::EngineInvariant => "engine/invariant",
            Self::EngineUnexpected => "engine/unexpected",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A named rejection: `code: message`, with detail fields for logs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CitymapError {
    pub code: ErrorCode,
    pub message: String,
    pub detail: Vec<(&'static str, String)>,
}

impl CitymapError {
    #[must_use]
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: Vec::new(),
        }
    }

    /// The error with one more detail field.
    #[must_use]
    pub fn with(mut self, key: &'static str, value: &impl ToString) -> Self {
        self.detail.push((key, value.to_string()));
        self
    }
}

impl fmt::Display for CitymapError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CitymapError {}

pub type Result<T, E = CitymapError> = std::result::Result<T, E>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_every_code_the_typescript_engine_names() {
        let source = include_str!("../../../../packages/ground-plan/src/errors.ts");
        let union = &source[source.find("export type ErrorCode").expect("the union")..];
        let union = &union[..union.find(';').expect("its end")];
        let typescript: Vec<&str> = union.split('"').skip(1).step_by(2).collect();
        let rust: Vec<&str> = ErrorCode::ALL
            .iter()
            .map(|c| c.as_str())
            .filter(|c| *c != "engine/unexpected")
            .collect();
        assert_eq!(rust, typescript);
    }

    #[test]
    fn displays_the_code_and_message_as_typescript_does() {
        let error = CitymapError::new(ErrorCode::CliUsage, "name one repository").with("at", &3);
        assert_eq!(error.to_string(), "cli/usage: name one repository");
        assert_eq!(error.detail, vec![("at", "3".to_owned())]);
        assert_eq!(ErrorCode::EngineInvariant.to_string(), "engine/invariant");
    }
}
