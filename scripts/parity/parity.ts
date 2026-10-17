// Parity: both CLIs on the same repositories, their files compared byte for byte, their timings side by side.
import { foldSchedule } from "@citymap/history";

/** The reference repositories every parity run covers. */
export const PARITY = ["takken.io", "redux", "studio-worker", "game-ci-cli", "livediagram", "react"] as const;
/** Added by `--long`: a fold of tens of thousands of commits. */
export const LONG = ["next.js"] as const;

/**
 * A single state (`--no-history`); the whole history folded with a lock; the same fold resumed from a lock saved part
 * way, which must also match the uninterrupted fold of the same CLI; or a single state with coverage reports in all
 * four formats written at their usual paths in the clone.
 */
export type Mode = "state" | "fold" | "resume" | "coverage";
export const MODES: readonly Mode[] = ["state", "fold", "resume", "coverage"];

export interface Settings {
  readonly repos: readonly string[];
  readonly modes: readonly Mode[];
  /** Cargo features the Rust CLI is built with (`--features=mimalloc`). */
  readonly features: readonly string[];
  /** The toggles both CLIs lay with (`--toggles=corridor`, `--toggles=` for none); null for the defaults. */
  readonly toggles: string | null;
}

/** The files a run writes, compared between the CLIs; the log is compared without its timings. */
export const OUTPUTS: Readonly<Record<Mode, readonly string[]>> = {
  state: ["city.json", "city.svg", "log.txt"],
  fold: ["city.json", "city.svg", "citymap.lock.json", "log.txt"],
  resume: ["city.json", "city.svg", "citymap.lock.json", "log.txt"],
  coverage: ["city.json", "city.svg", "log.txt"],
};

/** The outputs a resumed fold shares with the uninterrupted one; their logs differ by the resume itself. */
export const RESUMED: readonly string[] = ["city.json", "city.svg", "citymap.lock.json"];

/** A comma-separated list, empty items dropped. */
const list = (text: string | undefined) => text?.split(",").filter((item) => item !== "");

const isMode = (value: string): value is Mode => MODES.some((mode) => mode === value);

/**
 * `--long` adds next.js, `--repos=a,b` names the repositories, `--modes=state,fold,resume` the modes, `--features=a`
 * the Rust build, `--toggles=a,b` the toggles both CLIs lay with.
 */
export function parseSettings(argv: readonly string[]): Settings {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const modes = list(value("modes")) ?? [...MODES];
  const bad = modes.find((mode) => !isMode(mode));
  if (bad !== undefined) throw new Error(`parity/usage: --modes takes state, fold, resume and coverage, not ${bad}`);
  const repos = list(value("repos")) ?? [...PARITY, ...(argv.includes("--long") ? LONG : [])];
  return {
    repos,
    modes: modes.filter(isMode),
    features: list(value("features")) ?? [],
    toggles: value("toggles") ?? null,
  };
}

/** The cargo command that builds the Rust CLI, with the features asked for. */
export const buildArgs = (features: readonly string[]): string[] => [
  "cargo",
  "build",
  "--release",
  "--quiet",
  "-p",
  "citymap-cli",
  ...(features.length > 0 ? ["--features", features.join(",")] : []),
];

/** The toggles flag of a run, when the settings name toggles. */
const togglesFlag = (toggles: string | null) => (toggles === null ? [] : [`--toggles=${toggles}`]);

/** The CLI arguments of one run: the clone, its outputs in `out`, the mode's own flag and the toggles. */
export const cliArgs = (clone: string, out: string, mode: Mode, toggles: string | null = null): string[] => [
  clone,
  `--out=${out}/city.json`,
  `--svg=${out}/city.svg`,
  mode === "state" || mode === "coverage" ? "--no-history" : "--lock",
  ...togglesFlag(toggles),
];

/** The CLI arguments that save a lock part way: a fold to `commit`, writing nothing but the lock. */
export const saveArgs = (clone: string, commit: string, toggles: string | null = null): string[] => [
  clone,
  `--to=${commit}`,
  "--lock",
  ...togglesFlag(toggles),
];

/**
 * The index to save a lock at, for a history of `commits`: halfway through the commits whose fold lays the same
 * windows as the whole history's, so the lock is one the uninterrupted fold could have saved along the way.
 */
export function resumePoint(commits: number): number {
  const whole = foldSchedule(commits);
  const same = (count: number) => {
    const part = foldSchedule(count);
    return part.coarseEnd === whole.coarseEnd && part.tailStart === whole.tailStart;
  };
  let first = commits;
  while (first > 1 && same(first - 1)) first--;
  return Math.floor((first - 1 + commits - 1) / 2);
}

/** One log line for a resumed fold against the uninterrupted one: the same, or the sides and files that differ. */
export const resumeVerdict = (repo: string, saved: number, differs: readonly string[]): string =>
  differs.length === 0
    ? `parity/resumed repo=${repo} saved=${saved} same`
    : `parity/resume-differs repo=${repo} saved=${saved} files=${differs.join(",")}`;

/** A CLI's log without its timings: the summary's `ms=` is the only field that may differ. */
export const withoutTimings = (log: string) => log.replace(/ ms=\d+$/gm, " ms=…");

export interface Result {
  readonly repo: string;
  readonly mode: Mode;
  readonly tsMs: number;
  readonly rsMs: number;
  /** The outputs that differ; empty when every byte is the same. */
  readonly differs: readonly string[];
}

/** One log line per run, in the fingerprint style of the other scripts. */
export function verdict(result: Result): string {
  const timings = `ts-ms=${Math.round(result.tsMs)} rs-ms=${Math.round(result.rsMs)}`;
  const where = `repo=${result.repo} mode=${result.mode}`;
  return result.differs.length === 0
    ? `parity/same ${where} ${timings}`
    : `parity/differs ${where} files=${result.differs.join(",")} ${timings}`;
}

const seconds = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(2)} s` : `${(ms / 1000).toFixed(0)} s`);

/** The results as a Markdown table: identical or not, and both timings with the speed-up. */
export function table(results: readonly Result[]): string {
  const rows = results.map((r) => {
    const same = r.differs.length === 0 ? "identical" : `differs: ${r.differs.join(", ")}`;
    const speedup = r.rsMs > 0 ? `${(r.tsMs / r.rsMs).toFixed(1)}×` : "–";
    return `| ${r.repo} | ${r.mode} | ${same} | ${seconds(r.tsMs)} | ${seconds(r.rsMs)} | ${speedup} |`;
  });
  return [
    "| Repository | Mode | Output | TypeScript | Rust | Speed-up |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** The language sources the coverage mode reports on: up to this many, spread evenly through the tree. */
export const COVERED_SOURCES = 400;

/** A file's synthetic lines and hits: 1 to 12 lines, every third one missed, from the file's place in the list. */
const linesOf = (i: number) => Array.from({ length: 1 + (i % 12) }, (_, k) => [k + 1, (i + k) % 3 === 0 ? 0 : 1 + k]);

const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/**
 * Coverage reports in the four formats, by their usual paths, over a repository's paths: each format names a quarter
 * of the sources its own way (LCOV and Istanbul by absolute paths from a CI machine, Cobertura relative to a source
 * root, JaCoCo by the path after its first folder), with one path no repository holds.
 */
export function coverageReports(paths: readonly string[], repo: string): Record<string, string> {
  const sources = paths.filter((p) => /\.(ts|tsx|js|jsx|py|go|java|rs|c|cc|cpp|h|rb)$/.test(p) && p.includes("/"));
  const step = Math.max(1, Math.floor(sources.length / COVERED_SOURCES));
  const picked = sources.filter((_, i) => i % step === 0).slice(0, COVERED_SOURCES);
  const ci = `/home/runner/work/${repo}/${repo}`;
  const quarter = (k: number) => picked.filter((_, i) => i % 4 === k);
  const lcov = [...quarter(0), "nowhere/at/all.ts"]
    .map((p, i) => [`SF:${ci}/${p}`, ...linesOf(i).map(([l, h]) => `DA:${l},${h}`), "end_of_record"].join("\n"))
    .join("\n");
  const istanbul = Object.fromEntries(
    quarter(1).map((p, i) => {
      const lines = linesOf(i);
      return [
        `${ci}/${p}`,
        {
          path: `${ci}/${p}`,
          statementMap: Object.fromEntries(lines.map(([l], k) => [k, { start: { line: l, column: 0 } }])),
          s: Object.fromEntries(lines.map(([, h], k) => [k, h])),
        },
      ];
    }),
  );
  const classes = quarter(2)
    .map((p, i) => {
      const lines = linesOf(i)
        .map(([l, h]) => `<line number="${l}" hits="${h}"/>`)
        .join("");
      return `<class name="c${i}" filename="${xml(p)}"><methods/><lines>${lines}</lines></class>`;
    })
    .join("\n");
  const cobertura = `<?xml version="1.0" ?>\n<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">\n<coverage><sources><source>${ci}</source></sources><packages><package name="p"><classes>\n${classes}\n</classes></package></packages></coverage>\n`;
  const files = quarter(3)
    .map((p, i) => {
      const rest = p.slice(p.indexOf("/") + 1);
      const folder = rest.includes("/") ? rest.slice(0, rest.lastIndexOf("/")) : "";
      const name = rest.slice(rest.lastIndexOf("/") + 1);
      const lines = linesOf(i)
        .map(([l, h]) => `<line nr="${l}" mi="${h === 0 ? 2 : 0}" ci="${h}"/>`)
        .join("");
      return `<package name="${xml(folder)}"><sourcefile name="${xml(name)}">${lines}</sourcefile></package>`;
    })
    .join("\n");
  const jacoco = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<report name="x">\n${files}\n</report>\n`;
  return {
    "coverage/lcov.info": `${lcov}\n`,
    "coverage/coverage-final.json": JSON.stringify(istanbul),
    "coverage.xml": cobertura,
    "target/site/jacoco/jacoco.xml": jacoco,
  };
}
