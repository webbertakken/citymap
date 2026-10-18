// The measures of a city laid in the browser: what GitHub's tree or a picked folder tells of each file, joined to the
// lots the lay left. Nothing here leaves the page.
import type { City, Plat, Snapshot } from "@citymap/ground-plan";
import {
  buildMeasures,
  lotFiles,
  namedBy,
  testNames,
  type Coverage,
  type FileMeasures,
  type Measures,
  type TextFacts,
} from "@citymap/measures";

/** What a live source knows of its files. */
export interface LiveFacts {
  readonly source: "github" | "folder";
  /** Lines when every file's contents were read, else bytes. */
  readonly size: "lines" | "bytes";
  /** Whether contents were read, so comments are known. */
  readonly comments: boolean;
  /** Each file's size, and its lines, comments and marks when read. */
  readonly files: ReadonlyMap<string, TextFacts>;
  /** Each file's coverage, from the reports found; empty without any. */
  readonly coverage: ReadonlyMap<string, Coverage>;
}

/** The city's measures from a live source: sizes and contents as known, coverage where reported, else tests by name. */
export function liveMeasures(city: City, plat: Plat, snapshot: Snapshot, facts: LiveFacts): Measures {
  const tested = facts.coverage.size > 0 ? "coverage" : "name";
  const names = tested === "name" ? testNames(snapshot.files.map((f) => f.path)) : null;
  const factsOf = (path: string): Omit<FileMeasures, "path"> => {
    const byName = names ? namedBy(names, path) : undefined;
    return {
      ...facts.files.get(path),
      ...facts.coverage.get(path),
      ...(byName === undefined ? {} : { named: byName }),
    };
  };
  return buildMeasures({
    source: facts.source,
    size: facts.size,
    history: false,
    comments: facts.comments,
    tested,
    lots: lotFiles(city, plat, snapshot.files),
    factsOf,
    ...(snapshot.submodules ? { submodules: snapshot.submodules } : {}),
  });
}
