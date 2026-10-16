// Parity: both CLIs on the same repositories, their files compared byte for byte, their timings side by side.
import { foldSchedule } from "@citymap/history";

/** The reference repositories every parity run covers. */
export const PARITY = ["takken.io", "redux", "studio-worker", "game-ci-cli", "livediagram", "react"] as const;
/** Added by `--long`: a fold of tens of thousands of commits. */
export const LONG = ["next.js"] as const;

/**
 * A single state (`--no-history`); the whole history folded with a lock; or the same fold resumed from a lock saved part
 * way, which must also match the uninterrupted fold of the same CLI.
 */
export type Mode = "state" | "fold" | "resume";
export const MODES: readonly Mode[] = ["state", "fold", "resume"];

export interface Settings {
  readonly repos: readonly string[];
  readonly modes: readonly Mode[];
  /** Cargo features the Rust CLI is built with (`--features=mimalloc`). */
  readonly features: readonly string[];
}

/** The files a run writes, compared between the CLIs; the log is compared without its timings. */
export const OUTPUTS: Readonly<Record<Mode, readonly string[]>> = {
  state: ["city.json", "city.svg", "log.txt"],
  fold: ["city.json", "city.svg", "citymap.lock.json", "log.txt"],
  resume: ["city.json", "city.svg", "citymap.lock.json", "log.txt"],
};

/** The outputs a resumed fold shares with the uninterrupted one; their logs differ by the resume itself. */
export const RESUMED: readonly string[] = ["city.json", "city.svg", "citymap.lock.json"];

/** A comma-separated list, empty items dropped. */
const list = (text: string | undefined) => text?.split(",").filter((item) => item !== "");

const isMode = (value: string): value is Mode => MODES.some((mode) => mode === value);

/** `--long` adds next.js, `--repos=a,b` names the repositories, `--modes=state,fold,resume` the modes, `--features=a` the Rust build. */
export function parseSettings(argv: readonly string[]): Settings {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const modes = list(value("modes")) ?? [...MODES];
  const bad = modes.find((mode) => !isMode(mode));
  if (bad !== undefined) throw new Error(`parity/usage: --modes takes state, fold and resume, not ${bad}`);
  const repos = list(value("repos")) ?? [...PARITY, ...(argv.includes("--long") ? LONG : [])];
  return { repos, modes: modes.filter(isMode), features: list(value("features")) ?? [] };
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

/** The CLI arguments of one run: the clone, its outputs in `out`, and the mode's own flag. */
export const cliArgs = (clone: string, out: string, mode: Mode): string[] => [
  clone,
  `--out=${out}/city.json`,
  `--svg=${out}/city.svg`,
  mode === "state" ? "--no-history" : "--lock",
];

/** The CLI arguments that save a lock part way: a fold to `commit`, writing nothing but the lock. */
export const saveArgs = (clone: string, commit: string): string[] => [clone, `--to=${commit}`, "--lock"];

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
