// The shown city's buildings as the viewer draws them: each lot's measures together, the city's scales, the lot table
// the shader reads, each building's floors for picking, and what the colour can mean. The city's worker makes the
// buildings, the tables and the floors; the main thread keeps the measures and the scales, and aggregates a lot only
// when a card asks for it.
import {
  aggregate,
  buildingsOf,
  cityScales,
  floorsOf,
  unavailableReason,
  type Building,
  type Measure,
  type Measures,
  type Range,
  type Scales,
} from "@citymap/measures";
import {
  COLOUR_BY,
  DATA_COLUMNS,
  LOT_FLOATS,
  lookOf,
  lotTable,
  type ColourBy,
  type LotRef,
  type Span,
} from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { bytesText } from "../card/measures";

/** What the legend reads of a city's buildings: its measures and its scales. */
export interface CityScales {
  readonly measures: Measures | null;
  readonly scales: Scales;
}

/** Every building of a city, with its scales: what the city's worker keeps. */
export interface CityBuildings extends CityScales {
  /** Town key, then lot key. */
  readonly buildings: ReadonlyMap<string, ReadonlyMap<string, Building>>;
}

export const NO_SCALES: Scales = { size: null, churn: null, authors: null, recency: null };

/** A city's buildings and scales from its measures; a city without measures has none. */
export function cityBuildings(measures: Measures | null): CityBuildings {
  if (!measures) return { measures, buildings: new Map(), scales: NO_SCALES };
  const buildings = buildingsOf(measures);
  return {
    measures,
    buildings,
    scales: cityScales([...buildings.values()].flatMap((town) => Array.from(town.values()))),
  };
}

/** One lot's measures, by its town's key and its own, reading own keys only; undefined when the city has none. */
function lotMeasures(measures: Measures | null, townKey: string, key: string) {
  const town = measures && Object.hasOwn(measures.lots, townKey) ? measures.lots[townKey]! : null;
  return town && Object.hasOwn(town, key) ? town[key]! : undefined;
}

/** One lot's building, aggregated when asked: what a card shows, without building the city's every building. */
export function lotBuilding(measures: Measures | null, townKey: string, key: string): Building | undefined {
  const lot = lotMeasures(measures, townKey, key);
  return lot && measures ? aggregate(lot, measures) : undefined;
}

/** The paths of one lot's files, from its measures; undefined when the city has none for it. */
export const filesOn = (measures: Measures | null, townKey: string, key: string): readonly string[] | undefined =>
  lotMeasures(measures, townKey, key)?.files.map((f) => f.path);

/** How the building of a lot looks in a colour and theme. */
const looks = (city: CityBuildings, by: ColourBy, theme: Theme) => (ref: LotRef) =>
  lookOf(ref, city.buildings.get(ref.town)?.get(ref.key), city.scales, by, theme);

/** The lot table for a city's buildings (`lotRefs`), in a colour and a theme. */
export const tableFor = (
  refs: readonly LotRef[],
  city: CityBuildings,
  by: ColourBy,
  theme: Theme,
): Float32Array<ArrayBuffer> => lotTable(refs, looks(city, by, theme));

/** Each building's floors, in the order of its refs: the same in every colour and theme. */
export const cityFloors = (refs: readonly LotRef[], city: CityBuildings): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(refs, (ref) => floorsOf(city.buildings.get(ref.town)?.get(ref.key)?.size ?? null, city.scales.size));

/** A town's rows of the whole city's lot table, padded to whole rows: the town's own table, copied, not built. */
export function placeTable(table: Float32Array, { first, count }: Span): Float32Array<ArrayBuffer> {
  const rows = Math.max(1, Math.ceil(count / DATA_COLUMNS));
  const own = new Float32Array(rows * DATA_COLUMNS * LOT_FLOATS);
  own.set(table.subarray(first * LOT_FLOATS, (first + count) * LOT_FLOATS));
  return own;
}

/** Each colour-by choice the measures can give, else the reason it cannot. */
export function colourChoices(measures: Measures | null): readonly { by: ColourBy; reason: string | null }[] {
  return COLOUR_BY.map((by) => ({
    by,
    reason: by === "folder" || by === "kind" ? null : unavailableReason(by satisfies Measure, measures),
  }));
}

/** The choice to colour by: the one asked for when the city can give it, else folder. */
export const colourFor = (asked: ColourBy, measures: Measures | null): ColourBy =>
  colourChoices(measures).find((c) => c.by === asked)?.reason === null ? asked : "folder";

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

/** A range's two ends in words, or null without a range. */
const ends = (range: Range | null, say: (n: number) => string): readonly [string, string] | null =>
  range ? [say(range.low), say(range.high)] : null;

/** Each ramp's ends in words, from the city's scales. */
const RAMP_ENDS: Readonly<
  Record<Exclude<ColourBy, "folder" | "kind">, (city: CityScales) => readonly [string, string] | null>
> = {
  tested: () => ["0 %", "100 %"],
  size: (city) => ends(city.scales.size, (n) => (city.measures?.size === "lines" ? count(n, "line") : bytesText(n))),
  recency: (city) => ends(city.scales.recency, date),
  churn: (city) => ends(city.scales.churn, (n) => count(n, "commit")),
  authors: (city) => ends(city.scales.authors, (n) => count(n, "author")),
};

/** The words at a ramp's two ends, for the legend; null when the city has no values to scale. */
export const rampEnds = (
  by: Exclude<ColourBy, "folder" | "kind">,
  city: CityScales,
): readonly [string, string] | null => RAMP_ENDS[by](city);

/** What height means in the city's unit: one floor at or below the 5th percentile, twelve at or above the 99th. */
export function floorEnds(city: CityScales): readonly [string, string] | null {
  return rampEnds("size", city);
}
