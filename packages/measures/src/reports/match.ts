// Report paths matched to the repository's paths, three ways in order, and their lines joined across reports.
import { compareKeys, isManifestName } from "@citymap/ground-plan";
import type { Report } from "./report";

/** Where coverage tools write their reports by default, looked for at the root and in every package folder. */
export const USUAL_REPORTS = [
  "coverage/lcov.info",
  "lcov.info",
  "coverage/coverage-final.json",
  "coverage/cobertura-coverage.xml",
  "coverage.xml",
  "cobertura.xml",
  "target/site/jacoco/jacoco.xml",
  "build/reports/jacoco/test/jacocoTestReport.xml",
] as const;

/** A report larger than this is not read. */
export const MAX_REPORT_BYTES = 256 * 1024 * 1024;

/** A report as found: its text and where it lies in the repository (null when it lies outside). */
export interface FoundReport {
  readonly report: Report;
  readonly at: string | null;
}

/** One file's coverage, joined over every report. */
export interface Coverage {
  readonly covered: number;
  readonly executable: number;
}

/** What matching found: each repository path's coverage, and per report how many files matched and did not. */
export interface Matched {
  readonly files: ReadonlyMap<string, Coverage>;
  readonly reports: readonly { readonly files: number; readonly matched: number }[];
}

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** The report paths to look for in a repository: the usual ones at the root and in every folder holding a manifest. */
export function reportCandidates(paths: Iterable<string>): string[] {
  const folders = new Set([""]);
  for (const path of paths) if (isManifestName(path.slice(path.lastIndexOf("/") + 1))) folders.add(folderOf(path));
  return [...folders]
    .toSorted(compareKeys)
    .flatMap((folder) => USUAL_REPORTS.map((report) => (folder === "" ? report : `${folder}/${report}`)));
}

/** A path as segments: `\` as `/`, `file://` dropped, `.` dropped, `..` folding into its parent. */
function segmentsOf(path: string): { readonly segments: string[]; readonly absolute: boolean } {
  let text = path.replaceAll("\\", "/");
  if (text.startsWith("file://")) text = text.slice(7);
  const absolute = text.startsWith("/") || /^[A-Za-z]:\//.test(text);
  const segments: string[] = [];
  for (const segment of text.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return { segments, absolute };
}

/** Every folder from `folder` up to the root, deepest first. */
function basesOf(folder: string): string[] {
  const bases: string[] = [];
  for (let f = folder; f !== ""; f = folderOf(f)) bases.push(f);
  return [...bases, ""];
}

const join = (base: string, rest: string) => (base === "" ? rest : `${base}/${rest}`);

/** Matches report paths to the repository's paths: joined to the report's folders, by ending, or as an ending. */
class Matcher {
  private endings: Map<string, string[]> | null = null;

  constructor(private readonly paths: ReadonlySet<string>) {}

  /** Repository paths by every ending of theirs, at segment boundaries; built when first asked. */
  private byEnding(): Map<string, string[]> {
    if (this.endings) return this.endings;
    const endings = new Map<string, string[]>();
    for (const path of this.paths) {
      const segments = path.split("/");
      for (let i = 1; i < segments.length; i++) {
        const ending = segments.slice(i).join("/");
        const list = endings.get(ending) ?? [];
        list.push(path);
        endings.set(ending, list);
      }
    }
    this.endings = endings;
    return endings;
  }

  match(written: string, bases: readonly string[]): string | null {
    const { segments, absolute } = segmentsOf(written);
    if (segments.length === 0) return null;
    const whole = segments.join("/");
    if (!absolute)
      for (const base of bases) {
        const joined = join(base, whole);
        if (this.paths.has(joined)) return joined;
      }
    for (let i = 0; i < segments.length; i++) {
      const ending = segments.slice(i).join("/");
      if (this.paths.has(ending)) return ending;
    }
    const ending = this.byEnding().get(whole) ?? [];
    if (ending.length === 1) return ending[0]!;
    for (const base of bases) {
      if (base === "") break;
      const under = ending.filter((path) => path.startsWith(`${base}/`));
      if (under.length === 1) return under[0]!;
      if (under.length > 1) return null;
    }
    return null;
  }
}

/** The repository paths' coverage from the reports: lines joined across reports, unmatched paths counted. */
export function matchReports(found: readonly FoundReport[], paths: ReadonlySet<string>): Matched {
  const matcher = new Matcher(paths);
  const lines = new Map<string, Map<number, number>>();
  const reports = found.map(({ report, at }) => {
    const bases = at === null ? [""] : basesOf(folderOf(at));
    let matched = 0;
    for (const file of report.files) {
      // Cobertura's files are relative to its roots: each root joined first, then the path as written.
      const written = [...report.roots.map((root) => join(root, file.path)), file.path];
      const path = written.reduce<string | null>((hit, form) => hit ?? matcher.match(form, bases), null);
      if (path === null) continue;
      matched++;
      const joined = lines.get(path) ?? new Map<number, number>();
      lines.set(path, joined);
      for (const [line, hits] of file.lines) joined.set(line, Math.max(joined.get(line) ?? 0, hits));
    }
    return { files: report.files.length, matched };
  });
  const files = new Map<string, Coverage>();
  for (const [path, joined] of lines) {
    let covered = 0;
    for (const hits of joined.values()) if (hits > 0) covered++;
    files.set(path, { covered, executable: joined.size });
  }
  return { files, reports };
}
