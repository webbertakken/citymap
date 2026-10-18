// A small XML scanner for machine-written coverage reports: elements and attributes in order, the declaration,
// processing instructions, comments, a doctype and CDATA skipped. No entity beyond the five named ones and numeric
// references is expanded, so nothing a report holds can grow.

export type XmlToken =
  | {
      readonly kind: "open";
      readonly name: string;
      readonly attributes: ReadonlyMap<string, string>;
      readonly empty: boolean;
    }
  | { readonly kind: "close"; readonly name: string }
  | { readonly kind: "text"; readonly text: string };

const NAMED: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Text with its entity and character references decoded; an unknown or malformed one stays as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED, body) ? NAMED[body]! : whole;
  });
}

/** XML's own white space: space, tab, carriage return and line feed. */
const isSpace = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\r";
const isNameChar = (c: string | undefined) => c !== undefined && !isSpace(c) && c !== "/" && c !== ">" && c !== "=";

/** Text without XML white space at either end. */
export function trimXml(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isSpace(text[start])) start++;
  while (end > start && isSpace(text[end - 1])) end--;
  return text.slice(start, end);
}

/** The attributes of a tag's inside (after its name). */
export function attributesOf(inside: string): Map<string, string> {
  const attributes = new Map<string, string>();
  let i = 0;
  while (i < inside.length) {
    while (i < inside.length && !isNameChar(inside[i])) i++;
    const start = i;
    while (isNameChar(inside[i])) i++;
    const name = inside.slice(start, i);
    while (i < inside.length && isSpace(inside[i])) i++;
    if (inside[i] !== "=") continue;
    i++;
    while (i < inside.length && isSpace(inside[i])) i++;
    const quote = inside[i];
    if (quote !== '"' && quote !== "'") continue;
    const end = inside.indexOf(quote, i + 1);
    if (end < 0) break;
    attributes.set(name, decodeEntities(inside.slice(i + 1, end)));
    i = end + 1;
  }
  return attributes;
}

/** The markup that is skipped whole: its opening and the text that closes it. */
const SKIPPED: readonly [string, string][] = [
  ["<!--", "-->"],
  ["<![CDATA[", "]]>"],
  ["<?", "?>"],
  ["<!", ">"],
];

/** Where a tag starting at `lt` ends: its `>` outside quoted values, or -1. */
function tagEnd(text: string, lt: number): number {
  let quote = "";
  for (let i = lt + 1; i < text.length; i++) {
    const c = text[i]!;
    if (quote !== "") {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

/** The tags and text of a document, in order; unterminated markup ends the scan. */
export function* scanXml(text: string): Generator<XmlToken> {
  let at = 0;
  while (at < text.length) {
    const lt = text.indexOf("<", at);
    const textEnd = lt < 0 ? text.length : lt;
    if (textEnd > at) yield { kind: "text", text: decodeEntities(text.slice(at, textEnd)) };
    if (lt < 0) return;
    const skipped = SKIPPED.find(([open]) => text.startsWith(open, lt));
    if (skipped) {
      const end = text.indexOf(skipped[1], lt + skipped[0].length);
      if (end < 0) return;
      at = end + skipped[1].length;
      continue;
    }
    const gt = tagEnd(text, lt);
    if (gt < 0) return;
    at = gt + 1;
    if (text[lt + 1] === "/") {
      yield { kind: "close", name: trimXml(text.slice(lt + 2, gt)) };
      continue;
    }
    const empty = text[gt - 1] === "/";
    const inside = text.slice(lt + 1, empty ? gt - 1 : gt);
    let nameEnd = 0;
    while (isNameChar(inside[nameEnd])) nameEnd++;
    yield { kind: "open", name: inside.slice(0, nameEnd), attributes: attributesOf(inside.slice(nameEnd)), empty };
  }
}
