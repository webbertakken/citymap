// Which files stand on which lot, read from the plat the lay left, and the measures section built from them.
import { compareKeys, type City, type FileEntry, type Plat } from "@citymap/ground-plan";
import {
  MEASURES_VERSION,
  availableFor,
  type FileMeasures,
  type LotMeasures,
  type Measures,
  type MeasuresSource,
} from "./section";

/** Each lot's live files, sorted, by town key and lot key; vacant lots have none. */
export type LotFiles = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

/** The members (identities) of every lot of a town, by lot key, as the plat records them. */
function membersOf(plat: Plat, townKey: string, old: boolean): ReadonlyMap<string, readonly string[]> {
  const members = new Map<string, readonly string[]>();
  if (old) {
    for (const list of Object.values(plat.old))
      for (const o of list)
        if (o.town.key === townKey) for (const [key, ids] of Object.entries(o.members)) members.set(key, ids);
    return members;
  }
  for (const records of Object.values(plat.towns[townKey]?.shares ?? {}))
    for (const lot of records) members.set(lot.key, lot.members);
  return members;
}

/** The lots' files: each lot's live members as paths, sorted, or its own path when the plat names none of them. */
export function lotFiles(city: City, plat: Plat, files: readonly FileEntry[]): LotFiles {
  const pathOf = new Map(files.map((f) => [f.identity, f.path]));
  const towns = new Map<string, Map<string, readonly string[]>>();
  for (const town of city.towns) {
    const members = membersOf(plat, town.key, town.old);
    const lots = new Map<string, readonly string[]>();
    for (const lot of town.lots) {
      if (lot.vacant) continue;
      const paths = (members.get(lot.key) ?? []).flatMap((id) => pathOf.get(id) ?? []);
      lots.set(lot.key, paths.length > 0 ? paths.toSorted(compareKeys) : [lot.path]);
    }
    towns.set(town.key, lots);
  }
  return towns;
}

export interface MeasuresInput {
  readonly source: MeasuresSource;
  readonly size: "lines" | "bytes";
  /** Whether the history was read: recency and churn are then available. */
  readonly history: boolean;
  /** Whether its people are known (the laid commit's `.mailmap` read): authors are then available, with the history. */
  readonly authors: boolean;
  /** Whether contents were read: comments are then available. */
  readonly comments: boolean;
  readonly tested: "coverage" | "name";
  readonly lots: LotFiles;
  /** A file's values, its path aside; unknown fields left out. */
  readonly factsOf: (path: string) => Omit<FileMeasures, "path">;
  /** The people across a lot's files, when the history was read; undefined when no commit read changed any. */
  readonly authorsAcross?: (paths: readonly string[]) => number | undefined;
  /** The submodule folders the city's files lie in, sorted. */
  readonly submodules?: readonly string[];
}

/** The measures section: every lot's files and their values, keyed by town and lot. */
export function buildMeasures(input: MeasuresInput): Measures {
  const lots: Record<string, Record<string, LotMeasures>> = {};
  for (const [townKey, townLots] of input.lots) {
    const entries: Record<string, LotMeasures> = {};
    for (const [lotKey, paths] of townLots) {
      const files = paths.map((path) => ({ path, ...input.factsOf(path) }));
      const authors = input.authorsAcross?.(paths);
      entries[lotKey] = authors === undefined ? { files } : { files, authors };
    }
    lots[townKey] = entries;
  }
  return {
    version: MEASURES_VERSION,
    source: input.source,
    size: input.size,
    tested: input.tested,
    available: availableFor(input.source, input),
    lots,
    ...(input.submodules && input.submodules.length > 0 ? { submodules: input.submodules } : {}),
  };
}
