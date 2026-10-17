//! A small XML scanner for machine-written coverage reports: elements and attributes in order, the declaration,
//! processing instructions, comments, a doctype and CDATA skipped. No entity beyond the five named ones and numeric
//! references is expanded, so nothing a report holds can grow.
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum XmlToken {
    Open {
        name: String,
        attributes: HashMap<String, String>,
        empty: bool,
    },
    Close {
        name: String,
    },
    Text {
        text: String,
    },
}

/// Text with its entity and character references decoded; an unknown or malformed one stays as written.
#[must_use]
pub fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after = &rest[amp + 1..];
        if let Some((decoded, length)) = reference(after) {
            out.push_str(&decoded);
            rest = &after[length..];
        } else {
            out.push('&');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// A reference after its `&`: its text and how many bytes it takes, `;` included; none when it is not one.
fn reference(after: &str) -> Option<(String, usize)> {
    let semicolon = after.find(';')?;
    let body = &after[..semicolon];
    let decoded = if let Some(hex) = body.strip_prefix("#x") {
        if hex.is_empty() || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        Some(
            u32::from_str_radix(hex, 16)
                .ok()
                .and_then(char::from_u32)
                .map(String::from),
        )
    } else if let Some(digits) = body.strip_prefix('#') {
        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        Some(digits.parse::<u32>().ok().and_then(char::from_u32).map(String::from))
    } else {
        if body.is_empty() || !body.bytes().all(|b| b.is_ascii_lowercase()) {
            return None;
        }
        Some(
            match body {
                "lt" => Some("<"),
                "gt" => Some(">"),
                "amp" => Some("&"),
                "quot" => Some("\""),
                "apos" => Some("'"),
                _ => None,
            }
            .map(str::to_owned),
        )
    }?;
    // A well-formed reference that names nothing stays as written.
    Some((decoded.unwrap_or_else(|| format!("&{body};")), semicolon + 1))
}

/// XML's own white space: space, tab, carriage return and line feed.
const fn is_space(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\n' | b'\r')
}

const fn is_name_byte(b: u8) -> bool {
    !is_space(b) && b != b'/' && b != b'>' && b != b'='
}

/// Text without XML white space at either end.
#[must_use]
pub fn trim_xml(text: &str) -> &str {
    text.trim_matches(|c: char| c.is_ascii() && is_space(c as u8))
}

/// The attributes of a tag's inside (after its name).
#[must_use]
pub fn attributes_of(inside: &str) -> HashMap<String, String> {
    let bytes = inside.as_bytes();
    let mut attributes = HashMap::new();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && !is_name_byte(bytes[i]) {
            i += 1;
        }
        let start = i;
        while i < bytes.len() && is_name_byte(bytes[i]) {
            i += 1;
        }
        let name = &inside[start..i];
        while i < bytes.len() && is_space(bytes[i]) {
            i += 1;
        }
        if bytes.get(i) != Some(&b'=') {
            continue;
        }
        i += 1;
        while i < bytes.len() && is_space(bytes[i]) {
            i += 1;
        }
        let quote = match bytes.get(i) {
            Some(q @ (b'"' | b'\'')) => *q,
            _ => continue,
        };
        let Some(end) = bytes[i + 1..].iter().position(|b| *b == quote).map(|p| p + i + 1) else {
            break;
        };
        attributes.insert(name.to_owned(), decode_entities(&inside[i + 1..end]));
        i = end + 1;
    }
    attributes
}

/// The markup that is skipped whole: its opening and the text that closes it.
const SKIPPED: [(&str, &str); 4] = [("<!--", "-->"), ("<![CDATA[", "]]>"), ("<?", "?>"), ("<!", ">")];

/// Where a tag starting at `lt` ends: its `>` outside quoted values.
fn tag_end(bytes: &[u8], lt: usize) -> Option<usize> {
    let mut quote = 0u8;
    for (i, b) in bytes.iter().enumerate().skip(lt + 1) {
        if quote != 0 {
            if *b == quote {
                quote = 0;
            }
        } else if *b == b'"' || *b == b'\'' {
            quote = *b;
        } else if *b == b'>' {
            return Some(i);
        }
    }
    None
}

/// The tags and text of a document, in order; unterminated markup ends the scan.
#[must_use]
pub fn scan_xml(text: &str) -> Vec<XmlToken> {
    let bytes = text.as_bytes();
    let mut tokens = Vec::new();
    let mut at = 0;
    while at < bytes.len() {
        let lt = text[at..].find('<').map(|i| i + at);
        let text_end = lt.unwrap_or(bytes.len());
        if text_end > at {
            tokens.push(XmlToken::Text {
                text: decode_entities(&text[at..text_end]),
            });
        }
        let Some(lt) = lt else { break };
        if let Some((open, close)) = SKIPPED.iter().find(|(open, _)| text[lt..].starts_with(open)) {
            let Some(end) = text[lt + open.len()..].find(close) else {
                break;
            };
            at = lt + open.len() + end + close.len();
            continue;
        }
        let Some(gt) = tag_end(bytes, lt) else { break };
        at = gt + 1;
        if bytes.get(lt + 1) == Some(&b'/') {
            tokens.push(XmlToken::Close {
                name: trim_xml(&text[lt + 2..gt]).to_owned(),
            });
            continue;
        }
        let empty = bytes[gt - 1] == b'/' && gt - 1 > lt;
        let inside = &text[lt + 1..if empty { gt - 1 } else { gt }];
        let name_end = inside.bytes().position(|b| !is_name_byte(b)).unwrap_or(inside.len());
        tokens.push(XmlToken::Open {
            name: inside[..name_end].to_owned(),
            attributes: attributes_of(&inside[name_end..]),
            empty,
        });
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open(name: &str, attributes: &[(&str, &str)], empty: bool) -> XmlToken {
        XmlToken::Open {
            name: name.to_owned(),
            attributes: attributes
                .iter()
                .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
                .collect(),
            empty,
        }
    }

    #[test]
    fn yields_tags_attributes_and_text_skipping_declarations_comments_doctypes_and_cdata() {
        let tokens = scan_xml(
            "<?xml version='1.0'?><!DOCTYPE x SYSTEM 'x.dtd'><!-- <a> --><x a=\"1 &gt; 0\" b='&amp;lt;' c=\"a>b\"><![CDATA[<y>]]>t&#65;&#x42;</x ><z/>",
        );
        assert_eq!(
            tokens,
            vec![
                open("x", &[("a", "1 > 0"), ("b", "&lt;"), ("c", "a>b")], false),
                XmlToken::Text { text: "tAB".into() },
                XmlToken::Close { name: "x".into() },
                open("z", &[], true),
            ]
        );
    }

    #[test]
    fn ends_at_unterminated_markup_and_skips_attributes_without_a_quoted_value() {
        assert_eq!(
            scan_xml("<a b c=d e='1'>x<!-- open"),
            vec![open("a", &[("e", "1")], false), XmlToken::Text { text: "x".into() }]
        );
        assert_eq!(scan_xml("<a b='open>"), vec![]);
        assert_eq!(scan_xml("<a"), vec![]);
        assert_eq!(
            scan_xml("<a/>tail"),
            vec![open("a", &[], true), XmlToken::Text { text: "tail".into() }]
        );
        assert_eq!(attributes_of(" b='open"), HashMap::new());
        assert_eq!(
            attributes_of(" b = \"1\""),
            HashMap::from([("b".to_owned(), "1".to_owned())])
        );
    }

    #[test]
    fn decodes_the_five_named_entities_and_numeric_ones_leaving_others_as_written() {
        assert_eq!(
            decode_entities("&lt;&gt;&amp;&quot;&apos;&#33;&#x1F600;&nbsp;&#xD800;&#99999999;&x;&;&#;&#xZ;a&b"),
            "<>&\"'!\u{1F600}&nbsp;&#xD800;&#99999999;&x;&;&#;&#xZ;a&b"
        );
    }
}
