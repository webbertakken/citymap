//! The fold schedule: which commits of a history the fold lays. Every commit applies to the tree; the layout runs at the
//! end of each window, the recent commits one by one, windows anchored to the root (commit 0).
use citymap_ground_plan::{CitymapError, ErrorCode, Result};

/// The strides of the fold schedule.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Strides {
    /// The tail, laid one by one, holds at least this many commits.
    pub tail: i64,
    /// The stride before the tail.
    pub window: i64,
    /// Commits older than the last this many take the coarse stride.
    pub coarse_after: i64,
    /// The stride of the oldest commits.
    pub coarse_window: i64,
    /// Zone boundaries are multiples of it, counted from the root.
    pub grain: i64,
}

pub const TAIL_COMMITS: i64 = 1000;
pub const WINDOW: i64 = 100;
pub const COARSE_AFTER: i64 = 10_000;
pub const COARSE_WINDOW: i64 = 1000;
pub const ZONE_GRAIN: i64 = 1000;

/// The largest integer a JavaScript number holds exactly: the TypeScript schedule's bound.
pub const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

pub const FOLD_STRIDES: Strides = Strides {
    tail: TAIL_COMMITS,
    window: WINDOW,
    coarse_after: COARSE_AFTER,
    coarse_window: COARSE_WINDOW,
    grain: ZONE_GRAIN,
};

/// Strides that lay every commit: the fold as it runs without windows, for tests and measurements.
pub const EVERY_COMMIT: Strides = Strides {
    tail: MAX_SAFE_INTEGER,
    window: 1,
    coarse_after: MAX_SAFE_INTEGER,
    coarse_window: 1,
    grain: 1,
};

/// The schedule of one history.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FoldSchedule {
    pub commits: i64,
    /// Commits below it fold in windows of `coarse_window`.
    pub coarse_end: i64,
    /// Commits from it on are laid one by one.
    pub tail_start: i64,
    pub strides: Strides,
}

fn reject(field: &str, value: i64, why: &str) -> CitymapError {
    CitymapError::new(ErrorCode::HistoryBadSchedule, format!("{field} {why}"))
        .with("field", &field)
        .with("value", &value)
}

const fn is_count(value: i64) -> bool {
    value >= 0 && value <= MAX_SAFE_INTEGER
}

fn check(commits: i64, strides: &Strides) -> Result<()> {
    if !is_count(commits) {
        return Err(reject("commits", commits, "is not a count of commits"));
    }
    let fields = [
        ("tail", strides.tail),
        ("window", strides.window),
        ("coarseAfter", strides.coarse_after),
        ("coarseWindow", strides.coarse_window),
        ("grain", strides.grain),
    ];
    for (field, value) in fields {
        if !is_count(value) || value == 0 {
            return Err(reject(field, value, "is not a positive integer"));
        }
    }
    // A window that straddled a zone boundary would end in the next zone, off its own stride.
    if strides.grain % strides.window != 0 || strides.grain % strides.coarse_window != 0 {
        return Err(reject(
            "grain",
            strides.grain,
            "is not a multiple of both window strides",
        ));
    }
    if strides.coarse_after < strides.tail {
        return Err(reject("coarseAfter", strides.coarse_after, "is below the tail"));
    }
    Ok(())
}

/// The zone below `commits - size`, rounded down to the grain; 0 when the history is no longer than `size`.
const fn boundary(commits: i64, size: i64, grain: i64) -> i64 {
    let below = commits - size;
    if below <= 0 { 0 } else { below / grain * grain }
}

/// The fold schedule of a history of `commits` commits.
pub fn fold_schedule(commits: i64, strides: Strides) -> Result<FoldSchedule> {
    check(commits, &strides)?;
    Ok(FoldSchedule {
        commits,
        coarse_end: boundary(commits, strides.coarse_after, strides.grain),
        tail_start: boundary(commits, strides.tail, strides.grain),
        strides,
    })
}

/// True when the fold lays commit `index`: the end of its window, or any commit of the tail. A resume (`from`, the
/// lock's index) lays its first commit again, then the commits after it on the same schedule.
#[must_use]
pub const fn is_laid(schedule: &FoldSchedule, index: i64, from: Option<i64>) -> bool {
    if let Some(from) = from
        && index <= from
    {
        return index == from;
    }
    if index >= schedule.tail_start {
        return true;
    }
    let stride = if index < schedule.coarse_end {
        schedule.strides.coarse_window
    } else {
        schedule.strides.window
    };
    (index + 1) % stride == 0
}

/// How many commits of the history the fold lays, from `from` (a resume) or the root.
#[must_use]
pub fn laid_count(schedule: &FoldSchedule, from: Option<i64>) -> i64 {
    let start = from.unwrap_or(0);
    let laid = (start..schedule.commits)
        .filter(|&index| is_laid(schedule, index, from))
        .count();
    i64::try_from(laid).unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The laid indices of a schedule (resumed at `from`), by brute force over the history.
    fn laid(schedule: &FoldSchedule, from: Option<i64>) -> Vec<i64> {
        (from.unwrap_or(0)..schedule.commits)
            .filter(|&i| is_laid(schedule, i, from))
            .collect()
    }

    fn schedule(commits: i64) -> FoldSchedule {
        fold_schedule(commits, FOLD_STRIDES).expect("a schedule")
    }

    /// The laid indices of one more commit, beside those of this many with the new commit added.
    fn grown(commits: i64) -> (Vec<i64>, Vec<i64>) {
        let mut extended = laid(&schedule(commits), None);
        extended.push(commits);
        (laid(&schedule(commits + 1), None), extended)
    }

    const SMALL: Strides = Strides {
        tail: 4,
        window: 2,
        coarse_after: 8,
        coarse_window: 4,
        grain: 4,
    };

    #[test]
    fn names_the_strides_as_the_defaults_ledger_does() {
        assert_eq!(
            FOLD_STRIDES,
            Strides {
                tail: 1000,
                window: 100,
                coarse_after: 10_000,
                coarse_window: 1000,
                grain: 1000
            }
        );
    }

    #[test]
    fn folds_every_commit_of_a_history_of_1999_commits_or_fewer() {
        for commits in [0, 1, 2, 999, 1000, 1001, 1999] {
            let s = schedule(commits);
            assert_eq!((s.coarse_end, s.tail_start), (0, 0));
            assert_eq!(laid_count(&s, None), commits);
        }
    }

    #[test]
    fn folds_the_commits_before_the_tail_in_windows_of_100_from_2000_commits() {
        let s = schedule(2000);
        assert_eq!((s.coarse_end, s.tail_start), (0, 1000));
        let indices = laid(&s, None);
        assert_eq!(indices[..10], [99, 199, 299, 399, 499, 599, 699, 799, 899, 999]);
        assert_eq!(indices[10..], (1000..2000).collect::<Vec<_>>());
    }

    #[test]
    fn folds_the_commits_older_than_the_last_10000_in_windows_of_1000() {
        let s = schedule(77_277);
        assert_eq!((s.coarse_end, s.tail_start), (67_000, 76_000));
        let indices = laid(&s, None);
        assert_eq!(indices[..3], [999, 1999, 2999]);
        assert_eq!(indices.iter().filter(|&&i| i < 67_000).count(), 67);
        assert_eq!(indices.iter().filter(|&&i| (67_000..76_000).contains(&i)).count(), 90);
        assert_eq!(indices.iter().filter(|&&i| i >= 76_000).count(), 1277);
        assert_eq!(laid_count(&s, None), 67 + 90 + 1277);
    }

    #[test]
    fn keeps_no_coarse_zone_up_to_10999_commits() {
        assert_eq!((schedule(10_000).coarse_end, schedule(10_000).tail_start), (0, 9000));
        assert_eq!((schedule(10_999).coarse_end, schedule(10_999).tail_start), (0, 9000));
        assert_eq!(
            (schedule(11_000).coarse_end, schedule(11_000).tail_start),
            (1000, 10_000)
        );
    }

    #[test]
    fn anchors_windows_to_the_root_each_inside_one_zone_and_always_lays_the_last_commit() {
        for commits in [1999, 2000, 2345, 10_999, 11_000, 23_456, 77_277] {
            let s = schedule(commits);
            assert_eq!(s.tail_start % 1000, 0);
            assert_eq!(s.coarse_end % 1000, 0);
            assert!(commits - s.tail_start >= commits.min(1000));
            assert!(commits - s.tail_start < 2000);
            let indices = laid(&s, None);
            assert_eq!(indices.last(), Some(&(commits - 1)));
            for &i in indices.iter().filter(|&&i| i < s.tail_start) {
                let stride = if i < s.coarse_end { 1000 } else { 100 };
                assert_eq!((i + 1) % stride, 0);
            }
        }
    }

    #[test]
    fn lays_the_same_windows_and_one_more_commit_for_one_more_commit_except_where_a_boundary_steps() {
        for commits in [2500, 3000, 12_345, 13_000] {
            let (after, extended) = grown(commits);
            assert_eq!(after, extended);
        }
        // One more commit makes the count a multiple of 1,000: the tail and coarse zones step.
        for commits in [1999, 2999, 12_999] {
            let (after, extended) = grown(commits);
            assert_ne!(after, extended);
        }
    }

    #[test]
    fn lays_the_first_index_of_a_resume_then_the_schedule_of_the_whole_history_after_it() {
        let s = schedule(23_456);
        assert_eq!(laid(&s, Some(0))[..2], [0, 999]);
        assert_eq!(laid(&s, Some(5000))[..3], [5000, 5999, 6999]);
        assert_eq!(laid(&s, Some(12_345))[..3], [12_345, 12_999, 13_099]);
        assert_eq!(laid(&s, Some(22_000))[..2], [22_000, 22_001]);
        assert_eq!(laid(&s, Some(23_455)), [23_455]);
        let froms = [None, Some(0), Some(1), Some(999), Some(5000), Some(12_345)];
        for from in froms
            .into_iter()
            .chain([Some(22_000), Some(23_455), Some(23_456), Some(30_000)])
        {
            assert_eq!(
                laid_count(&s, from),
                i64::try_from(laid(&s, from).len()).expect("a count")
            );
        }
    }

    #[test]
    fn lays_any_commit_beyond_the_count() {
        assert!(is_laid(&schedule(2000), 2400, None));
    }

    #[test]
    fn follows_the_strides_it_is_given() {
        let s = fold_schedule(20, SMALL).expect("a schedule");
        assert_eq!((s.coarse_end, s.tail_start), (12, 16));
        assert_eq!(laid(&s, None), [3, 7, 11, 13, 15, 16, 17, 18, 19]);
        let every = fold_schedule(77_277, EVERY_COMMIT).expect("a schedule");
        assert_eq!(laid_count(&every, None), 77_277);
    }

    #[test]
    fn rejects_a_count_or_strides_it_cannot_use_naming_the_field() {
        let field = |commits: i64, strides: Strides| {
            let error = fold_schedule(commits, strides).expect_err("a rejection");
            assert_eq!(error.code, ErrorCode::HistoryBadSchedule);
            error.detail[0].1.clone()
        };
        assert_eq!(field(-1, SMALL), "commits");
        assert_eq!(field(MAX_SAFE_INTEGER + 1, SMALL), "commits");
        assert_eq!(field(10, Strides { window: 0, ..SMALL }), "window");
        assert_eq!(field(10, Strides { tail: -2, ..SMALL }), "tail");
        assert_eq!(
            field(
                10,
                Strides {
                    coarse_window: MAX_SAFE_INTEGER + 1,
                    ..SMALL
                }
            ),
            "coarseWindow"
        );
        assert_eq!(field(10, Strides { grain: 6, ..SMALL }), "grain");
        assert_eq!(
            field(
                10,
                Strides {
                    window: 5,
                    grain: 8,
                    ..SMALL
                }
            ),
            "grain"
        );
        assert_eq!(
            field(
                10,
                Strides {
                    coarse_after: 2,
                    ..SMALL
                }
            ),
            "coarseAfter"
        );
    }
}
