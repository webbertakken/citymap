// Parity: both CLIs on the same repositories, their files compared byte for byte, their timings side by side.

/** The reference repositories every parity run covers. */
export const PARITY = ["takken.io", "redux", "studio-worker", "game-ci-cli", "livediagram", "react"] as const;
/** Added by `--long`: a fold of tens of thousands of commits. */
export const LONG = ["next.js"] as const;

/** A single state (`--no-history`), or the whole history folded with a lock. */
export type Mode = "state" | "fold";
export const MODES: readonly Mode[] = ["state", "fold"];

export interface Settings {
  readonly repos: readonly string[];
  readonly modes: readonly Mode[];
}

/** The files a run writes, compared between the CLIs; the log is compared without its timings. */
export const OUTPUTS: Readonly<Record<Mode, readonly string[]>> = {
  state: ["city.json", "city.svg", "log.txt"],
  fold: ["city.json", "city.svg", "citymap.lock.json", "log.txt"],
};

/** A comma-separated list, empty items dropped. */
const list = (text: string | undefined) => text?.split(",").filter((item) => item !== "");

const isMode = (value: string): value is Mode => MODES.some((mode) => mode === value);

/** `--long` adds next.js, `--repos=a,b` names the repositories, `--modes=state,fold` the modes. */
export function parseSettings(argv: readonly string[]): Settings {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const modes = list(value("modes")) ?? [...MODES];
  const bad = modes.find((mode) => !isMode(mode));
  if (bad !== undefined) throw new Error(`parity/usage: --modes takes state and fold, not ${bad}`);
  const repos = list(value("repos")) ?? [...PARITY, ...(argv.includes("--long") ? LONG : [])];
  return { repos, modes: modes.filter(isMode) };
}

/** The CLI arguments of one run: the clone, its outputs in `out`, and the mode's own flag. */
export const cliArgs = (clone: string, out: string, mode: Mode): string[] => [
  clone,
  `--out=${out}/city.json`,
  `--svg=${out}/city.svg`,
  mode === "fold" ? "--lock" : "--no-history",
];

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
