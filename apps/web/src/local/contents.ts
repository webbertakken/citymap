// What a picked folder tells of its files, beyond their paths: sizes from the git index, lines, comments and marks from
// the contents when the tracked files are small enough to read, and coverage reports where tools write them. Nothing
// read here leaves the page.
import {
  MAX_REPORT_BYTES,
  countText,
  matchReports,
  parseReport,
  reportCandidates,
  type FoundReport,
  type TextFacts,
} from "@citymap/measures";
import { log, reasonOf } from "../log";
import type { LiveFacts } from "../measures/live";
import { LocalError } from "./errors";
import type { Folder } from "./folder";
import type { LocalPhase } from "./phases";
import type { LocalRead } from "./read";

/** Contents are read when the tracked files sum to less than this many bytes. */
export const CONTENTS_LIMIT = 50_000_000;
/** Files read at once. */
export const CONTENTS_IN_FLIGHT = 8;

/** A file's bytes, or null when it vanished from the working tree since git or the walk saw it. */
async function bytesOf(folder: Folder, path: string): Promise<Uint8Array | null> {
  try {
    return await folder.read(path);
  } catch (error) {
    if (error instanceof LocalError && error.code === "local/vanished") return null;
    throw error;
  }
}

/**
 * The files' facts, read `CONTENTS_IN_FLIGHT` at a time, in order, telling how many are done; reading stops once the
 * files read pass `CONTENTS_LIMIT` bytes (a folder without git, whose sizes are known only once read).
 */
async function readAll(
  folder: Folder,
  paths: readonly string[],
  onRead: (done: number) => void,
): Promise<{ files: Map<string, TextFacts>; unread: number; bytes: number }> {
  const files = new Map<string, TextFacts>();
  let unread = 0;
  let bytes = 0;
  const batch = async (from: number): Promise<void> => {
    if (from >= paths.length || bytes >= CONTENTS_LIMIT) return;
    const slice = paths.slice(from, from + CONTENTS_IN_FLIGHT);
    const read = await Promise.all(slice.map((path) => bytesOf(folder, path)));
    read.forEach((content, i) => {
      if (content) {
        files.set(slice[i]!, countText(content, slice[i]!));
        bytes += content.length;
      } else unread++;
    });
    onRead(Math.min(paths.length, from + CONTENTS_IN_FLIGHT));
    return batch(from + CONTENTS_IN_FLIGHT);
  };
  await batch(0);
  return { files, unread, bytes };
}

/** The coverage reports at the usual paths of the folder; one that cannot be read is skipped, and said so. */
async function reportsIn(folder: Folder, paths: readonly string[]): Promise<FoundReport[]> {
  const found: FoundReport[] = [];
  for (const candidate of reportCandidates(paths)) {
    // One look per candidate, in order: each waits for the one before, as the reports are few.
    // oxlint-disable-next-line no-await-in-loop
    if ((await folder.kind(candidate)) !== "file") continue;
    // oxlint-disable-next-line no-await-in-loop
    const bytes = await bytesOf(folder, candidate);
    if (!bytes) continue;
    if (bytes.length > MAX_REPORT_BYTES) {
      log.info("viewer/local-coverage-skipped", { path: candidate, reason: "too-large" });
      continue;
    }
    try {
      found.push({ report: parseReport(new TextDecoder().decode(bytes), candidate), at: candidate });
    } catch (failure) {
      log.info("viewer/local-coverage-skipped", { path: candidate, reason: reasonOf(failure) });
    }
  }
  return found;
}

/** What the folder tells of its files: contents under the limit, else the index's sizes; and its coverage. */
export async function localFacts(
  folder: Folder,
  read: LocalRead,
  onPhase: (phase: LocalPhase) => void,
): Promise<LiveFacts> {
  const paths = read.snapshot.files.map((f) => f.path);
  const total = [...read.sizes.values()].reduce((sum, n) => sum + n, 0);
  const small = read.source === "walk" || total < CONTENTS_LIMIT;
  onPhase({ phase: "contents", done: 0, of: small ? paths.length : 0 });
  const contents = small
    ? await readAll(folder, paths, (done) => onPhase({ phase: "contents", done, of: paths.length }))
    : { files: new Map([...read.sizes].map(([path, bytes]) => [path, { bytes }])), unread: 0, bytes: total };
  // A folder without git that passes the limit once read counts in bytes, as one with git would.
  const lines = small && contents.bytes < CONTENTS_LIMIT;
  log.info("viewer/local-contents", {
    files: paths.length,
    bytes: contents.bytes,
    read: lines ? "yes" : "no",
    unread: contents.unread,
  });
  onPhase({ phase: "coverage" });
  const found = await reportsIn(folder, paths);
  const matched = matchReports(found, new Set(paths));
  // Every report found here lies at a usual path of the folder.
  found.forEach((f, i) =>
    log.info("viewer/local-coverage", { path: f.at!, format: f.report.format, ...matched.reports[i]! }),
  );
  return {
    source: "folder",
    size: lines ? "lines" : "bytes",
    comments: lines,
    files: contents.files,
    coverage: matched.files,
  };
}
