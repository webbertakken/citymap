// Every opening becomes a city here: a snapshot laid with the CLI's default options and the chosen toggles (so the
// browser lays what `citymap --no-history --toggles=…` does), or a city file's text read; then its scene and its pick
// index are built beside it. The layout worker runs this off the main thread; tests run it in place.
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
import { parseCityFile, type CityFile, type Measures } from "@citymap/measures";
import { buildScene, pickFrom, pickGrid, type PickGrid, type PickIndex, type Scene } from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import type { OnStep, Step } from "../load/step";
import { liveMeasures, type LiveFacts } from "../measures/live";

/** What every opening may be given: a way to stop it, an ear for its progress, and the theme to build its scene in. */
export interface OpenOptions {
  /** Ends the work: the worker is terminated and the promise rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Hears the work's progress as steps, then a `draw` step when it builds the scene. */
  readonly onProgress?: OnStep;
  /** The map theme to build the scene in, off the main thread; none builds no scene. */
  readonly theme?: ThemeName;
}

export interface LayOptions extends OpenOptions {
  /** The layout toggles to lay with; the engine's defaults when absent. */
  readonly toggles?: readonly Toggle[];
  /** What the source knows of its files: the city's measures are built from it beside the layout. */
  readonly facts?: LiveFacts;
}

/** A scene built in a theme, ready to draw while that theme is the map's. */
export interface Drawn {
  readonly theme: ThemeName;
  readonly scene: Scene;
}

/** What an opening hands back: the city, its measures (or null), its scene when a theme was given, its pick index. */
export interface Laid {
  readonly city: City;
  readonly measures: Measures | null;
  readonly scene: Drawn | null;
  readonly pick: PickIndex;
}

/** A snapshot laid into a city. */
export type Lay = (snapshot: Snapshot, options?: LayOptions) => Promise<Laid>;
/** A city file's text read into a city. */
export type Read = (text: string, options?: OpenOptions) => Promise<Laid>;

/** What the work makes before the city reaches the main thread: the city file, its scene, its pick grid. */
export interface Made {
  readonly file: CityFile;
  readonly scene: Drawn | null;
  readonly grid: PickGrid;
}

/** The buffers under a scene's layers, handed to the main thread without a copy. */
export const buffersOf = (scene: Scene): ArrayBuffer[] =>
  [
    ...scene.layers.flatMap((l) => [l.positions.buffer, l.colours.buffer, l.indices.buffer]),
    scene.buildings.positions.buffer,
    scene.buildings.lots.buffer,
    scene.buildings.facades.buffer,
    scene.buildings.indices.buffer,
  ].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);

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

/** The scene, when a theme was given (saying `draw` first), and the pick grid of a city file. */
function finish(file: CityFile, { onProgress, theme }: OpenOptions): Made {
  if (theme === undefined) return { file, scene: null, grid: pickGrid(file.city) };
  onProgress?.({ phase: "draw" });
  return { file, scene: { theme, scene: buildScene(file.city, THEMES[theme]) }, grid: pickGrid(file.city) };
}

/** Lays a snapshot, with its measures when given what the source knows, and builds what goes with it. */
export function layMade(snapshot: Snapshot, options: LayOptions = {}): Made {
  const { signal, onProgress, toggles, facts } = options;
  signal?.throwIfAborted();
  const tell = onProgress && ((progress: LayProgress) => onProgress(layStep(progress)));
  const settings = liveOptions(toggles);
  const { city, state } = layCity(snapshot, initialState(settings), settings, tell);
  const measures = facts ? liveMeasures(city, state.plat, snapshot, facts) : null;
  return finish({ city, measures }, options);
}

/** Reads a city file's text, validating it (its rejections are the file's), and builds what goes with it. */
export function readMade(text: string, options: OpenOptions = {}): Made {
  options.signal?.throwIfAborted();
  options.onProgress?.({ phase: "parse" });
  return finish(parseCityFile(text), options);
}

/** What the main thread keeps of the work: the city with its pick grid attached. */
export const laidOf = ({ file, scene, grid }: Made): Laid => ({
  city: file.city,
  measures: file.measures,
  scene,
  pick: pickFrom(file.city, grid),
});

/** Lays on the calling thread: where no Worker exists, and in tests. */
export const layHere: Lay = async (snapshot, options) => laidOf(layMade(snapshot, options));

/** Reads on the calling thread: where no Worker exists, and in tests. */
export const readHere: Read = async (text, options) => laidOf(readMade(text, options));

/**
 * A city file as plain JSON, for the hop from the worker to the main thread: the city file's keys, in the engine's
 * order rather than canonical (`serialiseCityFile`), at a tenth of the cost.
 */
export const wireText = ({ city, measures }: CityFile): string =>
  JSON.stringify(measures ? { ...city, measures } : city);

/**
 * A city file the worker has validated or laid, taken in without validating again: the schemas are strict and
 * transform nothing, so the parsed city equals the validated one, at a quarter of the cost on the main thread.
 */
export function trustedCityFile(text: string): CityFile {
  const parsed: City & { readonly measures?: Measures } = JSON.parse(text);
  const { measures, ...city } = parsed;
  return { city, measures: measures ?? null };
}

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
