// The shown city's buildings as the viewer draws them: each lot's measures together, the city's scales, the lot table
// the shader reads, how tall each building stands for picking, and what the colour can mean.
import {
  buildingsOf,
  cityScales,
  unavailableReason,
  type Building,
  type Measure,
  type Measures,
  type Range,
  type Scales,
} from "@citymap/measures";
import {
  COLOUR_BY,
  FLOOR_HEIGHT,
  LOTS_BASE,
  lookOf,
  lotTable,
  type ColourBy,
  type LotRef,
  type Scene,
} from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { bytesText } from "../card/measures";
import type { Heights } from "./hover";

export interface CityBuildings {
  readonly measures: Measures | null;
  /** Town key, then lot key. */
  readonly buildings: ReadonlyMap<string, ReadonlyMap<string, Building>>;
  readonly scales: Scales;
}

const NO_SCALES: Scales = { size: null, churn: null, authors: null, recency: null };

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

export const buildingOf = (city: CityBuildings, townKey: string, key: string): Building | undefined =>
  city.buildings.get(townKey)?.get(key);

/** The lot table for the scene's buildings, and how tall each stands, for the colour chosen. */
export function tableFor(
  scene: Scene,
  city: CityBuildings,
  by: ColourBy,
  theme: Theme,
): { readonly table: Float32Array; readonly heights: Heights } {
  const tops = new Map<string, number>();
  let top = 0;
  const table = lotTable(scene.buildings.order, (ref: LotRef) => {
    const look = lookOf(ref, buildingOf(city, ref.town, ref.key), city.scales, by, theme);
    const height = LOTS_BASE + look.floors * FLOOR_HEIGHT;
    tops.set(`${ref.town}\u0000${ref.key}`, height);
    top = Math.max(top, height);
    return look;
  });
  return { table, heights: { top, of: (townKey, key) => tops.get(`${townKey}\u0000${key}`) ?? null } };
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
  Record<Exclude<ColourBy, "folder" | "kind">, (city: CityBuildings) => readonly [string, string] | null>
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
  city: CityBuildings,
): readonly [string, string] | null => RAMP_ENDS[by](city);

/** What height means in the city's unit: one floor at or below the 5th percentile, twelve at or above the 99th. */
export function floorEnds(city: CityBuildings): readonly [string, string] | null {
  return rampEnds("size", city);
}
