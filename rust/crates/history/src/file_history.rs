//! What the history says of each file: when it last changed, how many commits changed it, and who changed it. Filled
//! while the history is read, by identity, so a renamed file keeps its record.
use std::collections::{HashMap, HashSet};

#[derive(Debug)]
struct Record {
    changed: i64,
    commits: i64,
    authors: HashSet<u32>,
}

/// One file's history: its last change (epoch seconds), its commits, and its distinct authors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileFacts {
    pub changed: i64,
    pub commits: i64,
    pub authors: i64,
}

#[derive(Debug, Default)]
pub struct FileHistory {
    people: HashMap<String, u32>,
    files: HashMap<String, Record>,
}

fn count(n: usize) -> i64 {
    i64::try_from(n).unwrap_or(i64::MAX)
}

impl FileHistory {
    /// One commit changed the file of this identity: at `time`, by `author` (an email, lower-cased in ASCII).
    pub fn record(&mut self, identity: &str, time: i64, author: &str) {
        let email = author.to_ascii_lowercase();
        let next = u32::try_from(self.people.len()).unwrap_or(u32::MAX);
        let person = *self.people.entry(email).or_insert(next);
        match self.files.get_mut(identity) {
            Some(file) => {
                file.changed = file.changed.max(time);
                file.commits += 1;
                file.authors.insert(person);
            }
            None => {
                self.files.insert(
                    identity.to_owned(),
                    Record {
                        changed: time,
                        commits: 1,
                        authors: HashSet::from([person]),
                    },
                );
            }
        }
    }

    /// A file's history, or none when no commit read changed it.
    #[must_use]
    pub fn of(&self, identity: &str) -> Option<FileFacts> {
        self.files.get(identity).map(|f| FileFacts {
            changed: f.changed,
            commits: f.commits,
            authors: count(f.authors.len()),
        })
    }

    /// The people who changed any of these files.
    #[must_use]
    pub fn authors_across<'a>(&self, identities: impl IntoIterator<Item = &'a str>) -> i64 {
        let mut people = HashSet::new();
        for identity in identities {
            if let Some(file) = self.files.get(identity) {
                people.extend(file.authors.iter().copied());
            }
        }
        count(people.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_the_last_change_the_commits_and_the_people_folding_email_case() {
        let mut history = FileHistory::default();
        history.record("a@0", 20, "Ann@X.org");
        history.record("a@0", 10, "ann@x.org");
        history.record("b@0", 5, "bob@x.org");
        assert_eq!(
            history.of("a@0"),
            Some(FileFacts {
                changed: 20,
                commits: 2,
                authors: 1
            })
        );
        assert_eq!(history.of("c@0"), None);
        assert_eq!(history.authors_across(["a@0", "b@0", "c@0"]), 2);
    }
}
