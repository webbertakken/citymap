// The city file's measures: a section beside the layout, keyed by town and lot, holding each lot's files and their
// values. A missing value is unknown, never zero.
import { CitymapError, canonicalJson, validateCity, type City } from "@citymap/ground-plan";
import * as v from "valibot";

export const MEASURES = ["size", "tested", "kind", "recency", "churn", "authors", "comments"] as const;
export type Measure = (typeof MEASURES)[number];
export type MeasuresSource = "cli" | "github" | "folder";
export const MEASURES_VERSION = 1;

/** One file's values; a field left out is unknown. */
export interface FileMeasures {
  readonly path: string;
  readonly bytes?: number;
  /** Text files: newlines, plus one when the last line has none. */
  readonly lines?: number;
  /** Comment lines, when the language's comment syntax is known. */
  readonly comments?: number;
  /** `TODO`, `FIXME` and `XXX` marks inside comment lines. */
  readonly todos?: number;
  /** Executable lines a coverage report saw run, of `executable`. */
  readonly covered?: number;
  readonly executable?: number;
  /** A test file names it (source files of a known language, when the city is tested by name). */
  readonly named?: boolean;
  /** Epoch seconds of the last first-parent commit that changed it. */
  readonly changed?: number;
  /** First-parent commits that changed it, the one that added it included. */
  readonly commits?: number;
  /** Distinct authors of those commits. */
  readonly authors?: number;
}

export interface LotMeasures {
  /** The lot's live files, sorted by path. */
  readonly files: readonly FileMeasures[];
  /** Distinct authors across its files (from history only). */
  readonly authors?: number;
}

export interface Measures {
  readonly version: 1;
  readonly source: MeasuresSource;
  /** How size is counted. */
  readonly size: "lines" | "bytes";
  /** How tested is known: a coverage report, or test files' names. */
  readonly tested: "coverage" | "name";
  /** The measures the source gives, in `MEASURES` order. */
  readonly available: readonly Measure[];
  /** Town key, then lot key. */
  readonly lots: Readonly<Record<string, Readonly<Record<string, LotMeasures>>>>;
  /** The submodule folders the city's files lie in, sorted; absent when there are none. Their files carry no history. */
  readonly submodules?: readonly string[];
}

/** A city file: the layout, and beside it its measures, or null when it was written without them. */
export interface CityFile {
  readonly city: City;
  readonly measures: Measures | null;
}

const nat = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const fileSchema = v.strictObject({
  path: v.string(),
  bytes: v.exactOptional(nat),
  lines: v.exactOptional(nat),
  comments: v.exactOptional(nat),
  todos: v.exactOptional(nat),
  covered: v.exactOptional(nat),
  executable: v.exactOptional(nat),
  named: v.exactOptional(v.boolean()),
  changed: v.exactOptional(nat),
  commits: v.exactOptional(nat),
  authors: v.exactOptional(nat),
});
const lotSchema = v.strictObject({
  files: v.pipe(v.array(fileSchema), v.minLength(1)),
  authors: v.exactOptional(nat),
});
const measuresSchema = v.strictObject({
  version: v.literal(MEASURES_VERSION),
  source: v.picklist(["cli", "github", "folder"]),
  size: v.picklist(["lines", "bytes"]),
  tested: v.picklist(["coverage", "name"]),
  available: v.array(v.picklist(MEASURES)),
  lots: v.record(v.string(), v.record(v.string(), lotSchema)),
  submodules: v.exactOptional(v.array(v.string())),
});

/** The measures of a parsed city file's `measures` key, or a named rejection with the pointer of the first fault. */
export function validateMeasures(value: unknown): Measures {
  const version = typeof value === "object" && value !== null ? Reflect.get(value, "version") : undefined;
  if (typeof version === "number" && version > MEASURES_VERSION)
    throw new CitymapError("measures/too-new", `the measures are version ${version}; this reads ${MEASURES_VERSION}`, {
      version,
    });
  const result = v.safeParse(measuresSchema, value);
  if (result.success) return result.output;
  const [issue] = result.issues;
  const pointer = `/measures/${(issue.path ?? []).map((item) => String(item.key)).join("/")}`;
  throw new CitymapError("measures/bad-shape", `${pointer}: ${issue.message}`, { pointer });
}

/** A city file as canonical JSON: the city's own bytes, with the `measures` key beside it when there are measures. */
export const serialiseCityFile = ({ city, measures }: CityFile): string =>
  canonicalJson(measures ? { ...city, measures } : city);

/** Parses a city file: the layout as `parseCity` does, its measures beside it, or null without them. */
export function parseCityFile(text: string): CityFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new CitymapError("city/bad-json", "the text is not JSON", { reason: String(error) });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("measures" in value))
    return { city: validateCity(value), measures: null };
  const { measures, ...city } = value;
  return { city: validateCity(city), measures: validateMeasures(measures) };
}

/** What a source can give, in `MEASURES` order. */
export function availableFor(source: MeasuresSource, history: boolean, comments: boolean): Measure[] {
  return MEASURES.filter((measure) => {
    switch (measure) {
      case "recency":
      case "churn":
      case "authors":
        return source === "cli" && history;
      case "comments":
        return comments;
      default:
        return true;
    }
  });
}

/** Why a measure is not shown: null when it is available. */
export function unavailableReason(measure: Measure, measures: Measures | null): string | null {
  if (measure === "kind") return null;
  if (measures === null) return "This city file has no measures";
  if (measures.available.includes(measure)) return null;
  if (measure === "comments") return "Needs the files' contents";
  return measures.source === "cli" ? "Laid without history (--no-history)" : "Needs the CLI's history";
}
