// The city's measures as the CLI reads them: the laid commit's contents, its history, and coverage reports, joined to
// the lots the fold left. The layout is laid before and never read back, so it is the same with or without them.
import { relative, isAbsolute } from "node:path";
import { CitymapError, type City, type Plat, type Snapshot } from "@citymap/ground-plan";
import { listTree, readBlobs, type FileHistory } from "@citymap/history";
import {
  MAX_REPORT_BYTES,
  buildMeasures,
  countText,
  lotFiles,
  matchReports,
  namedBy,
  parseReport,
  reportCandidates,
  testNames,
  type FileMeasures,
  type FoundReport,
  type Measures,
  type TextFacts,
} from "@citymap/measures";
import type { Io } from "./run";

/** A report named on the command line, read and parsed before the fold, so a bad one fails at once. */
export interface NamedReport {
  readonly name: string;
  readonly found: FoundReport;
}

const tooLarge = (text: string) => Buffer.byteLength(text, "utf8") > MAX_REPORT_BYTES;

/** Where a file named on the command line lies in the repository, or null when outside it. */
function inside(repo: string, file: string): string | null {
  const path = relative(repo, file);
  return path === "" || path.startsWith("..") || isAbsolute(path) ? null : path.replaceAll("\\", "/");
}

/** Reads the reports `--coverage` names: a missing one is `coverage/missing`, an unreadable one `coverage/unreadable`. */
export function readNamedReports(repo: string, files: readonly string[], io: Io): NamedReport[] {
  return files.map((name) => {
    const text = io.readFile(name);
    if (text === null) throw new CitymapError("coverage/missing", `${name} does not exist`, { name });
    if (tooLarge(text))
      throw new CitymapError("coverage/unreadable", `${name} is larger than ${MAX_REPORT_BYTES} bytes`, { name });
    return { name, found: { report: parseReport(text, name), at: inside(repo, name) } };
  });
}

/** The reports at the usual paths of the working tree; one that cannot be read is skipped, and said so. */
function usualReports(repo: string, paths: readonly string[], io: Io): NamedReport[] {
  const found: NamedReport[] = [];
  for (const candidate of reportCandidates(paths)) {
    const text = io.readFile(`${repo}/${candidate}`);
    if (text === null) continue;
    if (tooLarge(text)) {
      io.log(`measures/report-skipped path=${candidate} reason=too-large`);
      continue;
    }
    try {
      found.push({ name: candidate, found: { report: parseReport(text, candidate), at: candidate } });
    } catch {
      // Whatever stops a report being read, it is skipped, and said so.
      io.log(`measures/report-skipped path=${candidate} reason=unreadable`);
    }
  }
  return found;
}

export interface MeasureInput {
  readonly repo: string;
  readonly target: string;
  readonly city: City;
  readonly plat: Plat;
  /** The last snapshot laid: the target's files, by identity. */
  readonly snapshot: Snapshot;
  /** The history read by the fold; null for a single state. */
  readonly history: FileHistory | null;
  /** Reports named by `--coverage`; empty to look at the usual paths. */
  readonly named: readonly NamedReport[];
  readonly io: Io;
}

/** The city's measures: contents, tests by name or coverage, history, per lot. */
export async function measureCity({
  repo,
  target,
  city,
  plat,
  snapshot,
  history,
  named,
  io,
}: MeasureInput): Promise<Measures> {
  const tree = await listTree(repo, target);
  const paths = tree.map((f) => f.path);
  const byBlob = new Map<string, string[]>();
  for (const { path, blob } of tree) {
    const same = byBlob.get(blob);
    if (same) same.push(path);
    else byBlob.set(blob, [path]);
  }
  const text = new Map<string, TextFacts>();
  await readBlobs(repo, [...byBlob.keys()], (blob, bytes) => {
    if (bytes) for (const path of byBlob.get(blob)!) text.set(path, countText(bytes, path));
  });

  const reports = named.length > 0 ? named : usualReports(repo, paths, io);
  const matched = matchReports(
    reports.map((r) => r.found),
    new Set(paths),
  );
  reports.forEach((r, i) => {
    const { files, matched: hits } = matched.reports[i]!;
    io.log(`measures/report path=${r.name} format=${r.found.report.format} files=${files} matched=${hits}`);
  });
  const tested = matched.files.size > 0 ? "coverage" : "name";
  const names = tested === "name" ? testNames(paths) : null;
  const identityOf = new Map(snapshot.files.map((f) => [f.path, f.identity]));
  const lots = lotFiles(city, plat, snapshot.files);

  // Every lot's file is one of the last snapshot's, so its identity is known.
  const factsOf = (path: string): Omit<FileMeasures, "path"> => {
    const byName = names ? namedBy(names, path) : undefined;
    return {
      ...text.get(path),
      ...matched.files.get(path),
      ...(byName === undefined ? {} : { named: byName }),
      ...history?.of(identityOf.get(path)!),
    };
  };
  const measures = buildMeasures({
    source: "cli",
    size: "lines",
    history: history !== null,
    comments: true,
    tested,
    lots,
    factsOf,
    ...(history
      ? { authorsAcross: (files: readonly string[]) => history.authorsAcross(files.map((p) => identityOf.get(p)!)) }
      : {}),
  });
  const files = [...lots.values()].reduce((sum, town) => sum + [...town.values()].reduce((n, f) => n + f.length, 0), 0);
  const lotCount = [...lots.values()].reduce((sum, town) => sum + town.size, 0);
  io.log(
    `measures/done source=cli size=lines tested=${tested} lots=${lotCount} files=${files} read=${text.size} unread=${tree.length - text.size}`,
  );
  return measures;
}
