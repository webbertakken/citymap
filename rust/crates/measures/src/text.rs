//! A file's contents counted: bytes, and for text its lines, comment lines and marks. Bytes are scanned as bytes, so the
//! count is the same in every implementation whatever the file's encoding (every marker is ASCII).
use crate::language::language_of;

/// A zero byte among the first this many bytes makes a file binary, as git judges it.
pub const BINARY_PROBE: usize = 8000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TextFacts {
    pub bytes: i64,
    pub lines: Option<i64>,
    pub comments: Option<i64>,
    pub todos: Option<i64>,
}

const MARKS: [&[u8]; 3] = [b"TODO", b"FIXME", b"XXX"];

const fn is_word(byte: Option<&u8>) -> bool {
    matches!(byte, Some(b'0'..=b'9' | b'A'..=b'Z' | b'a'..=b'z' | b'_'))
}

/// The first index at or after `from` where `needle` starts in `line`.
fn find(line: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if from > line.len() {
        return None;
    }
    line[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|i| i + from)
}

/// The marks in a comment line: each mark not touching a letter, digit or underscore.
fn marks_in(line: &[u8]) -> i64 {
    let mut count = 0;
    for mark in MARKS {
        let mut at = find(line, mark, 0);
        while let Some(i) = at {
            if !is_word(i.checked_sub(1).and_then(|p| line.get(p))) && !is_word(line.get(i + mark.len())) {
                count += 1;
            }
            at = find(line, mark, i + mark.len());
        }
    }
    count
}

/// A line without its trailing carriage return and its leading and trailing spaces and tabs.
fn trimmed(line: &[u8]) -> &[u8] {
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    let start = line
        .iter()
        .position(|b| *b != b' ' && *b != b'\t')
        .unwrap_or(line.len());
    let end = line
        .iter()
        .rposition(|b| *b != b' ' && *b != b'\t')
        .map_or(start, |i| i + 1);
    &line[start..end]
}

fn count(n: usize) -> i64 {
    i64::try_from(n).unwrap_or(i64::MAX)
}

/// Bytes, and for a text file its lines; with a known comment syntax, its comment lines and marks.
#[must_use]
pub fn count_text(bytes: &[u8], path: &str) -> TextFacts {
    let size = count(bytes.len());
    if bytes[..bytes.len().min(BINARY_PROBE)].contains(&0) {
        return TextFacts {
            bytes: size,
            ..TextFacts::default()
        };
    }
    let mut lines = count(bytes.split(|b| *b == b'\n').count() - 1);
    if bytes.last().is_some_and(|b| *b != b'\n') {
        lines += 1;
    }
    let Some(language) = language_of(path) else {
        return TextFacts {
            bytes: size,
            lines: Some(lines),
            ..TextFacts::default()
        };
    };
    let markers = language.syntax.markers();
    let (mut comments, mut todos, mut in_block) = (0, 0, false);
    let mut start = 0;
    while start < bytes.len() {
        let end = bytes[start..]
            .iter()
            .position(|b| *b == b'\n')
            .map_or(bytes.len(), |i| start + i);
        let line = trimmed(&bytes[start..end]);
        start = end + 1;
        let mut comment = false;
        if in_block {
            comment = true;
            let (_, close) = markers.block.expect("only a block opens one");
            in_block = find(line, close.as_bytes(), 0).is_none();
        } else if markers.line.iter().any(|m| line.starts_with(m.as_bytes())) {
            comment = true;
        } else if let Some((open, close)) = markers.block
            && let Some(at) = find(line, open.as_bytes(), 0)
        {
            comment = at == 0;
            in_block = find(line, close.as_bytes(), at + open.len()).is_none();
        }
        if comment {
            comments += 1;
            todos += marks_in(line);
        }
    }
    TextFacts {
        bytes: size,
        lines: Some(lines),
        comments: Some(comments),
        todos: Some(todos),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(text: &str, path: &str) -> TextFacts {
        count_text(text.as_bytes(), path)
    }

    #[test]
    fn counts_lines_the_last_one_with_or_without_its_newline() {
        assert_eq!(facts("", "a.txt").lines, Some(0));
        assert_eq!(facts("a\nb", "a.txt").lines, Some(2));
        assert_eq!(facts("a\nb\n", "a.txt").lines, Some(2));
        assert_eq!(facts("a\nb\n", "a.txt").comments, None);
    }

    #[test]
    fn gives_a_binary_file_only_its_bytes() {
        assert_eq!(
            count_text(&[1, 0, 10], "a.ts"),
            TextFacts {
                bytes: 3,
                ..TextFacts::default()
            }
        );
        let mut late = vec![b'a'; BINARY_PROBE + 1];
        late[BINARY_PROBE] = 0;
        assert_eq!(count_text(&late, "a.txt").lines, Some(1));
    }

    #[test]
    fn counts_line_comments_blocks_and_their_marks_in_c_like_code() {
        let code = [
            "// TODO: one",
            "const a = 1; // FIXME not a comment line",
            "  /* a block",
            "   XXX and TODO_LIST and MYTODO */",
            "// 1TODO aTODO zTODO TODO9 :TODO: [TODO] {TODO} @TODO`",
            "/* one line */ code();",
            "x = 2; /* opens",
            "closes */",
            "\t//\tFIXME-ish\r",
            "return;  ",
        ]
        .join("\n");
        assert_eq!(
            facts(&code, "a.ts"),
            TextFacts {
                bytes: count(code.len()),
                lines: Some(10),
                comments: Some(7),
                todos: Some(7)
            }
        );
    }

    #[test]
    fn reads_each_syntax_and_none_where_a_language_has_none() {
        assert_eq!(facts("# a\nb # c\n", "a.py").comments, Some(1));
        assert_eq!(facts("# a\n// b\n/* c */\n", "a.php").comments, Some(3));
        assert_eq!(facts("-- a\n", "a.sql").comments, Some(1));
        assert_eq!(facts("<!-- a\nb -->\nc\n", "a.html").comments, Some(2));
        assert_eq!(facts("; a\n", "a.ini").comments, Some(1));
        assert_eq!(facts("% a\n", "a.tex").comments, Some(1));
        assert_eq!(facts("/* a */\n// b\n", "a.css").comments, Some(1));
        assert_eq!(facts("{\"a\": \"// b\"}\n", "a.json").comments, Some(0));
        assert_eq!(facts("/*\na\n\nb", "a.c").comments, Some(4));
    }
}
