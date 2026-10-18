// A building's measures in plain words, as rows of a card: each with where it came from, unknown saying why.
import { unavailableReason, type Building, type Measure, type Measures } from "@citymap/measures";
import type { CardRow } from "./describe";

/** A lot of several files lists this many names, then how many more. */
export const FILES_SHOWN = 7;

const number = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string, many = `${one}s`) => `${number(n)} ${n === 1 ? one : many}`;

/** Bytes in the units people read: "830 bytes", "12.4 kB", "3.1 MB". */
export function bytesText(bytes: number): string {
  if (bytes < 1000) return plural(bytes, "byte");
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** How long ago a time was, in words: "3 days ago", "last month". */
export function agoText(seconds: number, now: number): string {
  const words = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const ago = seconds - now / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86_400],
    ["month", 30 * 86_400],
    ["week", 7 * 86_400],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const [unit, size] = steps.find(([, s]) => Math.abs(ago) >= s) ?? ["second", 1];
  return words.format(Math.round(ago / size), unit);
}

const dateText = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Not known", with the reason the measure is missing, or why this file's value is. */
const unknown = (label: string, note: string): CardRow => ({ label, value: "Not known", note });

/** Its size in the city's unit, the other unit as its note. */
function sizeRow(building: Building, measures: Measures): CardRow {
  if (measures.size === "lines" && building.lines !== null)
    return {
      label: "Size",
      value: plural(building.lines, "line"),
      ...(building.bytes === null ? {} : { note: bytesText(building.bytes) }),
    };
  if (building.bytes !== null) return { label: "Size", value: bytesText(building.bytes) };
  return unknown("Size", "Its contents were not read here");
}

function testedRow(building: Building, measures: Measures): CardRow {
  if (building.tested === null)
    return unknown(
      "Tested",
      measures.tested === "coverage" ? "The coverage report does not cover it" : "Only source files are judged by name",
    );
  if (measures.tested === "coverage")
    return { label: "Tested", value: `${Math.round(building.tested * 100)} %`, note: "Coverage report" };
  return { label: "Tested", value: building.tested === 1 ? "A test names it" : "No test names it", note: "By name" };
}

/** Whether every file lies in one of the submodule folders. */
const inSubmodules = (files: readonly string[], submodules: readonly string[]) =>
  submodules.length > 0 && files.every((file) => submodules.some((folder) => file.startsWith(`${folder}/`)));

/** The rows a lot's building adds to its card: each available measure, then the unavailable ones with their reason. */
export function measureRows(building: Building | undefined, measures: Measures | null, now: number): CardRow[] {
  if (!measures || !building) return [];
  const has = (m: Measure) => measures.available.includes(m);
  const rows: CardRow[] = [sizeRow(building, measures), testedRow(building, measures)];
  const unread = inSubmodules(building.files, measures.submodules ?? [])
    ? "A submodule's own history is not read"
    : "No commit read changed it";
  if (has("recency"))
    rows.push(
      building.changed === null
        ? unknown("Changed", unread)
        : { label: "Changed", value: agoText(building.changed, now), note: dateText(building.changed) },
      building.commits === null ? unknown("Commits", unread) : { label: "Commits", value: number(building.commits) },
      building.authors === null ? unknown("Authors", unread) : { label: "Authors", value: number(building.authors) },
    );
  if (has("comments"))
    rows.push(
      building.comments === null
        ? unknown("Comments", "Its language's comments are not known")
        : {
            label: "Comments",
            value: plural(building.comments, "line"),
            note: plural(building.todos ?? 0, "TODO"),
          },
    );
  const missing = (["recency", "comments"] as const).filter((m) => !has(m));
  for (const measure of missing)
    rows.push(
      unknown(measure === "recency" ? "Changed, commits, authors" : "Comments", unavailableReason(measure, measures)!),
    );
  if (building.files.length > 1) rows.push(filesRow(building.files));
  return rows;
}

/** A lot of several files: their names, at most `FILES_SHOWN`, then how many more. */
export function filesRow(files: readonly string[]): CardRow {
  const names = files.slice(0, FILES_SHOWN).map((f) => f.slice(f.lastIndexOf("/") + 1));
  const more = files.length - names.length;
  return {
    label: `${number(files.length)} files`,
    value: names.join(", "),
    ...(more > 0 ? { note: `and ${number(more)} more` } : {}),
  };
}
