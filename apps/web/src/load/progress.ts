// The loading card's model, pure: which phase a load is in, one bar across its phases that never moves backwards, and
// the words for its phase, its count, the time spent and the time left.
import type { Phase, Step } from "./step";

/** What is being opened: a bundled city, a city file, a GitHub repository, a repository on this machine, or the city
 * at ground level to explore. */
export type Source = "bundled" | "file" | "github" | "local" | "explore";

/** Each source's phases, in the order they come. */
export const PHASES: Readonly<Record<Source, readonly Phase[]>> = {
  github: ["commit", "tree", "manifests", "lay", "draw"],
  bundled: ["download", "parse", "draw"],
  file: ["download", "parse", "draw"],
  // A folder with git reads its index; one without is walked instead.
  local: ["index", "folder", "manifests", "contents", "coverage", "lay", "draw"],
  // Going down into the city: the physics engine arrives, then every building becomes a wall.
  explore: ["engine", "walls"],
};

/** Each phase's share of the bar, per source: their shares of the time linux takes (see DEFAULTS.md). */
export const PHASE_WEIGHTS: Readonly<Record<Source, Partial<Record<Phase, number>>>> = {
  github: { commit: 0.03, tree: 0.67, manifests: 0.02, lay: 0.18, draw: 0.1 },
  bundled: { download: 0.6, parse: 0.15, draw: 0.25 },
  file: { download: 0.1, parse: 0.3, draw: 0.6 },
  local: { index: 0.1, folder: 0.15, manifests: 0.05, contents: 0.15, coverage: 0.05, lay: 0.4, draw: 0.1 },
  explore: { engine: 0.4, walls: 0.6 },
};

/** The share of the bar, and the time spent, before the time left is estimated. */
export const ESTIMATE_FROM = 0.1;
export const STEADY_MS = 2000;

export interface Progress {
  readonly source: Source;
  readonly name: string;
  /** When the load began, in `performance.now()` milliseconds. */
  readonly started: number;
  readonly phase: Phase;
  /** The latest step of the current phase. */
  readonly step: Step;
  /** How far along the whole bar, 0 to 1; it never falls. */
  readonly fraction: number;
  /** The files being laid, once known. */
  readonly files: number | null;
}

export const startProgress = (source: Source, name: string, now: number): Progress => {
  const phase = PHASES[source][0]!;
  return { source, name, started: now, phase, step: { phase }, fraction: 0, files: null };
};

/** Where a phase's share of the bar begins. */
const startOf = (source: Source, phase: Phase) => {
  const phases = PHASES[source];
  return phases.slice(0, phases.indexOf(phase)).reduce((sum, p) => sum + PHASE_WEIGHTS[source][p]!, 0);
};

/** The progress after a step: a later phase or more done moves the bar on; nothing moves it back. */
export function advance(progress: Progress, step: Step): Progress {
  const phases = PHASES[progress.source];
  const at = phases.indexOf(step.phase);
  if (at < 0) return progress;
  if (at < phases.indexOf(progress.phase)) return progress;
  const share = step.of !== undefined && step.of > 0 ? Math.min(1, (step.done ?? 0) / step.of) : 0;
  const reached = startOf(progress.source, step.phase) + PHASE_WEIGHTS[progress.source][step.phase]! * share;
  return {
    ...progress,
    phase: step.phase,
    step,
    fraction: Math.max(progress.fraction, reached),
    files: step.files ?? progress.files,
  };
}

/** The whole bar: the load is done. */
export const finish = (progress: Progress): Progress => ({ ...progress, fraction: 1 });

/** True while the current phase counts towards a known total. */
export const determinate = ({ step }: Progress) => step.of !== undefined && step.of > 0;

const number = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string, many: string) => `${number(n)} ${n === 1 ? one : many}`;

const WORDS: Readonly<Record<Phase, string>> = {
  commit: "Asking GitHub for the latest commit",
  tree: "Reading the file tree",
  index: "Reading the git index",
  folder: "Reading the folder",
  manifests: "Reading workspace manifests",
  contents: "Reading the files",
  coverage: "Looking for coverage reports",
  lay: "Laying out the files",
  download: "Downloading",
  parse: "Reading the city",
  draw: "Drawing the map",
  engine: "Loading the physics engine",
  walls: "Raising the city’s walls",
};

/** What the load is, as the card's title: opening something, or going down into the city shown. */
export const titleWords = ({ source, name }: Progress): string =>
  source === "explore" ? `Going down into ${name}` : `Opening ${name}`;

/** The phase in words a person knows. */
export function phaseWords({ source, phase, files }: Progress): string {
  if (phase === "lay" && files !== null) return `Laying out ${plural(files, "file", "files")}`;
  if (phase === "download" && source === "file") return "Reading the file";
  return WORDS[phase];
}

/** Bytes in kB or MB, both counted in the unit of the larger. */
function bytes(done: number, of: number | undefined): string {
  const mega = (of ?? done) >= 1_000_000;
  const unit = mega ? "MB" : "kB";
  const say = (n: number) => (mega ? (n / 1_000_000).toFixed(1) : String(Math.round(n / 1000)));
  return of === undefined ? `${say(done)} ${unit}` : `${say(done)} of ${say(of)} ${unit}`;
}

/** What has been counted in the current phase, or null when nothing is. */
export function countWords({ phase, step }: Progress): string | null {
  const { done = 0, of, requests } = step;
  if (phase === "tree" && of !== undefined) {
    const read = `${number(done)} of ${number(of)} folders`;
    return requests === undefined ? read : `${read} · ${plural(requests, "request", "requests")}`;
  }
  if (phase === "folder") return `${plural(done, "file", "files")} found`;
  if (phase === "manifests" && of !== undefined) return `${number(done)} of ${number(of)} manifests`;
  if (phase === "contents" && of !== undefined) return `${number(done)} of ${number(of)} files`;
  if (phase === "lay") return step.count ? `${number(step.count.done)} of ${number(step.count.of)} lots` : null;
  if (phase === "download") return bytes(done, of);
  if (phase === "walls" && of !== undefined) return `${number(done)} of ${number(of)} buildings`;
  return null;
}

/** The time spent: "12 s", or "1 min 4 s". */
export function spentWords(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** The time left at the pace so far, once it is steady; null before, and once done. */
export function estimateWords({ fraction, started }: Progress, now: number): string | null {
  const spent = now - started;
  if (fraction < ESTIMATE_FROM || fraction >= 1 || spent < STEADY_MS) return null;
  const left = (spent * (1 - fraction)) / fraction / 1000;
  if (left < 5) return "a few seconds left";
  if (left < 20) return `about ${Math.round(left)} s left`;
  if (left < 60) return `about ${Math.round(left / 5) * 5} s left`;
  return `about ${Math.round(left / 60)} min left`;
}
