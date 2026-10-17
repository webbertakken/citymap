// A file's contents counted: bytes, and for text its lines, comment lines and marks. Bytes are scanned as bytes, so
// the count is the same in every implementation whatever the file's encoding (every marker is ASCII).
import { SYNTAX, languageOf } from "./language";

/** A zero byte among the first this many bytes makes a file binary, as git judges it. */
export const BINARY_PROBE = 8000;

export interface TextFacts {
  readonly bytes: number;
  readonly lines?: number;
  readonly comments?: number;
  readonly todos?: number;
}

const NEWLINE = 0x0a;
const encoder = new TextEncoder();
const MARKS = ["TODO", "FIXME", "XXX"].map((mark) => encoder.encode(mark));

const isSpace = (byte: number) => byte === 0x20 || byte === 0x09;
const isWord = (byte: number | undefined) =>
  byte !== undefined &&
  ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || byte === 0x5f);

/** The first index at or after `from` where `needle` starts in `line`, or -1. */
function find(line: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i + needle.length <= line.length; i++) {
    for (let k = 0; k < needle.length; k++) if (line[i + k] !== needle[k]) continue outer;
    return i;
  }
  return -1;
}

const startsWith = (line: Uint8Array, needle: Uint8Array) => find(line.subarray(0, needle.length), needle, 0) === 0;

/** The marks in a comment line: each mark not touching a letter, digit or underscore. */
function marksIn(line: Uint8Array): number {
  let count = 0;
  for (const mark of MARKS)
    for (let at = find(line, mark, 0); at >= 0; at = find(line, mark, at + mark.length))
      if (!isWord(line[at - 1]) && !isWord(line[at + mark.length])) count++;
  return count;
}

/** A line without its trailing carriage return and its leading and trailing spaces and tabs. */
function trimmed(bytes: Uint8Array, start: number, end: number): Uint8Array {
  let a = start;
  let b = end;
  if (b > a && bytes[b - 1] === 0x0d) b--;
  while (a < b && isSpace(bytes[a]!)) a++;
  while (b > a && isSpace(bytes[b - 1]!)) b--;
  return bytes.subarray(a, b);
}

/** Bytes, and for a text file its lines; with a known comment syntax, its comment lines and marks. */
export function countText(bytes: Uint8Array, path: string): TextFacts {
  if (bytes.subarray(0, BINARY_PROBE).includes(0)) return { bytes: bytes.length };
  let lines = 0;
  for (const byte of bytes) if (byte === NEWLINE) lines++;
  if (bytes.length > 0 && bytes.at(-1) !== NEWLINE) lines++;
  const language = languageOf(path);
  if (!language) return { bytes: bytes.length, lines };
  const syntax = SYNTAX[language.syntax];
  const markers = syntax.line.map((marker) => encoder.encode(marker));
  const [open, close] = syntax.block.map((marker) => encoder.encode(marker));
  let comments = 0;
  let todos = 0;
  let inBlock = false;
  for (let start = 0; start < bytes.length;) {
    const newline = bytes.indexOf(NEWLINE, start);
    const end = newline < 0 ? bytes.length : newline;
    const line = trimmed(bytes, start, end);
    start = end + 1;
    let comment = false;
    if (inBlock) {
      comment = true;
      inBlock = find(line, close!, 0) < 0;
    } else if (markers.some((marker) => startsWith(line, marker))) comment = true;
    else if (open && close) {
      const at = find(line, open, 0);
      if (at >= 0) {
        comment = at === 0;
        inBlock = find(line, close, at + open.length) < 0;
      }
    }
    if (comment) {
      comments++;
      todos += marksIn(line);
    }
  }
  return { bytes: bytes.length, lines, comments, todos };
}
