// Every opening becomes a city here: a snapshot laid with the CLI's default options and the chosen toggles (so the
// browser lays what `citymap --no-history --toggles=…` does), or a city file's text read; then the city's work is made
// beside it (its first look: a lot table and the whole city's scene) with its pick index. The city's worker runs this
// off the main thread, and stays with the city to make the rest; tests run it in place.
import {
  CitymapError,
  DEFAULT_LAND_USES,
  DEFAULT_SPLIT,
  initialState,
  layCity,
  type City,
  type ErrorCode,
  type LayProgress,
  type Options,
  type Snapshot,
  type Toggle,
} from "@citymap/ground-plan";
import { parseCityFile, type CityFile, type Measures, type Scales } from "@citymap/measures";
import { pickFrom, pickGrid, type ColourBy, type PickGrid, type PickIndex } from "@citymap/scene";
import type { ThemeName } from "@citymap/themes";
import type { OnStep, Step } from "../load/step";
import { liveMeasures, type LiveFacts } from "../measures/live";
import type { Roofs } from "../view/roofs";
import { herePort, type CityPort } from "./port";
import { cityWork, opening, type Answer, type CityWork, type Tasks } from "./work";

/** What every opening is given: the look to make first, a way to stop it, and an ear for its progress. */
export interface OpenOptions {
  /** Ends the opening: the worker is terminated and the promise rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Hears the work's progress as steps, then a `draw` step when it makes the first look. */
  readonly onProgress?: OnStep;
  /** The map theme to make the first look in. */
  readonly theme: ThemeName;
  /** The colour asked for (folder when the city cannot give it); folder when absent. */
  readonly colourBy?: ColourBy;
  /** The town shown, made with the first look (a city shown again in another layout); none when absent. */
  readonly town?: string | null;
}

export interface LayOptions extends OpenOptions {
  /** The layout toggles to lay with; the engine's defaults when absent. */
  readonly toggles?: readonly Toggle[];
  /** What the source knows of its files: the city's measures are built from it beside the layout. */
  readonly facts?: LiveFacts;
}

/**
 * What an opening hands back: the city, its measures (or null), its pick index, the legend's scales, every building's
 * floors, the opening's answers (its first lot table, the whole city's scene, the town asked for), and the city's port,
 * which goes on making every other town's scene and answers what is asked while the city is shown.
 */
export interface Laid {
  readonly city: City;
  readonly measures: Measures | null;
  readonly pick: PickIndex;
  readonly scales: Scales;
  readonly floors: Uint8Array;
  /** Every building's roof, named, for the Buildings view close up. */
  readonly roofs: Roofs;
  readonly answers: readonly Answer[];
  readonly port: CityPort;
}

/** A snapshot laid into a city. */
export type Lay = (snapshot: Snapshot, options: LayOptions) => Promise<Laid>;
/** A city file's text read into a city. */
export type Read = (text: string, options: OpenOptions) => Promise<Laid>;

/** What the work makes before the city reaches the main thread: its work, its pick grid, its first answers, the rest. */
export interface Made {
  readonly work: CityWork;
  readonly grid: PickGrid;
  readonly answers: readonly Answer[];
  readonly tasks: Tasks;
}

/** The CLI's defaults, with the toggles chosen (the engine's defaults when none are). */
export const liveOptions = (toggles?: readonly Toggle[]): Options => ({
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  loops: true,
  split: DEFAULT_SPLIT,
  ...(toggles ? { toggles } : {}),
});

/** The engine's progress as a step: placing and shaping each fill half the bar; the words count lots placed. */
export const layStep = ({ placed, shaped, lots }: LayProgress): Step => ({
  phase: "lay",
  done: placed + shaped,
  of: 2 * lots,
  count: { done: placed, of: lots },
});

/** `tell`, called at most once per `ms`; `flush` passes on the last call held back, if any. */
export function throttled<T>(tell: (value: T) => void, ms: number, now: () => number) {
  let last = -Infinity;
  let held: { value: T } | null = null;
  const call = (value: T) => {
    if (now() - last >= ms) {
      last = now();
      held = null;
      tell(value);
    } else held = { value };
  };
  call.flush = () => {
    if (held) tell(held.value);
    held = null;
  };
  return call;
}

/** The city's work and its first look (saying `draw` first), and the pick grid of a city file. */
function finish(file: CityFile, { onProgress, theme, colourBy = "folder", town = null }: OpenOptions): Made {
  onProgress?.({ phase: "draw" });
  const work = cityWork(file);
  const { answers, tasks } = opening(work, { ask: "look", theme, colourBy, first: town });
  return { work, grid: pickGrid(file.city), answers, tasks };
}

/** Lays a snapshot, with its measures when given what the source knows, and builds what goes with it. */
export function layMade(snapshot: Snapshot, options: LayOptions): Made {
  const { signal, onProgress, toggles, facts } = options;
  signal?.throwIfAborted();
  const tell = onProgress && ((progress: LayProgress) => onProgress(layStep(progress)));
  const settings = liveOptions(toggles);
  const { city, state } = layCity(snapshot, initialState(settings), settings, tell);
  const measures = facts ? liveMeasures(city, state.plat, snapshot, facts) : null;
  return finish({ city, measures }, options);
}

/** Reads a city file's text, validating it (its rejections are the file's), and builds what goes with it. */
export function readMade(text: string, options: OpenOptions): Made {
  options.signal?.throwIfAborted();
  options.onProgress?.({ phase: "parse" });
  return finish(parseCityFile(text), options);
}

/** What the main thread keeps of an opening: the city with its pick grid attached, and the port to its work. */
export const laidOf = (
  file: CityFile,
  made: {
    readonly grid: PickGrid;
    readonly floors: Uint8Array;
    readonly roofs: Roofs;
    readonly scales: Scales;
    readonly answers: readonly Answer[];
  },
  port: CityPort,
): Laid => {
  const { grid, floors, roofs, scales, answers } = made;
  return {
    city: file.city,
    measures: file.measures,
    pick: pickFrom(file.city, grid),
    scales,
    floors,
    roofs,
    answers,
    port,
  };
};

/** An opening made on the calling thread, its work kept there. */
const here = ({ work, grid, answers, tasks }: Made): Laid =>
  laidOf(
    work.file,
    { grid, floors: work.floors, roofs: work.roofs, scales: work.buildings.scales, answers },
    herePort(work, tasks),
  );

/** Lays on the calling thread: where no Worker exists, and in tests. */
export const layHere: Lay = async (snapshot, options) => here(layMade(snapshot, options));

/** Reads on the calling thread: where no Worker exists, and in tests. */
export const readHere: Read = async (text, options) => here(readMade(text, options));

/** A failure as the worker posts it: an engine's code and detail kept, so the main thread names it as before. */
export interface Failure {
  readonly code: ErrorCode | null;
  readonly message: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** A failure, ready to cross from the worker. */
export const failureOf = (error: unknown): Failure =>
  error instanceof CitymapError
    ? { code: error.code, message: error.message.slice(error.code.length + 2), detail: error.detail }
    : { code: null, message: error instanceof Error ? error.message : String(error), detail: {} };

/** The error a failure stood for: the engine's own, with its code and detail, else a plain error of its message. */
export const errorOf = ({ code, message, detail }: Failure): Error =>
  code === null ? new Error(message) : new CitymapError(code, message, detail);
