//! The lockfile: the plat as folded up to a commit, which a later fold resumes from.
use serde::Serialize;

use crate::error::{CitymapError, ErrorCode, Result};
use crate::json::{canonical_json, parse_json};
use crate::plat::{Plat, plat_from_value};

/// A committed lockfile.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Lockfile {
    pub commit: String,
    pub index: i64,
    pub plat: Plat,
}

/// The lockfile as canonical JSON.
pub fn serialise_lock(lock: &Lockfile) -> Result<String> {
    canonical_json(lock)
}

fn bad(message: &str) -> CitymapError {
    CitymapError::new(ErrorCode::LockBadShape, message)
}

fn is_commit(text: &str) -> bool {
    (text.len() == 40 || text.len() == 64) && text.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Parses a lockfile; its plat is validated as any plat is.
pub fn parse_lock(text: &str) -> Result<Lockfile> {
    let value = parse_json(text, ErrorCode::LockBadJson)?;
    let serde_json::Value::Object(mut fields) = value else {
        return Err(bad("/: a lockfile is an object"));
    };
    if let Some(key) = fields
        .keys()
        .find(|k| !["commit", "index", "plat"].contains(&k.as_str()))
    {
        return Err(bad(&format!("/{key}: unknown field")));
    }
    let commit = match fields.get("commit") {
        Some(serde_json::Value::String(c)) if is_commit(c) => c.clone(),
        _ => return Err(bad("/commit: a lockfile names its commit")),
    };
    let index = fields
        .get("index")
        .and_then(serde_json::Value::as_i64)
        .filter(|&i| i >= 0);
    let Some(index) = index else {
        return Err(bad("/index: a lockfile holds its index"));
    };
    let Some(plat) = fields.remove("plat") else {
        return Err(bad("/plat: a lockfile holds its plat"));
    };
    Ok(Lockfile {
        commit,
        index,
        plat: plat_from_value(plat)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_lock() {
        let lock = Lockfile {
            commit: "a".repeat(40),
            index: 3,
            plat: Plat::empty("x"),
        };
        let text = serialise_lock(&lock).unwrap();
        assert_eq!(
            text,
            format!(
                "{{\"commit\":\"{}\",\"index\":3,\"plat\":{{\"old\":{{}},\"rootForms\":{{}},\"setting\":\"x\",\"towns\":{{}},\"version\":1}}}}\n",
                "a".repeat(40)
            )
        );
        assert_eq!(parse_lock(&text).unwrap(), lock);
    }

    #[test]
    fn rejects_bad_locks_by_name() {
        assert_eq!(parse_lock("{").unwrap_err().code, ErrorCode::LockBadJson);
        assert_eq!(
            parse_lock("{\"commit\":\"x\",\"index\":0,\"plat\":{}}")
                .unwrap_err()
                .code,
            ErrorCode::LockBadShape
        );
        let no_version = format!("{{\"commit\":\"{}\",\"index\":0,\"plat\":{{}}}}", "b".repeat(40));
        assert_eq!(parse_lock(&no_version).unwrap_err().code, ErrorCode::PlatBadVersion);
    }
}
