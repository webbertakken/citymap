//! Canonical JSON: keys sorted by code point at every level, no whitespace, integers only, a trailing newline.
use std::collections::BTreeMap;

use indexmap::IndexMap;
use serde::de::DeserializeOwned;
use serde::{Serialize, Serializer};

use crate::error::{CitymapError, ErrorCode, Result};
use crate::fixed::compare_keys;

/// One text per value: the value's JSON with sorted keys and a trailing newline. Structs declare their fields in
/// byte order of their JSON names, and maps serialise sorted, so serde writes them in canonical order.
pub fn canonical_json<T: Serialize + ?Sized>(value: &T) -> Result<String> {
    let mut text = serde_json::to_string(value)
        .map_err(|e| CitymapError::new(ErrorCode::EngineInvariant, format!("/ cannot be serialised: {e}")))?;
    text.push('\n');
    Ok(text)
}

/// Serialises an insertion-ordered map with its keys sorted, as canonical JSON writes every object.
pub fn sorted<K, V, S>(map: &IndexMap<K, V>, serializer: S) -> std::result::Result<S::Ok, S::Error>
where
    K: AsRef<str> + Serialize + std::hash::Hash + Eq,
    V: Serialize,
    S: Serializer,
{
    let mut entries: Vec<(&K, &V)> = map.iter().collect();
    entries.sort_by(|a, b| compare_keys(a.0.as_ref(), b.0.as_ref()));
    serializer.collect_map(entries)
}

/// Parses JSON text, or rejects it with the given code.
pub fn parse_json(text: &str, code: ErrorCode) -> Result<serde_json::Value> {
    serde_json::from_str(text).map_err(|e| CitymapError::new(code, "the text is not JSON").with("reason", &e))
}

/// Reads a JSON value as a typed one, or rejects it with the given code and serde's account of the first fault.
pub fn validate<T: DeserializeOwned>(value: serde_json::Value, code: ErrorCode) -> Result<T> {
    serde_json::from_value(value).map_err(|e| CitymapError::new(code, e.to_string()))
}

/// Records whose order is never read serialise sorted as they are.
pub type Record<V> = BTreeMap<String, V>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_sorted_keys_and_a_trailing_newline() {
        #[derive(Serialize)]
        struct Wrap<'a>(#[serde(serialize_with = "sorted")] &'a IndexMap<String, i64>);
        let mut map: IndexMap<String, i64> = IndexMap::new();
        map.insert("b".into(), 1);
        map.insert("a".into(), 2);
        map.insert("\u{1f600}".into(), 3);
        map.insert("\u{ff5e}".into(), 4);
        assert_eq!(
            canonical_json(&Wrap(&map)).unwrap(),
            "{\"a\":2,\"b\":1,\"\u{ff5e}\":4,\"\u{1f600}\":3}\n"
        );
    }

    #[test]
    fn escapes_strings_as_json_stringify_does() {
        let text = canonical_json("q\"\\\u{8}\u{c}\n\r\t\u{1}\u{1f}\u{7f}/\u{2028}é").unwrap();
        assert_eq!(text, "\"q\\\"\\\\\\b\\f\\n\\r\\t\\u0001\\u001f\u{7f}/\u{2028}é\"\n");
    }

    #[test]
    fn rejects_text_that_is_not_json() {
        assert_eq!(
            parse_json("{", ErrorCode::PlatBadJson).unwrap_err().code,
            ErrorCode::PlatBadJson
        );
    }
}
