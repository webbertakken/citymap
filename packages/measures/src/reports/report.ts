// Coverage reports already on the machine, read into the same shape whatever wrote them: each file's executable lines
// and how often each ran. The format is told by the content, not the name.
import { CitymapError } from "@citymap/ground-plan";
import { scanXml, trimXml } from "./xml";

export type ReportFormat = "lcov" | "istanbul" | "cobertura" | "jacoco";

export interface ReportFile {
  /** The path as the report writes it. */
  readonly path: string;
  /** Line number to hits, for every executable line. */
  readonly lines: ReadonlyMap<number, number>;
}

export interface Report {
  readonly format: ReportFormat;
  /** Cobertura's `<source>` folders, in order; empty for the other formats. */
  readonly roots: readonly string[];
  readonly files: readonly ReportFile[];
}

/** A report's files, joined by path in first-seen order, each line keeping its largest count. */
class Files {
  private readonly byPath = new Map<string, Map<number, number>>();

  add(path: string, line: number, hits: number) {
    if (!Number.isSafeInteger(line) || line < 1) return;
    const lines = this.byPath.get(path) ?? new Map<number, number>();
    this.byPath.set(path, lines);
    lines.set(line, Math.max(lines.get(line) ?? 0, hits));
  }

  done(): ReportFile[] {
    return [...this.byPath].filter(([, lines]) => lines.size > 0).map(([path, lines]) => ({ path, lines }));
  }
}

/** A count as written: a non-negative integer, else 0 (negative, fractional, too large or not a number). */
function hitsOf(text: string | undefined): number {
  if (text === undefined || !/^\d+$/.test(text)) return 0;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : 0;
}

/** A JSON count: a non-negative safe integer, else 0. */
const countOf = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** A line number as written, or 0 when it is not a positive integer. */
const lineOf = (text: string | undefined) => hitsOf(text);

const unreadable = (name: string, reason: string) =>
  new CitymapError("coverage/unreadable", `${name} is not a coverage report this reads (${reason})`, { name, reason });

function lcov(text: string): Report {
  const files = new Files();
  let path: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("SF:")) path = line.slice(3);
    else if (line === "end_of_record") path = null;
    else if (path !== null && line.startsWith("DA:")) {
      const [number, hits] = line.slice(3).split(",");
      files.add(path, lineOf(number), hitsOf(hits));
    }
  }
  return { format: "lcov", roots: [], files: files.done() };
}

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined;
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function istanbul(text: string, name: string): Report {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unreadable(name, "not JSON");
  }
  if (!isObject(parsed)) throw unreadable(name, "not an object of files");
  const files = new Files();
  for (const [key, value] of Object.entries(parsed)) {
    const file = isObject(get(value, "data")) ? get(value, "data") : value;
    const path = get(file, "path");
    const statements = get(file, "statementMap");
    const counts = get(file, "s");
    if (!isObject(statements) || !isObject(counts)) continue;
    for (const [id, statement] of Object.entries(statements)) {
      const line = get(get(statement, "start"), "line");
      const count = get(counts, id);
      if (typeof line !== "number") continue;
      files.add(typeof path === "string" ? path : key, line, countOf(count));
    }
  }
  return { format: "istanbul", roots: [], files: files.done() };
}

function cobertura(text: string): Report {
  const files = new Files();
  const roots: string[] = [];
  const stack: string[] = [];
  let source: string[] | null = null;
  let file: string | null = null;
  for (const token of scanXml(text)) {
    if (token.kind === "text") {
      source?.push(token.text);
      continue;
    }
    if (token.kind === "close") {
      if (token.name === "source" && source) roots.push(trimXml(source.join("")));
      if (token.name === "source") source = null;
      if (token.name === "class") file = null;
      stack.pop();
      continue;
    }
    if (token.name === "source") source = [];
    if (token.name === "class") file = token.attributes.get("filename") ?? null;
    // Lines directly in a class's <lines>, not those its methods repeat.
    if (token.name === "line" && file !== null && stack.at(-1) === "lines" && stack.at(-2) === "class")
      files.add(file, lineOf(token.attributes.get("number")), hitsOf(token.attributes.get("hits")));
    if (!token.empty) stack.push(token.name);
    else if (token.name === "class") file = null;
  }
  return { format: "cobertura", roots, files: files.done() };
}

function jacoco(text: string): Report {
  const files = new Files();
  let pack = "";
  let file: string | null = null;
  for (const token of scanXml(text)) {
    if (token.kind === "text") continue;
    if (token.kind === "close") {
      if (token.name === "sourcefile") file = null;
      if (token.name === "package") pack = "";
      continue;
    }
    if (token.name === "package") pack = token.attributes.get("name") ?? "";
    if (token.name === "sourcefile") {
      const name = token.attributes.get("name") ?? "";
      file = token.empty ? null : pack === "" ? name : `${pack}/${name}`;
    }
    if (token.name === "line" && file !== null) {
      const missed = hitsOf(token.attributes.get("mi"));
      const covered = hitsOf(token.attributes.get("ci"));
      if (missed + covered > 0) files.add(file, lineOf(token.attributes.get("nr")), covered);
    }
  }
  return { format: "jacoco", roots: [], files: files.done() };
}

/** The name of a document's first element, after its declaration, comments and doctype; null when none comes. */
function rootElement(text: string): string | null {
  for (const token of scanXml(text)) {
    if (token.kind === "open") return token.name;
    if (token.kind === "close" || trimXml(token.text) !== "") return null;
  }
  return null;
}

/** A report read from its text, its format told by its content; `coverage/unreadable` when it is none of the four. */
export function parseReport(text: string, name: string): Report {
  const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const first = trimXml(body)[0];
  if (first === "{" || first === "[") return istanbul(body, name);
  if (first === "<") {
    const root = rootElement(body);
    if (root === "coverage") return cobertura(body);
    if (root === "report") return jacoco(body);
    throw unreadable(name, `an XML document of <${root ?? "nothing"}>`);
  }
  if (body.startsWith("SF:") || body.includes("\nSF:")) return lcov(body);
  throw unreadable(name, "no format found");
}
