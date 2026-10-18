// Finding a folder or a file of the city shown, by name or path.
import type { City, Pt } from "@citymap/ground-plan";

/** A query shorter than this matches most of a city, so it waits. */
export const MIN_QUERY = 2;
/** At most this many hits are shown; the rest are counted. */
export const MAX_HITS = 7;

const UNIT = 64;

/** A folder (a district) or a file (a lot's path), where it lies and how much land it covers, in scene units. */
export interface SearchEntry {
  readonly kind: "folder" | "file";
  readonly path: string;
  readonly name: string;
  readonly town: string;
  readonly townKey: string;
  readonly x: number;
  readonly z: number;
  /** The larger side of its bounding box. */
  readonly extent: number;
  /** Lower-cased once, for matching. */
  readonly lowerName: string;
  readonly lowerPath: string;
}

export interface SearchIndex {
  readonly entries: readonly SearchEntry[];
}

const entryOf = (kind: SearchEntry["kind"], path: string, pts: readonly Pt[], town: string, townKey: string) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const name = path.slice(path.lastIndexOf("/") + 1);
  return {
    kind,
    path,
    name,
    town,
    townKey,
    x: xs.reduce((s, v) => s + v, 0) / xs.length / UNIT,
    z: 0 - ys.reduce((s, v) => s + v, 0) / ys.length / UNIT,
    extent: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / UNIT,
    lowerName: name.toLowerCase(),
    lowerPath: path.toLowerCase(),
  };
};

/** Every folder a person named (wards left out) and every file of a lot (vacant lots hold none), town by town. */
export function* entriesOf(city: City): Generator<SearchEntry> {
  for (const town of city.towns) {
    for (const d of town.districts) if (!d.ward) yield entryOf("folder", d.path, d.pts, town.name, town.key);
    for (const lot of town.lots) if (!lot.vacant) yield entryOf("file", lot.path, lot.pts, town.name, town.key);
  }
}

/** The search index of a city, built at once. */
export const searchIndex = (city: City): SearchIndex => ({ entries: [...entriesOf(city)] });

/** True when the city has a folder of that path (any letter case): a text starting with it is a path in the city. */
export function holdsFolder(index: SearchIndex, folder: string): boolean {
  const path = folder.toLowerCase();
  return index.entries.some((e) => e.lowerPath === path || e.lowerPath.startsWith(`${path}/`));
}

/** How well an entry matches: 0 its name is the query, 1 its name starts with it, 2 its name holds it, 3 its path does. */
const rankOf = (entry: SearchEntry, query: string) => {
  if (entry.lowerName === query) return 0;
  if (entry.lowerName.startsWith(query)) return 1;
  if (entry.lowerName.includes(query)) return 2;
  return entry.lowerPath.includes(query) ? 3 : -1;
};

/** The best hits for a query, case-insensitive: by rank, folders before files, shorter paths, then path order. */
export function search(index: SearchIndex, query: string): { hits: SearchEntry[]; total: number } {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return { hits: [], total: 0 };
  const found: { entry: SearchEntry; rank: number }[] = [];
  for (const entry of index.entries) {
    const rank = rankOf(entry, q);
    if (rank >= 0) found.push({ entry, rank });
  }
  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === "folder" ? -1 : 1) ||
      a.entry.path.length - b.entry.path.length ||
      (a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0),
  );
  return { hits: found.slice(0, MAX_HITS).map((f) => f.entry), total: found.length };
}
